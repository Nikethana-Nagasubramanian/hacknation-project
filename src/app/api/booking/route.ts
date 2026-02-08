import { NextRequest, NextResponse } from 'next/server';
import { rankProviders } from '@/lib/rankingLogic';
import { AppointmentIntent, Provider } from '@/lib/schema';
import providersData from '@/data/directory.json';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Received booking request:', body);

    const { 
      serviceType, 
      preferredDate, 
      preferredTime, 
      userLocation, 
      maxDistance, 
      userId = 'default_user' 
    } = body;

    if (!serviceType || !preferredDate || !preferredTime) {
      return NextResponse.json(
        { error: 'Missing core parameters: serviceType, preferredDate, or preferredTime' },
        { status: 400 }
      );
    }

    // 1. Construct the intent with the new parameters
    const start = new Date(`${preferredDate}T${preferredTime}`).toISOString();
    const end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString(); // 1 hour window

    const intent: AppointmentIntent = {
      userId,
      serviceType,
      preferredTimeRange: { start, end },
      maxDistanceMiles: Number(maxDistance) || 10,
      status: 'searching',
    };

    // 2. Rank providers (using location logic if we had geo-coding, for now we just log it)
    console.log(`User is searching from: ${userLocation || 'Unknown'}`);

    const providers = (providersData.providers as any[]) as Provider[];
    const filteredProviders = providers.filter(
      p => p.category.toLowerCase().replace('_', ' ') === serviceType.toLowerCase() || 
           p.category.toLowerCase() === serviceType.toLowerCase()
    );

    const rankedProviders = rankProviders(
      filteredProviders.length > 0 ? filteredProviders : providers, 
      intent
    );

    return NextResponse.json({
      message: `I've analyzed providers in ${userLocation || 'your area'}. Found ${rankedProviders.length} matches.`,
      topMatches: rankedProviders.slice(0, 3).map(p => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        rating: p.rating,
        distance: p.distanceMiles,
        score: p.finalScore
      })),
      intent
    });
  } catch (error) {
    console.error('Booking API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
