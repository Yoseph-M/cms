import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useToastStore } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import { axiosClient } from '../../api/axiosClient';
import { cn } from '../../lib/utils';
import { Loader2, Check } from 'lucide-react';

interface LanguageOption {
  code: 'en' | 'am';
  label: string;
  native: string;
  sample: string;
  tag: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', native: 'English', sample: 'Fast and reliable workspace experience', tag: 'EN' },
  { code: 'am', label: 'Amharic', native: 'አማርኛ', sample: 'ፈጣን እና አስተማማኝ የስራ ልምድ', tag: 'አማ' },
];

export const LanguagePreferenceSection: React.FC = () => {
  const { t } = useTranslation('common');
  const { addToast } = useToastStore();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [isSaving, setIsSaving] = useState(false);

  const handleLanguageChange = async (lang: LanguageOption['code']) => {
    if (i18n.language === lang || isSaving) return;
    setIsSaving(true);
    try {
      await i18n.changeLanguage(lang);
      document.documentElement.lang = lang;
      await axiosClient.patch('/users/me/language', { preferredLanguage: lang });
      if (user) setUser({ ...user, preferredLanguage: lang });
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
    <div className="grid grid-cols-2 gap-3.5">
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
              'group relative flex flex-col justify-between rounded-2xl border-2 p-4 text-left transition-all duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive
                ? 'border-primary bg-primary/[0.03] shadow-[0_0_0_1px_hsl(var(--primary))] ring-2 ring-primary/20'
                : 'border-border/60 bg-card hover:border-primary/40 hover:bg-secondary/40 hover:shadow-sm',
              isSaving && 'opacity-60 cursor-wait',
            )}
          >
            {/* Header row: script tag tile & status check */}
            <div className="flex w-full items-center justify-between mb-3">
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold shadow-sm ring-1 ring-inset',
                  isActive
                    ? 'bg-primary text-primary-foreground ring-primary/30'
                    : 'bg-secondary text-foreground ring-border/50 group-hover:bg-background',
                )}
              >
                {lang.tag}
              </span>

              {isSaving && isActive ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : isActive ? (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <Check className="h-3 w-3 stroke-[3]" />
                </span>
              ) : (
                <span className="h-5 w-5 shrink-0 rounded-full border border-border/80 group-hover:border-primary/50" />
              )}
            </div>

            {/* Typography and preview */}
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-base font-bold text-foreground">{lang.label}</span>
                <span className="text-xs font-medium text-muted-foreground">({lang.native})</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground font-sans">
                {lang.sample}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
};
