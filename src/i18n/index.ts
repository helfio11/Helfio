import { createI18n } from 'vue-i18n'
import en from './locales/en'
import de from './locales/de'
import sq from './locales/sq'
import tr from './locales/tr'

export const supportedLocales = ['en', 'de', 'sq', 'tr'] as const
export type Locale = (typeof supportedLocales)[number]
const storageKey = 'helfio-locale'

function getInitialLocale(): Locale {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(storageKey)
    if (stored && supportedLocales.includes(stored as Locale)) return stored as Locale
  }
  return 'en'
}

export const i18n = createI18n({ legacy: false, locale: getInitialLocale(), fallbackLocale: 'en', messages: { en, de, sq, tr } })

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, locale)
}