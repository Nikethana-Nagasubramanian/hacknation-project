// src/lib/schema.ts

export type ProviderCategory = 
  | 'dentist' 
  | 'hairdresser' 
  | 'mechanic'
  | 'physical_therapy'
  | 'car_repair';

export interface ProviderMetadata {
  accepts_insurance?: boolean;
  parking?: string;
  specialty?: string;
  waitlist?: boolean;
  same_day?: boolean;
  notes?: string;
}

export interface Provider {
  id: string;
  name: string;
  phone: string;
  category: ProviderCategory;
  rating: number;
  address: string;
  distanceMiles: number;
  availableSlots: string[]; // ISO strings
  metadata?: ProviderMetadata;
}

export interface AppointmentIntent {
  userId: string;
  serviceType: string;
  userLocation?: string; // Add this
  preferredTimeRange: {
    start: string; // ISO string
    end: string;   // ISO string
  };
  maxDistanceMiles: number;
  status: 'searching' | 'calling' | 'booked' | 'failed';
}

// For tracking concurrent call attempts
export interface CallAttempt {
  providerId: string;
  providerName: string;
  startedAt: string;
  status: 'pending' | 'in_progress' | 'success' | 'failed' | 'no_answer';
  endedAt?: string;
  bookedSlot?: string;
  notes?: string;
}

// Session to track the entire booking flow
export interface BookingSession {
  id: string;
  intent: AppointmentIntent;
  attempts: CallAttempt[];
  createdAt: string;
  completedAt?: string;
  finalStatus: 'active' | 'booked' | 'exhausted' | 'cancelled';
  bookedProvider?: Provider;
  calendarEventId?: string; // Google Calendar event ID
}
