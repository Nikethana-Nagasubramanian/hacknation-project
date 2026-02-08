import { oauth2Client } from '@/lib/googleCalendar';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Store tokens in a cookie for the session
    // In a real app, you'd save this to a database
    const cookieStore = await cookies();
    cookieStore.set('google_calendar_token', JSON.stringify(tokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      path: '/',
    });

    // Redirect back to home page
    return NextResponse.redirect(new URL('/', req.nextUrl.origin));
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    return NextResponse.redirect(new URL('/?error=auth_failed', req.nextUrl.origin));
  }
}

