// src/app/api/elevenlabs/route.ts
// Webhook handler for ElevenLabs Agentic Functions (Tool Calling)

import { NextRequest, NextResponse } from 'next/server';
import { rankProviders } from '@/lib/rankingLogic';
import { Provider, AppointmentIntent } from '@/lib/schema';
import { simulateProviderCall, simulateSwarmCalls, getProvider } from '@/lib/receptionistSimulator';
import { oauth2Client, createCalendarEvent } from '@/lib/googleCalendar';
import { cookies } from 'next/headers';
import providersData from '@/data/directory.json';

// ── Timezone Configuration ──────────────────────────────────────────────────
// The user's local timezone. All times the agent speaks/sends are interpreted
// in this zone.  Set USER_TIMEZONE in .env to override (e.g. "America/Chicago").
const USER_TIMEZONE = process.env.USER_TIMEZONE || 'America/New_York';

/**
 * Strip any trailing 'Z', milliseconds, or UTC offset from a datetime string
 * so it can be paired with a timeZone field for the Google Calendar API.
 * e.g. "2026-02-09T10:00:00.000Z"  →  "2026-02-09T10:00:00"
 *      "2026-02-09T10:00:00-05:00" →  "2026-02-09T10:00:00"
 */
function stripTzSuffix(dt: string): string {
  return dt.replace(/(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/, '');
}

/**
 * Add `hours` to a bare local-datetime string ("YYYY-MM-DDTHH:mm:ss") without
 * converting through the system timezone.  Uses UTC arithmetic internally so
 * the server's own TZ never leaks in.
 */
function addHoursLocal(localDT: string, hours: number): string {
  const [datePart, timePart = '00:00:00'] = localDT.split('T');
  const [y, mon, d] = datePart.split('-').map(Number);
  const [h, m, s] = timePart.split(':').map(Number);
  const utc = new Date(Date.UTC(y, mon - 1, d, h + hours, m, s || 0));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}:${pad(utc.getUTCSeconds())}`;
}

/**
 * Convert a bare local-datetime string (in USER_TIMEZONE) to a proper
 * RFC 3339 / UTC string for APIs that require absolute timestamps
 * (e.g. Google Calendar events.list timeMin/timeMax).
 */
function localToUTC(localDT: string): string {
  const clean = stripTzSuffix(localDT);
  const [datePart, timePart = '00:00:00'] = clean.split('T');
  const [y, mon, d] = datePart.split('-').map(Number);
  const [h, m, s] = timePart.split(':').map(Number);

  // Create a UTC probe from the raw numbers
  const probeUtcMs = Date.UTC(y, mon - 1, d, h, m, s || 0);

  // See how USER_TIMEZONE renders that UTC moment → derive the offset
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: USER_TIMEZONE,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  }).formatToParts(new Date(probeUtcMs));
  const g = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0');
  let rH = g('hour'); if (rH === 24) rH = 0;
  const renderedMs = Date.UTC(g('year'), g('month') - 1, g('day'), rH, g('minute'), g('second'));
  const offsetMs = renderedMs - probeUtcMs; // negative for zones behind UTC

  // Actual UTC = probe minus the offset (e.g. 10 AM EST → 10 - (-5h) = 15:00 UTC)
  return new Date(probeUtcMs - offsetMs).toISOString();
}

/**
 * Human-readable date/time display in the user's timezone.
 */
function formatForUser(dt: string): string {
  // The bare datetime strings flowing through the pipeline are already in the
  // user's local timezone (e.g. "2026-02-15T10:00:00" means 10 AM local).
  // We stash them in a UTC Date and then format with timeZone:'UTC' so the
  // numbers pass through unchanged.  Using USER_TIMEZONE here would subtract
  // the offset a second time (e.g. 10 AM → 5 AM for EST).
  const clean = stripTzSuffix(dt);
  const [datePart, timePart = '00:00:00'] = clean.split('T');
  const [y, mon, d] = datePart.split('-').map(Number);
  const [h, m, s] = timePart.split(':').map(Number);
  const utcDate = new Date(Date.UTC(y, mon - 1, d, h, m, s || 0));
  return utcDate.toLocaleString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// In-memory session store (use Redis/DB in production)
const bookingSessions = new Map<string, {
  intent: AppointmentIntent;
  rankedProviders: Provider[];
  currentCallIndex: number;
  bookedProvider?: Provider;
  bookedSlot?: string;
}>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('📥 ElevenLabs Tool Call:', JSON.stringify(body, null, 2));

    // ElevenLabs sends tool calls in this format
    const { tool_name, tool_call_id, parameters } = body;

    if (!tool_name) {
      return NextResponse.json({ error: 'Missing tool_name' }, { status: 400 });
    }

    let result: any;

    switch (tool_name) {
      case 'search_providers':
        result = await handleSearchProviders(parameters);
        break;
      
      case 'check_calendar_availability':
        result = await handleCheckCalendar(parameters, req);
        break;
      
      case 'initiate_provider_call':
        result = await handleProviderCall(parameters);
        break;
      
      case 'confirm_booking':
        result = await handleConfirmBooking(parameters, req);
        break;
      
      case 'swarm_call_providers':
        result = await handleSwarmCalls(parameters);
        break;
      
      case 'warmup':
        // ElevenLabs sends a warmup tool call to verify the webhook is reachable.
        // Acknowledge it immediately instead of returning an error.
        result = { status: 'ok', message: 'Webhook is ready' };
        break;

      default:
        console.warn(`⚠️ Unknown tool call: ${tool_name}`);
        result = { error: `Unknown tool: ${tool_name}` };
    }

    // Return response in ElevenLabs expected format
    return NextResponse.json({
      tool_call_id,
      result: JSON.stringify(result),
    });

  } catch (error) {
    console.error('❌ ElevenLabs API Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * Handle search_providers tool call
 */
/**
 * Handle search_providers tool call
 */
async function handleSearchProviders(params: {
  service_type?: string;
  preferred_date?: string;
  preferred_time?: string;
  location?: string;
  max_distance_miles?: number;
}) {
  console.log('--- SEARCH TOOL TRIGGERED ---');
  console.log('Params received:', params);

  // Use session fallback for missing parameters
  const lastSession = Array.from(bookingSessions.values()).pop();
  
  const service_type = params.service_type || lastSession?.intent.serviceType || 'general service';
  const preferred_date = params.preferred_date || lastSession?.intent.preferredTimeRange.start.split('T')[0] || new Date().toISOString().split('T')[0];
  const preferred_time = params.preferred_time || (lastSession?.intent.preferredTimeRange.start?.includes('T') ? lastSession.intent.preferredTimeRange.start.split('T')[1].substring(0, 5) : '14:00');
  const location = params.location || lastSession?.intent.userLocation || 'Boston';
  const max_distance_miles = Number(params.max_distance_miles) || 10;

  console.log(`🚀 FORCING SEARCH: ${service_type} | ${preferred_date} | ${preferred_time}`);

  // Build the appointment intent — keep everything as bare local datetimes
  // (no Z/offset) so they stay in the user's timezone throughout the pipeline.
  const startStr = `${preferred_date}T${preferred_time}:00`;
  const endStr = addHoursLocal(startStr, 2);

  const intent: AppointmentIntent = {
    userId: 'voice_user',
    serviceType: service_type,
    userLocation: location,
    preferredTimeRange: { 
      start: startStr,
      end: endStr,
    },
    maxDistanceMiles: max_distance_miles,
    status: 'searching',
  };

  let providers: Provider[] = [];
  let apiSource = 'local';

  // Try Google Places API if key is available
  const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (mapsApiKey && location) {
    try {
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(`${service_type} near ${location}`)}&key=${mapsApiKey}`;
      
      // Use AbortController to set a strict timeout for the Google API call
      // This prevents the whole tool call from timing out on the ElevenLabs side
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second timeout

      const res = await fetch(searchUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      const data = await res.json();

      if (data.status === 'OK' && data.results && data.results.length > 0) {
        apiSource = 'google';
        providers = data.results.map((place: any) => {
          const dateOnly = preferred_date;
          const hours = parseInt(preferred_time.split(':')[0]);
          // Next-day date without going through Date → toISOString (avoids UTC shift)
          const nextDay = addHoursLocal(`${dateOnly}T12:00:00`, 24).split('T')[0];
          
          return {
            id: place.place_id,
            name: place.name,
            phone: place.formatted_phone_number || '+1-555-000-0000',
            category: service_type as any,
            rating: place.rating || 0,
            address: place.formatted_address,
            distanceMiles: 1.0, 
            availableSlots: [
              `${dateOnly}T${String(hours + 1).padStart(2, '0')}:00:00`,
              `${nextDay}T10:00:00`
            ],
            metadata: {
              notes: `Found via Google Maps: ${place.user_ratings_total || 0} reviews`
            }
          };
        });
      } else if (data.status === 'REQUEST_DENIED') {
        console.error('❌ Google Maps API Error: Request Denied. Check if Places API is enabled.');
      }
    } catch (err) {
      console.error('Google Places API Error:', err);
    }
  }

  // Fallback to local providers if Google Places returned nothing
  if (providers.length === 0) {
    const allProviders = (providersData.providers as any[]) as Provider[];
    
    // Map common terms to categories
    const categoryMap: Record<string, string> = {
      'dentist': 'dentist',
      'dental': 'dentist',
      'teeth': 'dentist',
      'hairdresser': 'hairdresser',
      'hair': 'hairdresser',
      'salon': 'hairdresser',
      'haircut': 'hairdresser',
      'mechanic': 'car_repair',
      'car': 'car_repair',
      'auto': 'car_repair',
      'physical therapy': 'physical_therapy',
      'physio': 'physical_therapy',
      'pt': 'physical_therapy',
    };

    const normalizedType = service_type.toLowerCase();
    const category = categoryMap[normalizedType] || normalizedType;

    const filteredProviders = allProviders.filter(p => 
      p.category.toLowerCase() === category ||
      p.category.toLowerCase().replace('_', ' ') === normalizedType ||
      p.name.toLowerCase().includes(normalizedType)
    );

    if (filteredProviders.length > 0) {
      providers = filteredProviders;
    } else {
      // If still no results, generate synthetic providers for the requested category
      // This allows the agent to search for ANY category (restaurants, bowling, etc.)
      console.log(`✨ Generating synthetic providers for: ${service_type}`);
      const capitalizedType = service_type.charAt(0).toUpperCase() + service_type.slice(1);
      const dateOnly = preferred_date;
      const hours = parseInt(preferred_time.split(':')[0]);
      const nextDay = addHoursLocal(`${dateOnly}T12:00:00`, 24).split('T')[0];

      providers = [
        {
          id: `synth_${normalizedType}_01`,
          name: `${capitalizedType} of ${location}`,
          phone: "+1-617-555-9901",
          category: service_type as any,
          rating: 4.7,
          address: `100 Main St, ${location}, MA`,
          distanceMiles: 0.5,
          availableSlots: [
            `${dateOnly}T${String(hours).padStart(2, '0')}:30:00`,
            `${dateOnly}T${String(hours + 2).padStart(2, '0')}:00:00`
          ],
          metadata: { notes: "Highly recommended for " + service_type }
        },
        {
          id: `synth_${normalizedType}_02`,
          name: `Elite ${capitalizedType} Care`,
          phone: "+1-617-555-9902",
          category: service_type as any,
          rating: 4.9,
          address: `250 Common Ave, ${location}, MA`,
          distanceMiles: 1.2,
          availableSlots: [
            `${dateOnly}T${String(hours + 1).padStart(2, '0')}:00:00`,
            `${nextDay}T10:00:00`
          ],
          metadata: { notes: "Top rated " + service_type + " in the area" }
        }
      ];
    }
  }

  const rankedProviders = rankProviders(providers, intent);

  // Store in session for subsequent calls
  const sessionId = `session_${Date.now()}`;
  bookingSessions.set(sessionId, {
    intent,
    rankedProviders: rankedProviders as any,
    currentCallIndex: 0,
  });

  // Return top 5 matches
  const topMatches = rankedProviders.slice(0, 5).map(p => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    rating: p.rating,
    distance_miles: p.distanceMiles,
    address: p.address,
    score: p.finalScore,
    available_slots: p.matchingSlots.map(s => formatForUser(s)),
    metadata: p.metadata,
  }));

  return {
    session_id: sessionId,
    total_found: rankedProviders.length,
    search_criteria: {
      service_type: service_type,
      date: preferred_date,
      time: preferred_time,
      location: location || 'Boston area',
    },
    top_matches: topMatches,
    recommendation: topMatches.length > 0 
      ? `I recommend ${topMatches[0].name} - they have a ${topMatches[0].rating} star rating.`
      : 'No providers found matching your criteria.',
  };
}

/**
 * Handle check_calendar_availability tool call
 */
async function handleCheckCalendar(
  params: { start_time: string; end_time: string },
  req: NextRequest
) {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get('google_calendar_token');

  if (!tokenCookie) {
    return {
      available: true, // Assume available if not authenticated
      authenticated: false,
      message: 'Calendar not connected - assuming time is available',
    };
  }

  try {
    const { google } = await import('googleapis');
    const tokens = JSON.parse(tokenCookie.value);
    oauth2Client.setCredentials(tokens);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Convert user-local times to UTC for the Calendar query
    const timeMin = localToUTC(params.start_time);
    const timeMax = localToUTC(params.end_time);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
    });

    const events = response.data.items || [];
    const hasConflict = events.length > 0;

    return {
      available: !hasConflict,
      authenticated: true,
      conflicts: events.map(e => ({
        title: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
      })),
      message: hasConflict 
        ? `You have ${events.length} event(s) during this time: ${events.map(e => e.summary).join(', ')}`
        : 'This time slot is free on your calendar.',
    };
  } catch (error) {
    console.error('Calendar check error:', error);
    return {
      available: true, // Fail open
      authenticated: true,
      error: 'Could not check calendar',
    };
  }
}

/**
 * Handle initiate_provider_call tool call
 */
async function handleProviderCall(params: {
  provider_id: string;
  requested_slot: string;
  service_description?: string;
}) {
  const { provider_id, requested_slot, service_description } = params;

  console.log(`📞 Initiating call to provider ${provider_id} for slot ${requested_slot}`);

  const result = await simulateProviderCall(
    provider_id,
    requested_slot,
    service_description
  );

  const provider = getProvider(provider_id);

  return {
    call_completed: true,
    success: result.success,
    provider: {
      id: provider_id,
      name: result.providerName,
      phone: provider?.phone,
      address: provider?.address,
    },
    requested_slot: formatForUser(requested_slot),
    booked_slot: result.bookedSlot ? formatForUser(result.bookedSlot) : null,
    booked_slot_iso: result.bookedSlot ? stripTzSuffix(result.bookedSlot) : null,
    alternative_slots: result.alternativeSlots?.map(s => ({
      display: formatForUser(s),
      iso: stripTzSuffix(s),
    })),
    receptionist_response: result.message,
    call_duration_ms: result.waitTime,
    next_action: result.success 
      ? 'Use confirm_booking to finalize and add to calendar'
      : result.alternativeSlots?.length 
        ? 'Ask user about alternative slots or try next provider'
        : 'Try the next provider in the list',
  };
}

/**
 * Handle confirm_booking tool call
 */
async function handleConfirmBooking(
  params: {
    provider_id: string;
    provider_name: string;
    booked_slot: string;
    service_type: string;
    location?: string;
    notes?: string;
  },
  req: NextRequest
) {
  const { provider_id, provider_name, booked_slot, service_type, location, notes } = params;

  const provider = getProvider(provider_id);
  const providerAddress = location || provider?.address || 'Address TBD';

  // Try to create calendar event
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get('google_calendar_token');

  let calendarEvent = null;
  let calendarError = null;

  if (tokenCookie) {
    try {
      const tokens = JSON.parse(tokenCookie.value);
      oauth2Client.setCredentials(tokens);

      // Keep times as bare local datetimes + explicit timezone so the
      // Google Calendar API places the event in the user's timezone,
      // NOT in UTC (which was causing the 5-hour shift).
      const startTime = stripTzSuffix(booked_slot);
      const endTime = addHoursLocal(startTime, 1);

      calendarEvent = await createCalendarEvent(oauth2Client, {
        summary: `${service_type} Appointment - ${provider_name}`,
        location: providerAddress,
        description: `Booked by Alfred AI Assistant.\n\nProvider: ${provider_name}\nPhone: ${provider?.phone || 'N/A'}\n\n${notes || ''}`,
        startTime,
        endTime,
        timeZone: USER_TIMEZONE,
      });
    } catch (error) {
      console.error('Calendar event creation failed:', error);
      calendarError = 'Could not add to calendar';
    }
  }

  return {
    booking_confirmed: true,
    details: {
      provider_name,
      provider_id,
      provider_phone: provider?.phone,
      provider_address: providerAddress,
      appointment_time: formatForUser(booked_slot),
      appointment_time_iso: stripTzSuffix(booked_slot),
      service_type,
      notes,
    },
    calendar: calendarEvent ? {
      added: true,
      event_id: (calendarEvent as any).id,
      html_link: (calendarEvent as any).htmlLink,
    } : {
      added: false,
      reason: calendarError || 'Calendar not connected',
    },
    confirmation_message: `Your ${service_type} appointment at ${provider_name} is confirmed for ${formatForUser(booked_slot)}. ${calendarEvent ? "I've added it to your Google Calendar." : ''}`,
  };
}

/**
 * Handle swarm_call_providers tool call (parallel calling)
 */
async function handleSwarmCalls(params: {
  provider_ids: string[];
  preferred_time_range: { start: string; end: string };
  service_description?: string;
}) {
  const { provider_ids, preferred_time_range, service_description } = params;

  console.log(`🐝 Swarm Mode: Calling ${provider_ids.length} providers in parallel`);

  const { results, bestMatch, totalDuration } = await simulateSwarmCalls(
    provider_ids,
    preferred_time_range,
    service_description
  );

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return {
    swarm_completed: true,
    total_calls: provider_ids.length,
    successful_bookings: successCount,
    failed_or_unavailable: failCount,
    total_duration_ms: totalDuration,
    results: results.map(r => ({
      provider_id: r.providerId,
      provider_name: r.providerName,
      success: r.success,
      booked_slot: r.bookedSlot ? formatForUser(r.bookedSlot) : null,
      booked_slot_iso: r.bookedSlot ? stripTzSuffix(r.bookedSlot) : null,
      message: r.message,
    })),
    best_match: bestMatch ? {
      provider_id: bestMatch.providerId,
      provider_name: bestMatch.providerName,
      booked_slot: formatForUser(bestMatch.bookedSlot!),
      booked_slot_iso: stripTzSuffix(bestMatch.bookedSlot!),
    } : null,
    recommendation: bestMatch
      ? `I was able to book at ${bestMatch.providerName} for ${formatForUser(bestMatch.bookedSlot!)}. This was the earliest available slot.`
      : 'Unfortunately, none of the providers had availability in your preferred time range. Would you like to try different times?',
    next_action: bestMatch
      ? 'Use confirm_booking to finalize the best match and add to calendar'
      : 'Expand time range or try different providers',
  };
}

