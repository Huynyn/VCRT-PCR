import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import fr from './locales/fr.json'

export const LANGUAGE_STORAGE_KEY = 'pcr_language'

const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY)
const initialLanguage = savedLanguage === 'fr' ? 'fr' : 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: {
    // React already escapes values when rendering, so i18next doesn't need to.
    escapeValue: false,
  },
  returnEmptyString: false,
})

export default i18n
