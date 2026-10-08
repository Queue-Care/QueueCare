import { useCallback, useSyncExternalStore } from 'react';
import { translations as staffTranslations } from './g_translations';
import {
  patientTranslations,
  translationPatterns,
} from './g_patientTranslations';

const translations: Record<string, readonly [string, string]> = {
  ...staffTranslations,
  ...patientTranslations,
};

export type AppLanguage = 'en' | 'si' | 'ta';
type Values = Record<string, string | number | null | undefined>;

// The staff member's chosen language. It is kept outside React so the tab bar,
// headers and every staff screen change together without passing props around.
let current: AppLanguage = 'en';
const listeners = new Set<() => void>();

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  value === 'en' || value === 'si' || value === 'ta';

export function getLanguage() {
  return current;
}

export function setLanguage(next: AppLanguage) {
  if (next === current) return;
  current = next;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

// English text is the key. Text without a translation is returned unchanged, so
// names, dates and messages written by the server stay readable.
export function translate(
  language: AppLanguage,
  text: string,
  values?: Values,
) {
  const index = language === 'si' ? 0 : 1;
  const entry = language === 'en' ? undefined : translations[text];
  let result = entry ? entry[index] : text;
  // Sentences built with numbers or names, such as "3 slots left".
  if (!entry && language !== 'en')
    for (const [pattern, sinhala, tamil] of translationPatterns)
      if (pattern.test(text)) {
        result = text.replace(pattern, index === 0 ? sinhala : tamil);
        break;
      }
  if (values)
    for (const [name, value] of Object.entries(values))
      result = result.split(`{${name}}`).join(String(value ?? '—'));
  return result;
}

// "10 minutes ago", "Today · 6:18 PM" and "Yesterday · 6:18 PM" from formatWhen.
export function translateWhen(language: AppLanguage, when: string) {
  if (language === 'en') return when;
  const minutes = /^(\d+) minutes? ago$/.exec(when);
  if (minutes)
    return translate(
      language,
      minutes[1] === '1' ? '{count} minute ago' : '{count} minutes ago',
      { count: minutes[1] },
    );
  const day = /^(Today|Yesterday) · (.+)$/.exec(when);
  if (day) return translate(language, `${day[1]} · {time}`, { time: day[2] });
  return translate(language, when);
}

// For text taken straight from a screen: the spaces around it are kept, so
// "Phone: " followed by a number still reads correctly.
export function translateText(language: AppLanguage, text: string) {
  if (language === 'en') return text;
  const core = text.trim();
  if (!core) return text;
  const translated = translate(language, core);
  return translated === core ? text : text.replace(core, () => translated);
}

export function useT() {
  const language = useLanguage();
  return useCallback(
    (text: string, values?: Values) => translate(language, text, values),
    [language],
  );
}
