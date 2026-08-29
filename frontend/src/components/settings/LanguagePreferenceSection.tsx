import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useToastStore } from '../../store/toastStore';
import { axiosClient } from '../../api/axiosClient';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

interface LanguageOption {
  code: 'en' | 'am';
  label: string;
  native: string;
  sample: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English',  native: 'English',  sample: 'Sign in to continue' },
  { code: 'am', label: 'Amharic',  native: 'አማርኛ',  sample: 'ለመቀጠል ይግቡ' },
];

export const LanguagePreferenceSection: React.FC = () => {
  const { t } = useTranslation('common');
  const { addToast } = useToastStore();
  const [isSaving, setIsSaving] = useState(false);

  const handleLanguageChange = async (lang: LanguageOption['code']) => {
    if (i18n.language === lang || isSaving) return;
    setIsSaving(true);
    try {
      await i18n.changeLanguage(lang);
      document.documentElement.lang = lang;
      await axiosClient.patch('/users/me/language', { preferredLanguage: lang });
      addToast({
        type: 'success',
        title: t('language.label', { defaultValue: 'Language' }),
        message: lang === 'am' ? 'ቋንቋ ተቀይሯል።' : 'Language updated.',
      });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not save language preference.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {LANGUAGES.map((lang) => {
        const isActive = i18n.language === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            disabled={isSaving}
            onClick={() => handleLanguageChange(lang.code)}
            aria-pressed={isActive}
            className={cn(
              'group relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
              isActive
                ? 'border-primary bg-primary/5 shadow-[0_0_0_4px_hsl(var(--primary)/0.10)]'
                : 'border-border/60 hover:border-primary/40 hover:bg-secondary/50',
              isSaving && 'opacity-60 cursor-wait',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground',
                )}
              >
                {lang.code.toUpperCase()}
              </span>
              {isSaving && isActive ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : isActive ? (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                  Active
                </span>
              ) : null}
            </div>
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-foreground">{lang.label}</div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70">{lang.native}</span>
                <span className="mx-1.5 text-border">•</span>
                <span>{lang.sample}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
