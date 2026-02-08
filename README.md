# HackNation AI Voice Receptionist

An agentic Voice AI booking assistant powered by ElevenLabs that autonomously calls service providers, negotiates appointments, and syncs to your Google Calendar.

## Features

- **Voice-Powered Booking**: Talk to Alfred to book appointments naturally
- **Smart Provider Ranking**: Finds best matches based on rating, distance, and availability
- **Parallel Calling (Swarm Mode)**: Calls multiple providers simultaneously for fastest booking
- **Calendar Integration**: Checks conflicts and syncs confirmed appointments to Google Calendar
- **Simulated Receptionists**: Agent-to-agent conversations for realistic demos

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file with:

```env
# ElevenLabs Configuration
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_agent_id_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# Google OAuth (for Calendar integration)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google
```

### 3. Configure ElevenLabs Agent

In your ElevenLabs dashboard, add these tools to your agent:

1. Go to **elevenlabs.io → Conversational AI → Your Agent**
2. Navigate to the **Tools** section
3. Add each tool from `src/lib/elevenlabs-tools.ts`
4. Copy the system prompt from `ALFRED_SYSTEM_PROMPT`

**Tools to add:**
- `search_providers` - Find and rank providers
- `check_calendar_availability` - Verify calendar is free
- `initiate_provider_call` - Call a single provider
- `confirm_booking` - Finalize and add to calendar
- `swarm_call_providers` - Parallel multi-provider calling

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
User ──► Alfred (ElevenLabs Agent)
              │
              ├──► search_providers ──► Provider Directory
              ├──► check_calendar ──► Google Calendar API
              ├──► initiate_provider_call ──► Receptionist Simulator
              └──► confirm_booking ──► Google Calendar API
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── elevenlabs/route.ts    # Tool call webhook handler
│   │   ├── calendar/route.ts      # Calendar operations
│   │   └── auth/google/           # OAuth flow
│   └── page.tsx                   # Main UI
├── components/
│   ├── VoiceAgent.tsx             # Main voice interface
│   └── BookingStatus.tsx          # Call progress UI
├── lib/
│   ├── elevenlabs-tools.ts        # Tool definitions for dashboard
│   ├── receptionistSimulator.ts   # Simulated provider calls
│   ├── swarmOrchestrator.ts       # Parallel call management
│   ├── rankingLogic.ts            # Provider scoring
│   └── googleCalendar.ts          # Calendar integration
└── data/
    └── directory.json             # Sample provider directory
```

## Demo Workflow

1. **Connect Calendar**: Click "Connect Calendar" to authenticate with Google
2. **Start Call**: Click "Start Call" to begin talking to Alfred
3. **Request Appointment**: Say "I need a dentist appointment tomorrow at 3pm"
4. **Watch the Magic**: Alfred searches providers, calls them, and books the best match
5. **Calendar Sync**: Confirmed appointment appears in your Google Calendar

## Adding More Providers

Edit `src/data/directory.json` to add more providers:

```json
{
  "id": "prov_new",
  "name": "New Provider Name",
  "category": "dentist",
  "phone": "+1-555-555-5555",
  "rating": 4.5,
  "address": "123 Main St, City, ST 12345",
  "distanceMiles": 1.5,
  "availableSlots": ["2026-02-10T09:00:00Z", "2026-02-10T14:00:00Z"]
}
```

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Voice AI**: ElevenLabs Conversational AI SDK
- **Calendar**: Google Calendar API
- **Icons**: Lucide React
