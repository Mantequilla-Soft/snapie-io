/**
 * Browser language subtag, or `en` when it is unavailable.
 *
 * Bun's server `navigator` object exists, but `navigator.language` is
 * undefined. A `typeof navigator` check alone then throws during SSR.
 */
export function browserLanguageTag(): string {
  const language = typeof navigator === 'undefined' ? undefined : navigator.language;
  if (!language) return 'en';
  return language.split('-')[0] || 'en';
}
