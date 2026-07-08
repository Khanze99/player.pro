import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en';
import es from './es';
import ru from './ru';

const supported = ['ru', 'en', 'es'] as const;
export type AppLocale = (typeof supported)[number];

function systemLocale(): AppLocale {
  const code = getLocales()[0]?.languageCode ?? 'ru';
  return (supported as readonly string[]).includes(code) ? (code as AppLocale) : 'en';
}

// eslint-disable-next-line import/no-named-as-default-member
i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en }, es: { translation: es } },
  lng: systemLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
