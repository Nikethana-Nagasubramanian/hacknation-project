// src/lib/swarmOrchestrator.ts
// Orchestrates parallel calls to multiple providers (Swarm Mode)

import { Provider } from './schema';
import { RankedProvider } from './rankingLogic';
import { simulateProviderCall, CallResult, getProvider } from './receptionistSimulator';

export interface SwarmConfig {
  maxConcurrentCalls: number;
  timeoutMs: number;
  stopOnFirstSuccess: boolean;
  retryFailedCalls: boolean;
}

export interface SwarmCallStatus {
  providerId: string;
  providerName: string;
  status: 'pending' | 'calling' | 'success' | 'failed' | 'timeout' | 'cancelled';
  startedAt?: number;
  completedAt?: number;
  result?: CallResult;
}

export interface SwarmResult {
  totalProviders: number;
  successfulBookings: SwarmCallStatus[];
  failedCalls: SwarmCallStatus[];
  cancelledCalls: SwarmCallStatus[];
  bestMatch: SwarmCallStatus | null;
  totalDurationMs: number;
  callStatuses: SwarmCallStatus[];
}

const DEFAULT_CONFIG: SwarmConfig = {
  maxConcurrentCalls: 5,
  timeoutMs: 15000,
  stopOnFirstSuccess: true,
  retryFailedCalls: false,
};

/**
 * SwarmOrchestrator - Manages parallel outbound calls
 */
export class SwarmOrchestrator {
  private config: SwarmConfig;
  private callStatuses: Map<string, SwarmCallStatus> = new Map();
  private abortController: AbortController | null = null;
  private onStatusUpdate?: (status: SwarmCallStatus) => void;

  constructor(config: Partial<SwarmConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callback for real-time status updates
   */
  setStatusCallback(callback: (status: SwarmCallStatus) => void) {
    this.onStatusUpdate = callback;
  }

  /**
   * Execute parallel calls to providers
   */
  async executeSwarm(
    providers: RankedProvider[] | Provider[],
    requestedSlot: string,
    serviceDescription?: string
  ): Promise<SwarmResult> {
    const startTime = Date.now();
    this.abortController = new AbortController();
    this.callStatuses.clear();

    // Initialize all statuses
    providers.forEach(p => {
      this.callStatuses.set(p.id, {
        providerId: p.id,
        providerName: p.name,
        status: 'pending',
      });
    });

    // Process in batches based on maxConcurrentCalls
    const batches = this.createBatches(providers, this.config.maxConcurrentCalls);
    let firstSuccess: SwarmCallStatus | null = null;

    for (const batch of batches) {
      if (this.abortController.signal.aborted) break;
      if (this.config.stopOnFirstSuccess && firstSuccess) break;

      const batchPromises = batch.map(provider => 
        this.executeCall(provider, requestedSlot, serviceDescription)
      );

      const results = await Promise.allSettled(batchPromises);

      // Check for success in this batch
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.status === 'success') {
          if (!firstSuccess) {
            firstSuccess = result.value;
            if (this.config.stopOnFirstSuccess) {
              this.cancelRemainingCalls();
              break;
            }
          }
        }
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const allStatuses = Array.from(this.callStatuses.values());

    return {
      totalProviders: providers.length,
      successfulBookings: allStatuses.filter(s => s.status === 'success'),
      failedCalls: allStatuses.filter(s => s.status === 'failed' || s.status === 'timeout'),
      cancelledCalls: allStatuses.filter(s => s.status === 'cancelled'),
      bestMatch: this.selectBestMatch(allStatuses),
      totalDurationMs,
      callStatuses: allStatuses,
    };
  }

  /**
   * Execute a single call with timeout
   */
  private async executeCall(
    provider: Provider | RankedProvider,
    requestedSlot: string,
    serviceDescription?: string
  ): Promise<SwarmCallStatus> {
    const status = this.callStatuses.get(provider.id)!;
    
    // Update to calling status
    status.status = 'calling';
    status.startedAt = Date.now();
    this.updateStatus(status);

    try {
      // Race between the call and timeout
      const result = await Promise.race([
        simulateProviderCall(provider.id, requestedSlot, serviceDescription),
        this.createTimeout(provider.id),
      ]);

      status.completedAt = Date.now();

      if (result === 'timeout') {
        status.status = 'timeout';
      } else {
        status.status = result.success ? 'success' : 'failed';
        status.result = result;
      }
    } catch (error) {
      status.status = 'failed';
      status.completedAt = Date.now();
    }

    this.updateStatus(status);
    return status;
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(providerId: string): Promise<'timeout'> {
    return new Promise(resolve => {
      setTimeout(() => resolve('timeout'), this.config.timeoutMs);
    });
  }

  /**
   * Cancel remaining pending calls
   */
  private cancelRemainingCalls() {
    this.callStatuses.forEach((status, id) => {
      if (status.status === 'pending') {
        status.status = 'cancelled';
        this.updateStatus(status);
      }
    });
    this.abortController?.abort();
  }

  /**
   * Update status and notify callback
   */
  private updateStatus(status: SwarmCallStatus) {
    this.callStatuses.set(status.providerId, status);
    this.onStatusUpdate?.(status);
  }

  /**
   * Select the best match from successful bookings
   */
  private selectBestMatch(statuses: SwarmCallStatus[]): SwarmCallStatus | null {
    const successful = statuses.filter(s => s.status === 'success' && s.result?.bookedSlot);
    
    if (successful.length === 0) return null;

    // Sort by earliest slot, then by provider rating
    return successful.sort((a, b) => {
      const aTime = new Date(a.result!.bookedSlot!).getTime();
      const bTime = new Date(b.result!.bookedSlot!).getTime();
      
      if (aTime !== bTime) return aTime - bTime;

      // If same time, prefer higher rated provider
      const aProvider = getProvider(a.providerId);
      const bProvider = getProvider(b.providerId);
      return (bProvider?.rating || 0) - (aProvider?.rating || 0);
    })[0];
  }

  /**
   * Create batches for concurrent processing
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Abort all ongoing calls
   */
  abort() {
    this.cancelRemainingCalls();
  }
}

/**
 * Convenience function for one-off swarm execution
 */
export async function executeSwarmCalls(
  providers: RankedProvider[] | Provider[],
  requestedSlot: string,
  options?: {
    maxConcurrent?: number;
    stopOnFirstSuccess?: boolean;
    onStatusUpdate?: (status: SwarmCallStatus) => void;
  }
): Promise<SwarmResult> {
  const orchestrator = new SwarmOrchestrator({
    maxConcurrentCalls: options?.maxConcurrent || 5,
    stopOnFirstSuccess: options?.stopOnFirstSuccess ?? true,
  });

  if (options?.onStatusUpdate) {
    orchestrator.setStatusCallback(options.onStatusUpdate);
  }

  return orchestrator.executeSwarm(providers, requestedSlot);
}

/**
 * Format swarm results for display
 */
export function formatSwarmSummary(result: SwarmResult): string {
  const lines: string[] = [
    `📊 Swarm Call Summary`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `Total Providers: ${result.totalProviders}`,
    `Successful: ${result.successfulBookings.length}`,
    `Failed/Timeout: ${result.failedCalls.length}`,
    `Cancelled: ${result.cancelledCalls.length}`,
    `Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`,
    ``,
  ];

  if (result.bestMatch) {
    lines.push(
      `🏆 Best Match:`,
      `   ${result.bestMatch.providerName}`,
      `   ${new Date(result.bestMatch.result!.bookedSlot!).toLocaleString()}`
    );
  } else {
    lines.push(`❌ No successful bookings`);
  }

  return lines.join('\n');
}

