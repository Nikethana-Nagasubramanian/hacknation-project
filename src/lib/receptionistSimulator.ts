// src/lib/receptionistSimulator.ts
// Simulates receptionist responses for provider calls

import { Provider } from './schema';
import providersData from '@/data/directory.json';

export interface CallResult {
  success: boolean;
  providerId: string;
  providerName: string;
  message: string;
  bookedSlot?: string;
  alternativeSlots?: string[];
  waitTime: number; // simulated call duration in ms
  transcript: { role: 'receptionist' | 'alfred'; message: string; delay: number }[];
}

export interface ReceptionistPersonality {
  friendliness: 'friendly' | 'neutral' | 'busy';
  responseDelay: number; // ms
  availabilityRate: number; // 0-1, chance of slot being available
}

// Different receptionist personalities for variety
const PERSONALITIES: Record<string, ReceptionistPersonality> = {
  friendly: { friendliness: 'friendly', responseDelay: 1200, availabilityRate: 0.8 },
  neutral: { friendliness: 'neutral', responseDelay: 1800, availabilityRate: 0.6 },
  busy: { friendliness: 'busy', responseDelay: 2500, availabilityRate: 0.4 },
};

// Simulated conversation scripts
const SCRIPTS = {
  friendly: {
    greeting: "Good morning! Thank you for calling {providerName}, how can I help you today?",
    requestResponse: "Of course! Let me check our schedule for {slot}...",
    available: "Yes! We have that slot available. I'll book that for you right now.",
    unavailable: "I'm sorry, that specific time is taken. Would {alternative} work for you instead?",
    booked: "Perfect! You're all set for {slot}. We'll see you then!",
    noSlots: "Unfortunately, we're fully booked for that day. Can I put you on our waitlist?",
  },
  neutral: {
    greeting: "Hello, {providerName}. How may I assist you?",
    requestResponse: "One moment while I look at the calendar...",
    available: "Yes, that time is open. Shall I book it?",
    unavailable: "That slot is not available. We have {alternative} open.",
    booked: "Confirmed for {slot}. Is there anything else?",
    noSlots: "We don't have availability then. Would you like to try another day?",
  },
  busy: {
    greeting: "{providerName}, please hold... Okay, what do you need?",
    requestResponse: "Hold on... checking...",
    available: "Yeah, we can do that. Booking now.",
    unavailable: "No, that's taken. {alternative} is the only option.",
    booked: "Done. {slot}. Anything else?",
    noSlots: "Nothing available. Call back next week.",
  },
};

/**
 * Get provider by ID from the directory or handle synthetic providers
 */
export function getProvider(providerId: string): Provider | undefined {
  // Check local directory first
  const realProvider = (providersData.providers as Provider[]).find(p => p.id === providerId);
  if (realProvider) return realProvider;

  // Handle synthetic providers (generated on the fly for any category)
  if (providerId.startsWith('synth_')) {
    const parts = providerId.split('_');
    const category = parts[1] || 'service';
    const index = parts[2] || '01';
    
    // Reconstruct a realistic mock provider for the simulation
    return {
      id: providerId,
      name: index === '01' ? `${category.charAt(0).toUpperCase() + category.slice(1)} of Boston` : `Elite ${category.charAt(0).toUpperCase() + category.slice(1)} Care`,
      category: category as any,
      phone: index === '01' ? "+1-617-555-9901" : "+1-617-555-9902",
      rating: index === '01' ? 4.7 : 4.9,
      address: index === '01' ? "100 Main St, Boston, MA" : "250 Common Ave, Boston, MA",
      distanceMiles: index === '01' ? 0.5 : 1.2,
      availableSlots: (() => {
        // Build today/tomorrow date strings in the user's timezone (no UTC shift)
        const now = new Date();
        const todayStr = now.toLocaleDateString('sv-SE', { timeZone: SIMULATOR_TIMEZONE }); // "YYYY-MM-DD"
        const tom = new Date(now.getTime() + 86400000);
        const tomorrowStr = tom.toLocaleDateString('sv-SE', { timeZone: SIMULATOR_TIMEZONE });
        return [
          `${todayStr}T10:00:00`,
          `${todayStr}T14:30:00`,
          `${tomorrowStr}T09:00:00`
        ];
      })(),
      metadata: { notes: "Dynamically generated provider" }
    };
  }

  return undefined;
}

/**
 * Simulate a call to a provider's receptionist
 */
export async function simulateProviderCall(
  providerId: string,
  requestedSlot: string,
  serviceDescription?: string
): Promise<CallResult> {
  const provider = getProvider(providerId);
  const formattedRequestedSlot = formatSlot(requestedSlot);
  
  const transcript: CallResult['transcript'] = [];
  
  if (!provider) {
    return {
      success: false,
      providerId,
      providerName: 'Unknown',
      message: 'Provider not found in directory',
      waitTime: 500,
      transcript: [{ role: 'receptionist', message: 'Unknown provider', delay: 0 }]
    };
  }

  // Assign a random personality based on provider rating (higher rating = friendlier)
  const personalityType = provider.rating >= 4.5 ? 'friendly' : 
                          provider.rating >= 4.0 ? 'neutral' : 'busy';
  const personality = PERSONALITIES[personalityType];
  const scripts = SCRIPTS[personalityType];

  // 1. Greeting
  transcript.push({ 
    role: 'receptionist', 
    message: scripts.greeting.replace('{providerName}', provider.name), 
    delay: 500 
  });

  // 2. Alfred asks
  transcript.push({ 
    role: 'alfred', 
    message: `Hi, I'm calling to book a ${serviceDescription || 'appointment'} for ${formattedRequestedSlot}.`, 
    delay: 800 
  });

  // 3. Receptionist checks
  transcript.push({ 
    role: 'receptionist', 
    message: scripts.requestResponse.replace('{slot}', formattedRequestedSlot), 
    delay: personality.responseDelay 
  });

  // Check if requested slot is in provider's available slots
  const requestedDate = new Date(requestedSlot);
  const requestedTime = requestedDate.getTime();
  
  // LOGIC FIX: If the requested time is between 10 PM and 7 AM, it's never available
  const hour = requestedDate.getHours();
  const isAfterHours = hour >= 22 || hour <= 7;

  const availableSlot = isAfterHours ? null : provider.availableSlots.find(slot => {
    const slotTime = new Date(slot).getTime();
    // Allow 60-minute flexibility instead of 30 for better success rate
    return Math.abs(slotTime - requestedTime) <= 60 * 60 * 1000;
  });

  // Random availability factor for realism - boosted for better UX
  const isAvailable = !!availableSlot && Math.random() < (personality.availabilityRate + 0.1);

  if (isAvailable && availableSlot) {
    // 4. Success
    transcript.push({ role: 'receptionist', message: scripts.available, delay: 1000 });
    transcript.push({ role: 'alfred', message: "That sounds perfect. Please confirm the booking.", delay: 500 });
    transcript.push({ role: 'receptionist', message: scripts.booked.replace('{slot}', formatSlot(availableSlot)), delay: 800 });

    return {
      success: true,
      providerId,
      providerName: provider.name,
      message: scripts.booked.replace('{slot}', formatSlot(availableSlot)),
      bookedSlot: availableSlot.replace('Z', ''),
      waitTime: transcript.reduce((sum, t) => sum + t.delay, 0),
      transcript
    };
  } else if (provider.availableSlots.length > 0) {
    // 4. Alternatives - Ensure alternative is during business hours
    let alternative = provider.availableSlots[0].replace('Z', '');
    
    // If the first available slot is at night, pick a better one (10 AM same day)
    const clean = alternative.replace(/(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/, '');
    const [altDatePart] = clean.split('T');
    const altTimePart = clean.includes('T') ? clean.split('T')[1] : '00:00:00';
    const altHour = parseInt(altTimePart.split(':')[0]);
    if (altHour < 8 || altHour > 18) {
      alternative = `${altDatePart}T10:00:00`;
    }

    transcript.push({ role: 'receptionist', message: scripts.unavailable.replace('{alternative}', formatSlot(alternative)), delay: 1000 });
    transcript.push({ role: 'alfred', message: "Let me check with the user and get back to you.", delay: 500 });

    return {
      success: false,
      providerId,
      providerName: provider.name,
      message: scripts.unavailable.replace('{alternative}', formatSlot(alternative)),
      alternativeSlots: [alternative],
      waitTime: transcript.reduce((sum, t) => sum + t.delay, 0),
      transcript
    };
  } else {
    // 4. No availability
    transcript.push({ role: 'receptionist', message: scripts.noSlots, delay: 1000 });

    return {
      success: false,
      providerId,
      providerName: provider.name,
      message: scripts.noSlots,
      waitTime: transcript.reduce((sum, t) => sum + t.delay, 0),
      transcript
    };
  }
}

/**
 * Simulate parallel calls to multiple providers (Swarm Mode)
 */
export async function simulateSwarmCalls(
  providerIds: string[],
  preferredTimeRange: { start: string; end: string },
  serviceDescription?: string
): Promise<{
  results: CallResult[];
  bestMatch: CallResult | null;
  totalDuration: number;
}> {
  const startTime = Date.now();
  
  // Call all providers in parallel
  const callPromises = providerIds.map(async (providerId, index) => {
    // Stagger calls slightly for realism
    await delay(index * 200);
    
    // Try to book within the preferred time range
    const provider = getProvider(providerId);
    if (!provider) {
      return {
        success: false,
        providerId,
        providerName: 'Unknown',
        message: 'Provider not found',
        waitTime: 500,
      } as CallResult;
    }

    // Find a slot within the time range
    const rangeStart = new Date(preferredTimeRange.start).getTime();
    const rangeEnd = new Date(preferredTimeRange.end).getTime();
    
    const matchingSlot = provider.availableSlots.find(slot => {
      const slotTime = new Date(slot).getTime();
      return slotTime >= rangeStart && slotTime <= rangeEnd;
    });

    if (matchingSlot) {
      return simulateProviderCall(providerId, matchingSlot, serviceDescription);
    } else {
      return simulateProviderCall(providerId, preferredTimeRange.start, serviceDescription);
    }
  });

  const results = await Promise.all(callPromises);
  const totalDuration = Date.now() - startTime;

  // Find the best successful result (earliest slot from highest-rated provider)
  const successfulResults = results.filter(r => r.success);
  
  let bestMatch: CallResult | null = null;
  if (successfulResults.length > 0) {
    bestMatch = successfulResults.reduce((best, current) => {
      const bestProvider = getProvider(best.providerId);
      const currentProvider = getProvider(current.providerId);
      
      if (!bestProvider || !currentProvider) return best;
      
      // Prefer earlier slots, then higher ratings
      const bestTime = new Date(best.bookedSlot!).getTime();
      const currentTime = new Date(current.bookedSlot!).getTime();
      
      if (currentTime < bestTime) return current;
      if (currentTime === bestTime && currentProvider.rating > bestProvider.rating) return current;
      return best;
    });
  }

  return { results, bestMatch, totalDuration };
}

// Helper functions
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const SIMULATOR_TIMEZONE = process.env.USER_TIMEZONE || 'America/New_York';

function formatSlot(isoString: string): string {
  // The bare datetime strings are already in the user's local timezone.
  // Stash them in a UTC Date and format with timeZone:'UTC' so the raw
  // numbers display unchanged.  Using SIMULATOR_TIMEZONE would subtract
  // the offset a second time (e.g. 10 AM → 5 AM for EST).
  const clean = isoString.replace(/(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/, '');
  const [datePart, timePart = '00:00:00'] = clean.split('T');
  const [y, mon, d] = datePart.split('-').map(Number);
  const [h, m, s] = timePart.split(':').map(Number);
  const utcDate = new Date(Date.UTC(y, mon - 1, d, h, m, s || 0));
  return utcDate.toLocaleString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get transcript of a simulated call for display
 */
export function generateCallTranscript(
  provider: Provider,
  result: CallResult
): string[] {
  const personalityType = provider.rating >= 4.5 ? 'friendly' : 
                          provider.rating >= 4.0 ? 'neutral' : 'busy';
  const scripts = SCRIPTS[personalityType];
  
  const transcript: string[] = [
    `📞 Calling ${provider.name}...`,
    `🔔 Ringing...`,
    `👋 Receptionist: "${scripts.greeting.replace('{providerName}', provider.name)}"`,
    `🤖 Alfred: "Hi, I'm calling to book an appointment for a patient."`,
  ];

  if (result.success) {
    transcript.push(
      `👋 Receptionist: "${scripts.available}"`,
      `🤖 Alfred: "Yes, please book that slot."`,
      `👋 Receptionist: "${result.message}"`,
      `✅ Call completed - Appointment confirmed!`
    );
  } else if (result.alternativeSlots && result.alternativeSlots.length > 0) {
    transcript.push(
      `👋 Receptionist: "${result.message}"`,
      `🤖 Alfred: "Let me check with my client and get back to you."`,
      `📵 Call ended - Alternative times offered`
    );
  } else {
    transcript.push(
      `👋 Receptionist: "${result.message}"`,
      `📵 Call ended - No availability`
    );
  }

  return transcript;
}

