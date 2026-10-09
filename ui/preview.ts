/** Shared by routing and startup: viewing a map experiment must not tick an original-game save. */
export function isRealCityPreview(search = typeof window === 'undefined' ? '' : window.location.search): boolean {
  return new URLSearchParams(search).get('preview') === 'real-city';
}
