import { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import WalletStep from './WalletStep';
import InstanceStep from './InstanceStep';
import ConfigStep from './ConfigStep';
import FundStep from './FundStep';
import TransferStep from './TransferStep';
import DoneStep from './DoneStep';

const steps = ['Wallet', 'Instance', 'Config', 'Fund', 'Transfer', 'Done'];

export interface SetupData {
  ownerAddress: string;
  nodeAddress: string;
  instance: number;
  apiKey: string;
}

export default function SetupWizard() {
  const [currentStep, setCurrentStep] = useState(() => {
    const saved = sessionStorage.getItem('setup_step');
    return saved ? Math.min(parseInt(saved, 10), steps.length - 1) : 0;
  });
  const [data, setData] = useState<SetupData>(() => {
    try {
      const saved = sessionStorage.getItem('setup_data');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { ownerAddress: '', nodeAddress: '', instance: 0, apiKey: '' };
  });

  useEffect(() => {
    sessionStorage.setItem('setup_step', String(currentStep));
    sessionStorage.setItem('setup_data', JSON.stringify(data));
  }, [currentStep, data]);

  const next = () => setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const updateData = (partial: Partial<SetupData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  };

  const stepProps = { data, updateData, next, back };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-8 text-2xl font-bold text-[var(--text-primary)]">Setup Wizard</h1>

      {/* Progress bar */}
      <div className="mb-8 flex items-center gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors',
                i < currentStep
                  ? 'bg-[var(--accent)] text-white'
                  : i === currentStep
                    ? 'bg-[var(--accent)] text-white ring-2 ring-[var(--accent)]/40 ring-offset-2 ring-offset-[var(--bg)]'
                    : 'bg-white/[0.06] text-[var(--text-muted)]',
              )}
            >
              {i < currentStep ? '\u2713' : i + 1}
            </div>
            <span
              className={cn(
                'hidden text-xs sm:block',
                i === currentStep ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'h-px w-6 sm:w-10',
                  i < currentStep ? 'bg-[var(--accent)]' : 'bg-white/[0.06]',
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {currentStep === 0 && <WalletStep {...stepProps} />}
      {currentStep === 1 && <InstanceStep {...stepProps} />}
      {currentStep === 2 && <ConfigStep {...stepProps} />}
      {currentStep === 3 && <FundStep {...stepProps} />}
      {currentStep === 4 && <TransferStep {...stepProps} />}
      {currentStep === 5 && <DoneStep />}
    </div>
  );
}
