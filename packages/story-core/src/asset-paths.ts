const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

export function publicAssetSrc(src: string, baseUrl = '/'): string {
  if (ABSOLUTE_URL_PATTERN.test(src)) return src;

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const relativePath = src.replace(/^\.?\//, '');
  return `${normalizedBaseUrl}${relativePath}`;
}
