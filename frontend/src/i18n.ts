import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import locales directly to avoid async loading issues
import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enCashier from './locales/en/cashier.json';
import enManager from './locales/en/manager.json';
import enOwner from './locales/en/owner.json';

import amCommon from './locales/am/common.json';
import amAuth from './locales/am/auth.json';
import amCashier from './locales/am/cashier.json';
import amManager from './locales/am/manager.json';
import amOwner from './locales/am/owner.json';

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    cashier: enCashier,
    manager: enManager,
    owner: enOwner,
  },
  am: {
    common: amCommon,
    auth: amAuth,
    cashier: amCashier,
    manager: amManager,
    owner: amOwner,
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'am'],
    ns: ['common', 'auth', 'cashier', 'manager', 'owner'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React is already safe from XSS
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    }
  });

// Automatically update HTML lang attribute when language changes
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
