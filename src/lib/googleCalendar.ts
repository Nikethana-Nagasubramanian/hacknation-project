import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

export const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

export function getAuthUrl() {
  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
}

/**
 * Get calendar events within a time range
 */
export async function getCalendarEvents(
  auth: OAuth2Client,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    return events.map(event => ({
      id: event.id || '',
      summary: event.summary || 'Busy',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      location: event.location || undefined,
    }));
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }
}

/**
 * Check if a time slot has conflicts
 */
export async function checkAvailability(
  auth: OAuth2Client,
  startTime: string,
  endTime: string
): Promise<{ available: boolean; conflicts: CalendarEvent[] }> {
  const events = await getCalendarEvents(auth, startTime, endTime);
  
  return {
    available: events.length === 0,
    conflicts: events,
  };
}

export async function createCalendarEvent(auth: OAuth2Client, details: {
  summary: string;
  location: string;
  description: string;
  startTime: string;
  endTime: string;
  timeZone?: string;
}) {
  const calendar = google.calendar({ version: 'v3', auth });
  const tz = details.timeZone || process.env.USER_TIMEZONE || 'America/New_York';
  
  const event = {
    summary: details.summary,
    location: details.location,
    description: details.description,
    start: {
      dateTime: details.startTime,
      timeZone: tz,
    },
    end: {
      dateTime: details.endTime,
      timeZone: tz,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 15 },
      ],
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });
    return response.data;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
}

