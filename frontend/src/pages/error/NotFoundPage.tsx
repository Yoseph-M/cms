import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-surface-gradient flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-card/80 backdrop-blur-sm border border-border rounded-2xl p-10 shadow-xl relative overflow-hidden animate-fade-in">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <div className="w-20 h-20 bg-secondary/50 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-border">
          <Compass className="w-10 h-10 text-primary" />
        </div>

        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {t('notFound.code')}
        </p>
        <h1 className="mt-1 text-5xl font-display font-semibold text-foreground">{t('notFound.lost')}</h1>
        <h2 className="mt-1 text-lg font-medium text-foreground">{t('notFound.title')}</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {t('notFound.message')}
        </p>
        <Button
          onClick={() => navigate('/')}
          className="w-full mt-8"
          leftIcon={<ArrowLeft className="w-4 h-4" />}
        >
          {t('notFound.back')}
        </Button>
      </div>
    </div>
  );
};
