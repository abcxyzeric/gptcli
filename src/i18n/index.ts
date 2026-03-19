/**
 * i18next 国际化配置
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';
import vi from './locales/vi.json';
import ru from './locales/ru.json';
import { getInitialLanguage } from '@/utils/language';

i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    'zh-CN': { translation: zhCN },
    en: { translation: en },
    ru: { translation: ru }
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false // React 已经转义
  },
  react: {
    useSuspense: false
  }
});

export default i18n;
