'use client';

import { useConversation } from '@elevenlabs/react';
import { useCallback, useState, useEffect } from 'react';
import { Mic, MicOff, Loader2, Calendar as CalendarIcon, MapPin, Tag, Clock, Lock, Phone, Star, CheckCircle2, ExternalLink } from 'lucide-react';

interface ProviderMatch {
  id: string;
  name: string;
  phone: string;
  rating: number;
  distance_miles: number;
  address: string;
  score: number;
}

interface ToolCallResult {
  toolName: string;
  status: 'pending' | 'success' | 'error';
  data?: any;
}

interface TranscriptLine {
  role: 'receptionist' | 'alfred';
  message: string;
}

export function VoiceAgent({ agentId }: { agentId: string }) {
  const [isBooking, setIsBooking] = useState(false);
  const [detectedService, setDetectedService] = useState('');
  const [detectedDate, setDetectedDate] = useState('');
  const [detectedTime, setDetectedTime] = useState('');
  const [detectedLocation, setDetectedLocation] = useState('');
  const [isCalendarSyncing, setIsCalendarSyncing] = useState(false);
  const [calendarSyncSuccess, setCalendarSyncSuccess] = useState(false);
  const [isGCalAuthenticated, setIsGCalAuthenticated] = useState(false);
  
  // New state for tool-based booking flow
  const [providers, setProviders] = useState<ProviderMatch[]>([]);
  const [currentCallProvider, setCurrentCallProvider] = useState<ProviderMatch | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<{
    providerName: string;
    time: string;
    calendarAdded: boolean;
    calendarLink?: string;
  } | null>(null);
  const [lastToolCall, setLastToolCall] = useState<ToolCallResult | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptLine[]>([]);
  
  // Check Google Auth state on mount
  useEffect(() => {
    fetch('/api/calendar')
      .then(res => res.json())
      .then(data => setIsGCalAuthenticated(data.authenticated))
      .catch(err => console.error('Auth check failed:', err));
  }, []);

  // Client-side tool handler for ElevenLabs
  const handleToolCall = useCallback(async (toolName: string, parameters: any) => {
    console.log(`🔧 Tool call: ${toolName}`, parameters);
    setLastToolCall({ toolName, status: 'pending' });

    try {
      const response = await fetch('/api/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: toolName,
          parameters,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Server error');
      }

      const data = await response.json();
      const result = JSON.parse(data.result || '{}');
      
      console.log(`✅ Tool result for ${toolName}:`, result);
      
      // If the tool returned an error string, tell Alfred so he can stop looping
      if (result.error) {
        setLastToolCall({ toolName, status: 'error', data: result });
        return { error: `Command failed: ${result.error}. Please tell the user exactly what went wrong.` };
      }

      setLastToolCall({ toolName, status: 'success', data: result });

      // Update UI based on tool results
      switch (toolName) {
        case 'search_providers':
          if (result.top_matches) {
            setProviders(result.top_matches);
            setDetectedService(result.search_criteria?.service_type || '');
            setDetectedDate(result.search_criteria?.date || '');
            setDetectedTime(result.search_criteria?.time || '');
            setDetectedLocation(result.search_criteria?.location || '');
          }
          break;

        case 'initiate_provider_call':
          setIsBooking(true);
          setLiveTranscript([]); // Reset transcript
          const provider = providers.find(p => p.id === parameters.provider_id);
          if (provider) {
            setCurrentCallProvider(provider);
            
            // Show transcript lines with delay to simulate live call
            if (result.transcript) {
              let cumulativeDelay = 0;
              result.transcript.forEach((line: any) => {
                cumulativeDelay += line.delay;
                setTimeout(() => {
                  setLiveTranscript(prev => [...prev, { role: line.role, message: line.message }]);
                }, cumulativeDelay);
              });
            }
          }
          if (result.success && result.booked_slot) {
            setDetectedTime(result.booked_slot);
          }
          break;

        case 'confirm_booking':
          if (result.booking_confirmed) {
            setConfirmedBooking({
              providerName: result.details?.provider_name || '',
              time: result.details?.appointment_time || '',
              calendarAdded: result.calendar?.added || false,
              calendarLink: result.calendar?.html_link,
            });
            setCalendarSyncSuccess(result.calendar?.added || false);
          }
          break;

        case 'swarm_call_providers':
          setIsBooking(true);
          setLiveTranscript([]);
          if (result.best_match) {
            setConfirmedBooking({
              providerName: result.best_match.provider_name,
              time: result.best_match.booked_slot,
              calendarAdded: false,
            });
          }
          break;
      }

      return result;
    } catch (error) {
      console.error(`❌ Tool error:`, error);
      setLastToolCall({ toolName, status: 'error' });
      return { error: 'Tool execution failed' };
    }
  }, [providers]);

  const conversation = useConversation({
    onMessage: (message) => {
      console.log('Message from agent:', message);
      
      const text = message.message?.toLowerCase() || '';
      
      // LIVE UI SYNC: Detect details from speech even before tools fire
      if (text.includes('dentist')) setDetectedService('Dentist');
      if (text.includes('hair') || text.includes('salon')) setDetectedService('Hairdresser');
      if (text.includes('mechanic') || text.includes('car')) setDetectedService('Mechanic');
      if (text.includes('physical therapy')) setDetectedService('Physical Therapist');

      // Improved Location Detection
      const locationMatch = text.match(/(in|near|at)\s+([a-z\s,]+?)(?=for|at|tomorrow|today|on|\.|$)/i);
      if (locationMatch && locationMatch[2].length > 3) {
        setDetectedLocation(locationMatch[2].trim());
      }

      // Improved Time Detection
      const timeRegex = /(\b\d{1,2}\b)(:(\d{2}))?\s*(p\.m\.|a\.m\.|pm|am|o'clock)/i;
      const timeMatch = text.match(timeRegex);
      if (timeMatch) setDetectedTime(timeMatch[0]);

      // Improved Date Detection
      if (text.includes('tomorrow')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setDetectedDate(tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
      } else if (text.includes('today')) {
        setDetectedDate(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
      }
      
      // UI Transitions
      if (text.includes('searching') || text.includes('looking for')) {
        setIsBooking(false);
      }
      
      if (text.includes('calling') || text.includes('contacting')) {
        setIsBooking(true);
      }
    },
    // Register client tools that ElevenLabs will call
    clientTools: {
      search_providers: async (params: any) => handleToolCall('search_providers', params),
      check_calendar_availability: async (params: any) => handleToolCall('check_calendar_availability', params),
      initiate_provider_call: async (params: any) => handleToolCall('initiate_provider_call', params),
      confirm_booking: async (params: any) => handleToolCall('confirm_booking', params),
      swarm_call_providers: async (params: any) => handleToolCall('swarm_call_providers', params),
    },
  });

  const startConversation = useCallback(async () => {
    try {
      // Reset all state
      setIsBooking(false);
      setDetectedService('');
      setDetectedDate('');
      setDetectedTime('');
      setDetectedLocation('');
      setCalendarSyncSuccess(false);
      setIsCalendarSyncing(false);
      setProviders([]);
      setCurrentCallProvider(null);
      setConfirmedBooking(null);
      setLastToolCall(null);
      setLiveTranscript([]);
      
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Inject current date as a dynamic variable to avoid hardcoding in dashboard
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      await conversation.startSession({
        agentId: agentId,
        dynamicVariables: {
          current_date: dateStr,
        }
      });
    } catch (error) {
      console.error('Failed to start conversation:', error);
    }
  }, [conversation, agentId]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
    setIsBooking(false);
  }, [conversation]);

  const hasAnyData = detectedService || detectedDate || detectedTime || detectedLocation || providers.length > 0;

  return (
    <div className="w-full px-[80px]">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr] gap-10 items-start">
        {/* Column 1: Talk to Alfred */}
        <div className="flex flex-col gap-8 p-10 border border-neutral-200 dark:border-neutral-800 rounded-3xl bg-white dark:bg-neutral-950 shadow-2xl transition-all w-full min-h-[600px]">
          <div className="space-y-3 text-center">
            <h2 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-black to-neutral-500 dark:from-white dark:to-neutral-400 bg-clip-text text-transparent">
              Talk to Alfred
            </h2>
            <p className="text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto text-lg">
              Your personal booking assistant is ready.
            </p>
          </div>

          <div className="flex flex-col items-center gap-6 w-full flex-1 justify-center">
            {!isGCalAuthenticated ? (
              <a
                href="/api/auth/google"
                className="flex items-center justify-center gap-3 px-12 py-5 rounded-full text-xl font-bold bg-[#4285F4] hover:bg-[#357ae8] text-white transition-all duration-300 shadow-xl hover:scale-105 active:scale-95 w-full max-w-xs"
              >
                <Lock className="w-6 h-6" />
                <span>Connect Calendar</span>
              </a>
            ) : (
              <button
                onClick={conversation.status === 'connected' ? stopConversation : startConversation}
                disabled={conversation.status === 'connecting'}
                className={`
                  group relative flex items-center justify-center gap-3 px-12 py-5 rounded-full text-xl font-bold transition-all duration-300 shadow-xl hover:scale-105 active:scale-95 w-full max-w-xs
                  ${conversation.status === 'connected' 
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' 
                    : 'bg-black dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-100 shadow-black/10'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {conversation.status === 'connecting' ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : conversation.status === 'connected' ? (
                  <>
                    <MicOff className="w-6 h-6" />
                    <span>End Call</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-6 h-6" />
                    <span>Start Call</span>
                  </>
                )}
                
                {conversation.status === 'connected' && (
                  <span className="absolute inset-0 rounded-full bg-current opacity-20 animate-ping pointer-events-none" />
                )}
              </button>
            )}

            <div className="flex flex-col items-center gap-3 w-full">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  conversation.status === 'connected' ? 'bg-green-500 animate-pulse' : 
                  conversation.status === 'connecting' ? 'bg-yellow-500 animate-bounce' : 'bg-neutral-300'
                }`} />
                <span className="text-sm font-bold uppercase tracking-widest text-neutral-500">
                  {conversation.status === 'connected' ? 'Alfred is listening' : conversation.status}
                </span>
              </div>
              
              {conversation.isSpeaking && (
                <div className="flex gap-1.5 items-center justify-center p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/10 w-full animate-in fade-in zoom-in-95">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div 
                        key={i} 
                        className="w-1.5 h-4 bg-blue-500 rounded-full animate-bounce" 
                        style={{ animationDelay: `${i * 0.1}s`, animationDuration: '0.6s' }} 
                      />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400 ml-2">Alfred is speaking...</span>
                </div>
              )}

              {/* Tool Call Indicator */}
              {lastToolCall && lastToolCall.status === 'pending' && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 w-full">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    {lastToolCall.toolName === 'search_providers' && 'Searching...'}
                    {lastToolCall.toolName === 'check_calendar_availability' && 'Checking calendar...'}
                    {lastToolCall.toolName === 'initiate_provider_call' && 'Negotiating...'}
                    {lastToolCall.toolName === 'confirm_booking' && 'Confirming...'}
                    {lastToolCall.toolName === 'swarm_call_providers' && 'Swarming...'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Confirmed Booking Summary */}
          {confirmedBooking && (
            <div className="w-full p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-green-500 rounded-full">
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-green-800 dark:text-green-200 truncate">Confirmed!</h3>
                  <p className="text-green-600 dark:text-green-400 text-sm mt-1">
                    {confirmedBooking.time}
                  </p>
                  {confirmedBooking.calendarAdded && confirmedBooking.calendarLink && (
                    <div className="mt-3">
                      <a 
                        href={confirmedBooking.calendarLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-all shadow-md"
                      >
                        View Calendar
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Column 2: Request Details & Live Negotiation */}
        <div className={`flex flex-col gap-8 transition-all duration-500 ${hasAnyData ? 'opacity-100' : 'opacity-20'}`}>
          <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-3xl bg-white dark:bg-neutral-900 shadow-xl space-y-6">
            <div className="flex items-center gap-2 border-b pb-4">
              <Tag className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-lg uppercase tracking-tight">Request Details</h3>
            </div>

            <div className="space-y-6">
              <DetailItem label="Service" value={detectedService} icon={<Tag className="w-4 h-4" />} />
              <DetailItem label="Date" value={detectedDate} icon={<CalendarIcon className="w-4 h-4" />} />
              <DetailItem label="Time" value={detectedTime} icon={<Clock className="w-4 h-4" />} />
              <DetailItem label="Location" value={detectedLocation} icon={<MapPin className="w-4 h-4" />} />
            </div>
          </div>

          {/* Live Call Transcript */}
          {liveTranscript.length > 0 && (
            <div className="p-8 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-3xl animate-in fade-in slide-in-from-top-4 max-h-[400px] overflow-y-auto shadow-inner">
              <div className="flex items-center gap-2 mb-6 sticky top-0 bg-neutral-50 dark:bg-neutral-900 pb-2 z-10">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Live Negotiation</span>
              </div>
              <div className="space-y-4">
                {liveTranscript.map((line, i) => (
                  <div 
                    key={i} 
                    className={`flex flex-col ${line.role === 'alfred' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}
                  >
                    <div className={`
                      max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed
                      ${line.role === 'alfred' 
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-sm' 
                        : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 rounded-tl-none shadow-sm'}
                    `}>
                      <p className="font-bold text-[10px] uppercase tracking-tight mb-1 opacity-70">
                        {line.role === 'alfred' ? 'Alfred' : 'Receptionist'}
                      </p>
                      {line.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Column 3: Found Providers */}
        <div className={`transition-all duration-500 ${providers.length > 0 ? 'opacity-100' : 'opacity-20'}`}>
          {providers.length > 0 ? (
            <div className="p-10 border border-neutral-200 dark:border-neutral-800 rounded-3xl bg-white dark:bg-neutral-900 shadow-xl h-full min-h-[600px]">
              <div className="flex items-center justify-between border-b pb-4 mb-8">
                <h3 className="font-bold text-xl flex items-center gap-2">
                  <Phone className="w-6 h-6 text-green-500" />
                  Found Providers
                </h3>
                <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-full text-xs font-bold text-neutral-500">
                  {providers.length}
                </span>
              </div>

              <div className="space-y-5">
                {providers.slice(0, 5).map((provider, i) => (
                  <div 
                    key={provider.id}
                    className={`p-6 rounded-2xl border transition-all ${
                      currentCallProvider?.id === provider.id 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20' 
                        : 'border-neutral-100 dark:border-neutral-800 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex flex-col gap-1.5">
                        {i === 0 && (
                          <span className="w-fit px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-black rounded-full uppercase tracking-tighter">
                            TOP PICK
                          </span>
                        )}
                        <p className="font-bold text-neutral-800 dark:text-neutral-200 leading-tight">{provider.name}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1 font-bold text-neutral-700 dark:text-neutral-300">
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                        {provider.rating}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {provider.distance_miles} mi
                      </span>
                    </div>
                    
                    <p className="text-[11px] text-neutral-400 mt-3 font-mono opacity-60 tracking-tighter">{provider.phone}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-10 border-2 border-dashed border-neutral-100 dark:border-neutral-800 rounded-3xl flex flex-col items-center justify-center text-center h-full min-h-[600px] bg-neutral-50/30 dark:bg-neutral-900/10">
              <div className="p-6 bg-white dark:bg-neutral-900 rounded-3xl shadow-sm mb-6">
                <Phone className="w-10 h-10 text-neutral-300" />
              </div>
              <p className="text-neutral-400 font-medium text-sm">
                Providers will appear here<br/>
                <span className="text-xs opacity-60">Alfred is ready to search for you</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className={`transition-all duration-300 ${value ? 'opacity-100 scale-100' : 'opacity-20 scale-95'}`}>
      <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <div className="text-blue-500">{icon}</div>
        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
          {value || 'Not yet specified'}
        </span>
      </div>
    </div>
  );
}
