export function sanitizedCarrierPageUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.pathname === '/' ? url.origin : url.href.replace(/\/$/, '');
}

/** Builds an editable workflow prefix without retaining quote/customer route identifiers. */
export function stableCarrierBaseUrl(rawUrl: string): string {
  return new URL(sanitizedCarrierPageUrl(rawUrl)).origin;
}
