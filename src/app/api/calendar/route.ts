import { oauth2Client, createCalendarEvent } from '@/lib/googleCalendar';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get('google_calendar_token');

  if (!tokenCookie) {
    return NextResponse.json({ error: 'Not authenticated with Google' }, { status: 401 });
  }

  try {
    const tokens = JSON.parse(tokenCookie.value);
    oauth2Client.setCredentials(tokens);

    const body = await req.json();
    const { summary, location, description, startTime, endTime } = body;

    const event = await createCalendarEvent(oauth2Client, {
      summary,
      location,
      description,
      startTime,
      endTime,
    });

    return NextResponse.json({ 
      success: true, 
      event, 
      htmlLink: (event as any).htmlLink 
    });
  } catch (error) {
    console.error('Calendar Event Error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}

// Helper to check if authenticated
export async function GET() {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get('google_calendar_token');
  return NextResponse.json({ authenticated: !!tokenCookie });
}

