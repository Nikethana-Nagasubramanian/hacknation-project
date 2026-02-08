'use client';

import { useState, useEffect, useRef } from 'react';
import { Phone, CheckCircle2, XCircle, Loader2, Calendar as CalendarIcon } from 'lucide-react';

export interface BookingStep {
  providerName: string;
  status: 'pending' | 'calling' | 'success' | 'failed';
}

export function BookingStatus({ 
  isVisible, 
  serviceType,
  onComplete,
  isSyncing,
  isSynced
}: { 
  isVisible: boolean;
  serviceType?: string;
  onComplete?: (providerName: string) => void;
  isSyncing?: boolean;
  isSynced?: boolean;
}) {
  const [steps, setSteps] = useState<BookingStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [hasFinished, setHasFinished] = useState(false);
  
  // Use a ref to keep track of the current index without triggering re-renders
  // This helps us avoid the infinite loop
  const processingRef = useRef(false);

  // Initialize steps when it becomes visible or service type changes
  useEffect(() => {
    if (isVisible) {
      const type = serviceType || 'provider';
      setSteps([
        { providerName: `Local ${type} Alpha`, status: 'pending' },
        { providerName: `Premium ${type} Center`, status: 'pending' },
        { providerName: `Express ${type} Hub`, status: 'pending' },
      ]);
      setCurrentStepIndex(0);
      setHasFinished(false);
      processingRef.current = false;
    } else {
      setSteps([]);
      setCurrentStepIndex(0);
      setHasFinished(false);
      processingRef.current = false;
    }
  }, [isVisible, serviceType]);

  // Handle the calling simulation
  useEffect(() => {
    if (!isVisible || hasFinished || currentStepIndex >= 3 || steps.length === 0) return;

    // Only start a new "call" if we aren't already processing one
    if (processingRef.current) return;
    processingRef.current = true;

    // Set the current step to 'calling' status
    setSteps((prev: BookingStep[]) => prev.map((step: BookingStep, idx: number) => 
      idx === currentStepIndex ? { ...step, status: 'calling' as const } : step
    ));

    const timer = setTimeout(() => {
      // Guarantee success on the 3rd attempt if the first two fail, 
      // otherwise keep it at 60% success for realism.
      const isLastAttempt = currentStepIndex === 2;
      const isSuccess = isLastAttempt ? true : Math.random() > 0.4; 
      
      setSteps((prev: BookingStep[]) => {
        const nextSteps = prev.map((step: BookingStep, idx: number) => 
          idx === currentStepIndex ? { ...step, status: isSuccess ? 'success' as const : 'failed' as const } : step
        );
        return nextSteps;
      });

      processingRef.current = false;

      if (isSuccess) {
        setHasFinished(true);
        onComplete?.(steps[currentStepIndex].providerName);
      } else {
        setCurrentStepIndex((prev: number) => prev + 1);
      }
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [isVisible, currentStepIndex, hasFinished, steps.length, onComplete]);

  if (!isVisible || steps.length === 0) return null;

  const isFinished = steps.some((s: BookingStep) => s.status === 'success') || 
                   (steps.length > 0 && steps.every((s: BookingStep) => s.status === 'failed'));

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg animate-slide-up">
      <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isFinished && <Loader2 className="w-4 h-4 animate-spin text-[var(--info)]" />}
          <h3 className="text-[13px] font-semibold text-[var(--foreground)]">
            {isFinished ? (
              steps.some((s: BookingStep) => s.status === 'success') ? 'Booking Confirmed' : 'Booking Failed'
            ) : (
              `Calling ${serviceType || 'Providers'}...`
            )}
          </h3>
        </div>
        {isSynced && (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-[var(--accent-dark)] dark:text-[var(--accent)] bg-[var(--accent-light)] rounded uppercase tracking-wide">
            Synced
          </span>
        )}
      </div>

      <div className="p-4 space-y-2">
        {steps.map((step: BookingStep, i: number) => (
          <div 
            key={i} 
            className={`flex items-center justify-between p-3 rounded-md border transition-all ${
              step.status === 'calling' ? 'border-[var(--info)] bg-[var(--info)]/5' : 
              step.status === 'success' ? 'border-[var(--accent)] bg-[var(--accent-light)]' :
              step.status === 'failed' ? 'border-[var(--danger)]/30 bg-[var(--danger)]/5 opacity-60' :
              'border-[var(--card-border)] opacity-40'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-1.5 rounded-md ${
                step.status === 'calling' ? 'bg-[var(--info)] text-white' :
                step.status === 'success' ? 'bg-[var(--accent)] text-white' :
                step.status === 'failed' ? 'bg-[var(--danger)] text-white' :
                'bg-[var(--card-border)] text-[var(--muted)]'
              }`}>
                <Phone className="w-3 h-3" />
              </div>
              <div>
                <p className="text-[12px] font-medium text-[var(--foreground)]">{step.providerName}</p>
                <p className="text-[10px] text-[var(--muted)] capitalize">{step.status}</p>
              </div>
            </div>
            
            {step.status === 'calling' && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--info)]" />}
            {step.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />}
            {step.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-[var(--danger)]" />}
          </div>
        ))}
      </div>

      {isFinished && steps.some((s: BookingStep) => s.status === 'success') && (
        <div className="px-4 pb-4">
          <div className="p-3 bg-[var(--background)] rounded-md flex items-start gap-3">
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin text-[var(--info)] mt-0.5" />
            ) : (
              <CalendarIcon className="w-4 h-4 text-[var(--info)] mt-0.5" />
            )}
            <div className="text-[11px] space-y-0.5">
              <p className="font-medium text-[var(--foreground)]">
                {isSyncing ? 'Syncing to Google Calendar...' : isSynced ? 'Synced to Google Calendar' : 'Preparing Calendar Sync...'}
              </p>
              <p className="text-[var(--muted)]">
                {isSynced ? 'Added to your primary calendar.' : 'Just a moment...'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
