import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useToastStore } from '../../store/toastStore';
import { axiosClient } from '../../api/axiosClient';

export const LanguagePreferenceSection: React.FC = () => {
  const { t } = useTranslation('common');
  const { addToast } = useToastStore();
  const [isSaving, setIsSaving] = useState(false);

  const handleLanguageChange = async (lang: string) => {
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

  const languages = [
    { code: 'en', label: t('language.english', { defaultValue: 'English' }) },
    { code: 'am', label: t('language.amharic', { defaultValue: 'አማርኛ' }) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          {t('language.label', { defaultValue: 'Language' })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          {t('language.description', { defaultValue: 'Your language preference is saved to your account and restored on any device.' })}
        </p>
        <div className="flex gap-3">
          {languages.map(({ code, label }) => (
            <button
              key={code}
              disabled={isSaving}
              onClick={() => handleLanguageChange(code)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                i18n.language === code
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
