'use client';

import { useConversation } from '@elevenlabs/react';
import { useCallback, useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2, Calendar as CalendarIcon, MapPin, Tag, Clock, Lock, Phone, Star, CheckCircle2, ExternalLink, ChevronRight } from 'lucide-react';

interface ProviderMatch {
  id: string;
  name: string;
  phone: string;
  rating: number;
  distance_miles: number;
  address: string;
  score: number;
}

export function VoiceAgent({ agentId }: { agentId: string }) {
  const [isGCalAuthenticated, setIsGCalAuthenticated] = useState(false);
  const [detectedService, setDetectedService] = useState('');
  const [detectedDate, setDetectedDate] = useState('');
  const [detectedTime, setDetectedTime] = useState('');
  const [detectedLocation, setDetectedLocation] = useState('');
  const [providers, setProviders] = useState<ProviderMatch[]>([]);
  const [confirmedBooking, setConfirmedBooking] = useState<any>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Use refs for state setters to keep the tool handler stable and avoid
  // re-creating the conversation hook config (which would disconnect the call)
  const setProvidersRef = useRef(setProviders);
  const setDetectedServiceRef = useRef(setDetectedService);
  const setDetectedDateRef = useRef(setDetectedDate);
  const setDetectedTimeRef = useRef(setDetectedTime);
  const setDetectedLocationRef = useRef(setDetectedLocation);
  const setConfirmedBookingRef = useRef(setConfirmedBooking);

  useEffect(() => {
    setProvidersRef.current = setProviders;
    setDetectedServiceRef.current = setDetectedService;
    setDetectedDateRef.current = setDetectedDate;
    setDetectedTimeRef.current = setDetectedTime;
    setDetectedLocationRef.current = setDetectedLocation;
    setConfirmedBookingRef.current = setConfirmedBooking;
  });

  // Stable tool handler that proxies client tool calls to the server API.
  // CRITICAL: Must return a string (not an object) to the ElevenLabs SDK.
  const handleToolCall = useCallback(async (toolName: string, parameters: any): Promise<string> => {
    try {
      const response = await fetch('/api/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_name: toolName, parameters }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[VoiceAgent] Tool "${toolName}" HTTP error:`, response.status, errText);
        return JSON.stringify({ error: `Server returned ${response.status}` });
      }

      const data = await response.json();
      const resultStr = data.result || '{}';
      // Parse to update UI state, but return the raw string to the SDK
      const result = JSON.parse(resultStr);

      if (toolName === 'search_providers' && result.top_matches) {
        setProvidersRef.current(result.top_matches);
        setDetectedServiceRef.current(result.search_criteria?.service_type || '');
        setDetectedDateRef.current(result.search_criteria?.date || '');
        setDetectedTimeRef.current(result.search_criteria?.time || '');
        setDetectedLocationRef.current(result.search_criteria?.location || '');
      }

      if (toolName === 'confirm_booking' && result.booking_confirmed) {
        setConfirmedBookingRef.current(result.details);
      }

      // Return the string directly — the SDK expects string | number | void
      return resultStr;
    } catch (error) {
      console.error(`[VoiceAgent] Tool "${toolName}" error:`, error);
      return JSON.stringify({ error: 'Client-side execution failed' });
    }
  }, []);

  // Initialize the ElevenLabs conversation hook with stable config.
  // All callbacks and clientTools references must remain stable across renders
  // to prevent the SDK from disconnecting/reconnecting.
  const conversation = useConversation({
    onConnect: () => {
      console.log('[VoiceAgent] Connected to ElevenLabs');
      setConnectionError(null);
    },
    onDisconnect: (details) => {
      console.log('[VoiceAgent] Disconnected:', details);
    },
    onError: (message, context) => {
      console.error('[VoiceAgent] SDK Error:', message, context);
      setConnectionError(typeof message === 'string' ? message : 'Connection error');
    },
    // Do NOT define onUnhandledClientToolCall — when defined, the SDK skips
    // sending any response, which stalls the agent indefinitely (burning quota).
    // Instead, unregistered tools automatically get an is_error response so the
    // agent can move on immediately.
    clientTools: {
      // No-op warmup handler: ElevenLabs may send this as a client tool call.
      // Returning immediately prevents a stalled response or unnecessary server round-trip.
      warmup: () => 'ok',
      search_providers: (params: any) => handleToolCall('search_providers', params),
      check_calendar_availability: (params: any) => handleToolCall('check_calendar_availability', params),
      initiate_provider_call: (params: any) => handleToolCall('initiate_provider_call', params),
      confirm_booking: (params: any) => handleToolCall('confirm_booking', params),
      swarm_call_providers: (params: any) => handleToolCall('swarm_call_providers', params),
    },
  });

  const startCall = useCallback(async () => {
    try {
      setConnectionError(null);

      // Do NOT call getUserMedia here — the SDK handles microphone access
      // internally with its own AudioContext, echo cancellation, noise
      // suppression, and gain control. Acquiring a separate stream here can
      // conflict with the SDK's audio pipeline and cause silent failures.

      const sessionId = await conversation.startSession({
        agentId,
        connectionType: 'websocket',
      });
      console.log('[VoiceAgent] Session started:', sessionId);
    } catch (error) {
      console.error('[VoiceAgent] Failed to start session:', error);
      setConnectionError(
        error instanceof Error ? error.message : 'Failed to start call'
      );
    }
  }, [conversation, agentId]);

  const endCall = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (error) {
      console.error('[VoiceAgent] Failed to end session:', error);
    }
  }, [conversation]);

  useEffect(() => {
    fetch('/api/calendar')
      .then(res => res.json())
      .then(data => setIsGCalAuthenticated(data.authenticated))
      .catch(() => setIsGCalAuthenticated(false));
  }, []);

  const hasData = detectedService || providers.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
      {/* TOP: Instruction Banner */}
      <div className="lg:col-span-12">
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5">
          <h3 className="text-[20px] font-semibold text-[var(--foreground)]">Book an appointment with your assistant</h3>
           <p className="text-[16px] text-[var(--muted)] mt-1.5">
             Structure your request like: <span className="text-[var(--foreground)]">&quot;Hey Alfred, I want to book a <strong>service (like dentist, car-wash, hairdresser, etc.)</strong> for <strong>(date and time like Feb 15, 2026 at 3pm)</strong>. I live in <strong>(area like Brighton, Boston)</strong> and show me <strong>providers</strong> within <strong>(distance like 5 miles)</strong>.&quot;</span>
           </p>
           <p className="text-[14px] text-[var(--muted)] mt-3 bg-[var(--background)] rounded-md px-4 py-3">
             <span className="text-[14px] font-medium uppercase tracking-wide text-[var(--muted)]">Example:</span><br />
             <span className="italic text-[14px] font-medium text-[var(--foreground)]">&quot;Hey Alfred, I want to book a dentist appointment for Feb 15, 2026 at 3pm. I live in Brighton, Boston and show me dentist providers within 5 miles.&quot;</span>
           </p>
        </div>
      </div>

      {/* Voice Assistant */}
      <div className="lg:col-span-4">
        <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5 h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-[var(--foreground)]">Voice Assistant</h2>
            <div className={`w-2 h-2 rounded-full ${conversation.status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-neutral-300'}`} />
          </div>

          {!isGCalAuthenticated ? (
            <a href="/api/auth/google" className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-[#4285F4] text-white rounded-md text-[13px] font-medium hover:bg-[#357ae8] transition-colors">
              <Lock className="w-4 h-4" /> Connect Google Calendar
            </a>
          ) : (
            <button
              onClick={conversation.status === 'connected' ? endCall : startCall}
              disabled={conversation.status === 'connecting'}
              aria-label={conversation.status === 'connected' ? 'End call' : 'Start call'}
              className={`flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-md text-[13px] font-medium text-white transition-all ${
                conversation.status === 'connected' ? 'bg-red-500 hover:bg-red-600' : 'bg-[#18181B] hover:bg-black'
              } disabled:opacity-50`}
            >
              {conversation.status === 'connecting' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : conversation.status === 'connected' ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
              {conversation.status === 'connecting' ? 'Connecting...' : conversation.status === 'connected' ? 'End Call' : 'Start Call'}
            </button>
          )}

          {connectionError && (
            <p className="mt-3 text-[12px] text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-md">
              {connectionError}
            </p>
          )}

          {/* Speech animation / status area */}
          <div className="flex-1 flex flex-col items-center justify-center text-center mt-6">
            <div className={`w-20 h-20 rounded-full bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center mb-5 transition-all ${conversation.status === 'connected' ? 'scale-110 border-green-200' : 'scale-100'}`}>
              {conversation.status === 'connected' ? (
                <div className="flex gap-1 items-end h-6">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="w-1.5 bg-green-500 rounded-full animate-bounce" style={{ height: '100%', animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              ) : (
                <Mic className="w-8 h-8 text-neutral-300" />
              )}
            </div>
            <h3 className="text-[16px] font-semibold text-[var(--foreground)]">
              {conversation.status === 'connected' ? 'Alfred is listening...' : 'Ready to help you book'}
            </h3>
            <p className="text-[13px] text-[var(--muted)] mt-2 max-w-[240px]">
              {conversation.status === 'connected'
                ? 'Tell Alfred what service you need and when you want it.'
                : 'Click the button to start a voice session with your booking assistant.'}
            </p>

            {confirmedBooking && (
              <div className="mt-6 p-4 bg-green-50 border border-green-100 rounded-lg animate-slide-up w-full">
                <div className="flex items-center gap-3 text-left">
                  <div className="bg-green-500 p-1.5 rounded-full"><CheckCircle2 className="w-4 h-4 text-white" /></div>
                  <div>
                    <p className="text-[13px] font-semibold text-green-900">Booking Confirmed</p>
                    <p className="text-[12px] text-green-700">{confirmedBooking.provider_name} @ {confirmedBooking.appointment_time}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Request Details */}
      <div className="lg:col-span-4">
        <div className={`bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-5 h-full transition-opacity ${hasData ? 'opacity-100' : 'opacity-60'}`}>
          <h3 className="text-[14px] font-semibold text-[var(--foreground)] mb-5 flex items-center gap-2">
            <Tag className="w-4 h-4 text-[var(--muted)]" /> Request Details
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2.5">
              <span className="text-[13px] text-[var(--muted)] flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> Service</span>
              <span className="text-[13px] font-medium text-[var(--foreground)]">{detectedService || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-2.5">
              <span className="text-[13px] text-[var(--muted)] flex items-center gap-2"><CalendarIcon className="w-3.5 h-3.5" /> Date</span>
              <span className="text-[13px] font-medium text-[var(--foreground)]">{detectedDate || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-2.5">
              <span className="text-[13px] text-[var(--muted)] flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Time</span>
              <span className="text-[13px] font-medium text-[var(--foreground)]">{detectedTime || '—'}</span>
            </div>
            <div className="flex justify-between items-center py-2.5">
              <span className="text-[13px] text-[var(--muted)] flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> Location</span>
              <span className="text-[13px] font-medium text-[var(--foreground)]">{detectedLocation || '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Providers */}
      <div className="lg:col-span-4">
        <div className={`bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 h-full transition-opacity ${providers.length > 0 ? 'opacity-100' : 'opacity-50'}`}>
          <h3 className="text-[13px] font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-[var(--muted)]" /> Top Providers
          </h3>
          <div className="space-y-3">
            {providers.length > 0 ? providers.slice(0, 4).map((p) => (
              <div key={p.id} className="p-3 border border-[var(--card-border)] rounded-lg hover:border-neutral-300 transition-colors group">
                <div className="flex justify-between items-start">
                  <p className="text-[13px] font-medium text-[var(--foreground)] truncate">{p.name}</p>
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-300 group-hover:text-neutral-500" />
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1 text-[11px] font-medium text-yellow-600">
                    <Star className="w-3 h-3 fill-yellow-600" /> {p.rating}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
                    <MapPin className="w-3 h-3" /> {p.distance_miles}mi
                  </div>
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-10 h-10 rounded-full bg-neutral-50 border border-dashed border-neutral-200 flex items-center justify-center mb-3">
                  <Phone className="w-4 h-4 text-neutral-300" />
                </div>
                <p className="text-[12px] text-neutral-400">Search results will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
