import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { useSystemSettingQuery } from '../../hooks/useCachedQueries';
import { useOnboardingStore } from '../../store/onboardingStore';
import { CheckCircle2, Circle, ArrowRight, Settings2, X } from 'lucide-react';
import { axiosClient } from '../../api/axiosClient';
import { useQueryClient } from '@tanstack/react-query';

export const STEPS = [
  { label: 'Business Profile', desc: 'Name, logo, currency' },
  { label: 'Service Type', desc: 'Table service or counter service' },
  { label: 'First Printer', desc: 'Add a kitchen or receipt printer' },
  { label: 'Menu', desc: 'Add a few items or skip for later' },
  { label: 'Your Team', desc: 'Add your first manager or cashier' },
  { label: 'Notifications', desc: 'Choose what you want to hear about' },
];

export const OnboardingChecklist: React.FC = () => {
  const queryClient = useQueryClient();
  const openWizard = useOnboardingStore((s) => s.openWizard);

  const completedQuery = useSystemSettingQuery('onboardingCompleted');
  const stepQuery = useSystemSettingQuery('onboardingStep');

  if (completedQuery.isLoading || stepQuery.isLoading) return null;

  const isCompleted = completedQuery.data?.value === 'true';
  const isDismissed = completedQuery.data?.value === 'dismissed';
  if (isCompleted || isDismissed) return null;

  const currentStep = parseInt(stepQuery.data?.value || '0', 10);
  const remainingCount = STEPS.length - currentStep;

  const handleDismiss = async () => {
    await axiosClient.patch('/settings/system/onboardingCompleted', { value: 'dismissed' });
    queryClient.invalidateQueries({ queryKey: ['systemSetting', 'onboardingCompleted'] });
  };

  return (
    <Card className="mb-6 border-primary/20 bg-primary/5 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            Finish Setup
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {remainingCount > 0
              ? `You have ${remainingCount} step${remainingCount === 1 ? '' : 's'} remaining to fully configure your system.`
              : `You've completed all steps! Finish the setup to close this.`}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleDismiss} className="-mt-2 -mr-2 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, idx) => {
            const isDone = idx < currentStep;
            const isCurrent = idx === currentStep;
            return (
              <button
                key={idx}
                onClick={() => openWizard(idx)}
                className={`flex items-start gap-3 p-3 text-left rounded-lg border transition-all ${
                  isCurrent
                    ? 'border-primary bg-background shadow-sm ring-1 ring-primary/20'
                    : 'border-border bg-background hover:border-primary/50'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))] shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`text-sm font-medium ${isDone ? 'text-foreground line-through opacity-70' : 'text-foreground'}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {step.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => openWizard(currentStep)} className="gap-2">
            Resume Setup <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
