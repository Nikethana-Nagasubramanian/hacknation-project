// src/lib/elevenlabs-tools.ts
// Tool definitions for ElevenLabs Agentic Functions
// Copy these to your ElevenLabs dashboard agent configuration

/**
 * ELEVENLABS DASHBOARD CONFIGURATION
 * 
 * 1. Go to elevenlabs.io → Conversational AI → Your Agent
 * 2. Navigate to "Tools" section
 * 3. Add each tool below with the specified schema
 * 4. Set your webhook URL to: https://your-domain.com/api/elevenlabs
 *    (or use ngrok for local development)
 */

export const TOOL_DEFINITIONS = {
  search_providers: {
    name: "search_providers",
    description: "Search for service providers (dentists, hairdressers, mechanics, etc.) based on user preferences. Returns ranked list of providers with availability, ratings, and distance.",
    parameters: {
      type: "object",
      properties: {
        service_type: {
          type: "string",
          description: "Type of service needed (e.g., 'dentist', 'hairdresser', 'mechanic', 'physical_therapy')"
        },
        preferred_date: {
          type: "string",
          description: "Preferred date in YYYY-MM-DD format"
        },
        preferred_time: {
          type: "string",
          description: "Preferred time in HH:MM format (24-hour)"
        },
        location: {
          type: "string",
          description: "User's location or neighborhood (e.g., 'Brighton, Boston')"
        },
        max_distance_miles: {
          type: "number",
          description: "Maximum distance in miles the user is willing to travel"
        }
      },
      required: ["service_type", "preferred_date", "preferred_time"]
    }
  },

  check_calendar_availability: {
    name: "check_calendar_availability",
    description: "Check if the user's Google Calendar has any conflicts at the proposed appointment time.",
    parameters: {
      type: "object",
      properties: {
        start_time: {
          type: "string",
          description: "Start time in ISO 8601 format"
        },
        end_time: {
          type: "string",
          description: "End time in ISO 8601 format"
        }
      },
      required: ["start_time", "end_time"]
    }
  },

  initiate_provider_call: {
    name: "initiate_provider_call",
    description: "Initiate a call to a service provider to negotiate and book an appointment slot. This simulates calling the provider's receptionist.",
    parameters: {
      type: "object",
      properties: {
        provider_id: {
          type: "string",
          description: "The unique ID of the provider to call"
        },
        requested_slot: {
          type: "string",
          description: "The appointment slot being requested in ISO 8601 format"
        },
        service_description: {
          type: "string",
          description: "Brief description of the appointment needed"
        }
      },
      required: ["provider_id", "requested_slot"]
    }
  },

  confirm_booking: {
    name: "confirm_booking",
    description: "Finalize the booking and create a calendar event. Call this after successfully negotiating with a provider.",
    parameters: {
      type: "object",
      properties: {
        provider_id: {
          type: "string",
          description: "The ID of the provider where appointment was booked"
        },
        provider_name: {
          type: "string",
          description: "Name of the provider"
        },
        booked_slot: {
          type: "string",
          description: "The confirmed appointment time in ISO 8601 format"
        },
        service_type: {
          type: "string",
          description: "Type of service booked"
        },
        location: {
          type: "string",
          description: "Address of the provider"
        },
        notes: {
          type: "string",
          description: "Any additional notes about the appointment"
        }
      },
      required: ["provider_id", "provider_name", "booked_slot", "service_type"]
    }
  },

  swarm_call_providers: {
    name: "swarm_call_providers",
    description: "Initiate parallel calls to multiple providers simultaneously to find the earliest available slot. Use this when user wants the 'first available' or 'soonest' appointment.",
    parameters: {
      type: "object",
      properties: {
        provider_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of provider IDs to call in parallel"
        },
        preferred_time_range: {
          type: "object",
          properties: {
            start: { type: "string", description: "Earliest acceptable time (ISO 8601)" },
            end: { type: "string", description: "Latest acceptable time (ISO 8601)" }
          },
          description: "Acceptable time window for the appointment"
        },
        service_description: {
          type: "string",
          description: "Brief description of the appointment needed"
        }
      },
      required: ["provider_ids", "preferred_time_range"]
    }
  }
};

/**
 * SYSTEM PROMPT FOR ALFRED
 * Copy this to your ElevenLabs agent's system prompt:
 */
export const ALFRED_SYSTEM_PROMPT = `You are Alfred, a professional and efficient AI booking assistant. Your job is to help users schedule appointments with service providers like dentists, hairdressers, mechanics, and physical therapists.

## Your Personality
- Professional yet warm and friendly
- Concise - don't ramble
- Proactive - anticipate user needs
- Reassuring - let users know you're handling everything

## Workflow
1. GATHER INFO: Ask the user what service they need, when they'd like it, and any preferences (location, specific provider, etc.)
2. SEARCH: Use the search_providers tool to find matching providers
3. CHECK CALENDAR: Use check_calendar_availability to ensure no conflicts
4. CALL PROVIDER: Use initiate_provider_call to book with the best match
5. CONFIRM: Use confirm_booking to finalize and add to their calendar

## Important Guidelines
- Always confirm the service type, date, and approximate time before searching
- If the user wants the "soonest" or "first available", use swarm_call_providers to call multiple providers in parallel
- Present the top 2-3 options briefly (name, rating, distance) before calling
- If a provider is unavailable, automatically try the next best option
- Always confirm the final booking details with the user

## Example Phrases
- "I'll search for dentists in your area for tomorrow afternoon."
- "I found 3 great options. Let me call the top-rated one first."
- "Great news! I've booked you in at [Provider] for [Time]. It's been added to your calendar."
- "That slot wasn't available, but I'm trying the next provider now."`;

