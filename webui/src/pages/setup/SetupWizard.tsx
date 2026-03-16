import { useState } from 'react';
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
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<SetupData>({
    ownerAddress: '',
    nodeAddress: '',
    instance: 0,
    apiKey: '',
  });

  const next = () => setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  const back = () => setCurrentStep((s) => Math.max(s - 1, 0));

  const updateData = (partial: Partial<SetupData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  };

  const stepProps = { data, updateData, next, back };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-8 text-2xl font-bold text-zinc-100">Setup Wizard</h1>

      {/* Progress bar */}
      <div className="mb-8 flex items-center gap-2">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors',
                i < currentStep
                  ? 'bg-ton-blue text-white'
                  : i === currentStep
                    ? 'bg-ton-blue text-white ring-2 ring-ton-blue/40 ring-offset-2 ring-offset-zinc-950'
                    : 'bg-zinc-800 text-zinc-500',
              )}
            >
              {i < currentStep ? '\u2713' : i + 1}
            </div>
            <span
              className={cn(
                'hidden text-xs sm:block',
                i === currentStep ? 'text-zinc-100' : 'text-zinc-500',
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'h-px w-6 sm:w-10',
                  i < currentStep ? 'bg-ton-blue' : 'bg-zinc-800',
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
