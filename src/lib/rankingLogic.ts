// src/lib/rankingLogic.ts
import { Provider, AppointmentIntent } from './schema';

export interface RankedProvider extends Provider {
  finalScore: number;
  matchingSlots: string[];
}

export interface RankingWeights {
  ratingMultiplier: number;      // Points per star
  maxDistanceScore: number;      // Max points for distance
  distanceDecayPerMile: number;  // Points lost per mile
  slotMatchBonus: number;        // Bonus for matching time slot
}

const DEFAULT_WEIGHTS: RankingWeights = {
  ratingMultiplier: 10,
  maxDistanceScore: 30,
  distanceDecayPerMile: 5,
  slotMatchBonus: 20,
};

/**
 * Ranks providers based on rating, distance, and availability match.
 * Designed for scalability - can process providers in parallel batches.
 */
export function rankProviders(
  providers: Provider[],
  intent: AppointmentIntent,
  weights: RankingWeights = DEFAULT_WEIGHTS
): RankedProvider[] {
  return providers
    .map((provider) => scoreProvider(provider, intent, weights))
    .sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Scores a single provider - isolated for parallel processing
 */
export function scoreProvider(
  provider: Provider,
  intent: AppointmentIntent,
  weights: RankingWeights = DEFAULT_WEIGHTS
): RankedProvider {
  let score = 0;

  // 1. Rating Score (Max 50 pts: 10 pts per star)
  score += provider.rating * weights.ratingMultiplier;

  // 2. Distance Decay (Max 30 pts: Subtract 5 pts per mile)
  const distanceScore = Math.max(
    0,
    weights.maxDistanceScore - provider.distanceMiles * weights.distanceDecayPerMile
  );
  score += distanceScore;

  // 3. Availability Bonus - find all matching slots
  const matchingSlots = provider.availableSlots.filter((slot) => {
    const slotTime = new Date(slot).getTime();
    const startTime = new Date(intent.preferredTimeRange.start).getTime();
    const endTime = new Date(intent.preferredTimeRange.end).getTime();
    return slotTime >= startTime && slotTime <= endTime;
  });

  if (matchingSlots.length > 0) {
    score += weights.slotMatchBonus;
  }

  return { ...provider, finalScore: score, matchingSlots };
}

/**
 * Batch providers into groups for concurrent calling
 * @param providers - Ranked list of providers
 * @param batchSize - Number of providers to call in parallel
 */
export function batchProvidersForCalling(
  providers: RankedProvider[],
  batchSize: number = 3
): RankedProvider[][] {
  const batches: RankedProvider[][] = [];
  for (let i = 0; i < providers.length; i += batchSize) {
    batches.push(providers.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Get top N providers that match the intent criteria
 */
export function getTopProviders(
  providers: Provider[],
  intent: AppointmentIntent,
  limit: number = 5
): RankedProvider[] {
  return rankProviders(providers, intent).slice(0, limit);
}

/**
 * Filter providers by category before ranking
 */
export function rankProvidersByCategory(
  providers: Provider[],
  intent: AppointmentIntent,
  category: Provider['category']
): RankedProvider[] {
  const filtered = providers.filter((p) => p.category === category);
  return rankProviders(filtered, intent);
}

