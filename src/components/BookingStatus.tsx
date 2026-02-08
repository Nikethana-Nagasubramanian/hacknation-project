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
    <div className="w-full max-w-md p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold flex items-center gap-2">
          {isFinished ? (
            steps.some((s: BookingStep) => s.status === 'success') ? 'Booking Confirmed!' : 'Booking Failed'
          ) : (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              Calling {serviceType || 'Providers'}...
            </>
          )}
        </h3>
        {isSynced && (
          <div className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold rounded-full uppercase tracking-wider">
            Synced to Calendar
          </div>
        )}
      </div>

      <div className="space-y-4">
        {steps.map((step: BookingStep, i: number) => (
          <div 
            key={i} 
            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
              step.status === 'calling' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10 shadow-sm' : 
              step.status === 'success' ? 'border-green-500 bg-green-50 dark:bg-green-900/10' :
              step.status === 'failed' ? 'border-red-200 bg-red-50/30 opacity-80' :
              'border-neutral-100 dark:border-neutral-800 opacity-40'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${
                step.status === 'calling' ? 'bg-blue-500 text-white' :
                step.status === 'success' ? 'bg-green-500 text-white' :
                step.status === 'failed' ? 'bg-red-500 text-white' :
                'bg-neutral-200 dark:bg-neutral-800 text-neutral-500'
              }`}>
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{step.providerName}</p>
                <p className="text-xs text-neutral-500 capitalize">{step.status}</p>
              </div>
            </div>
            
            {step.status === 'calling' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
            {step.status === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            {step.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
          </div>
        ))}
      </div>

      {isFinished && steps.some((s: BookingStep) => s.status === 'success') && (
        <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg flex items-start gap-3">
          {isSyncing ? (
            <Loader2 className="w-5 h-5 animate-spin text-blue-500 mt-0.5" />
          ) : (
            <CalendarIcon className="w-5 h-5 text-blue-500 mt-0.5" />
          )}
          <div className="text-xs space-y-1">
            <p className="font-bold">
              {isSyncing ? 'Syncing to Google Calendar...' : isSynced ? 'Synced to Google Calendar' : 'Preparing Calendar Sync...'}
            </p>
            <p className="text-neutral-500">
              {isSynced ? 'Your appointment has been added to your primary calendar.' : 'Just a moment while we update your schedule.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
