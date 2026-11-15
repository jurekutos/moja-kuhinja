const prefixPattern = /^\/(sl|si|en|de)(?=\/|\?|#|$)/;
const assetPattern = /^\/(?:css|js|icons)\//;

export function stripLanguage(value) {
  const result = value.replace(prefixPattern, '');
  return !result || result.startsWith('?') || result.startsWith('#') ? '/' + result : result;
}

export function localizedUrl(value, language, replaceLanguage = false) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return value;
  if (assetPattern.test(value) || value === '/images/landing-pasta.webp') return value;
  const existing = value.match(prefixPattern)?.[1];
  const fallback = ['sl','en','de'].includes(language) ? language : 'sl';
  const selected = existing && !replaceLanguage ? existing === 'si' ? 'sl' : existing : fallback;
  return '/' + selected + stripLanguage(value);
}

// Routers retain their existing paths; the URL prefix controls request localization.
export function languagePath(req, res, next) {
  const match = req.url.match(prefixPattern);
  if (match) {
    req.urlLanguage = match[1] === 'si' ? 'sl' : match[1];
    req.languageAlias = match[1] === 'si';
    req.url = stripLanguage(req.url);
  }
  next();
}

export function localizedNavigation(req, res, next) {
  res.set('Cache-Control','no-store');
  res.locals.localeUrl = value => localizedUrl(value, req.language);
  const redirect = res.redirect.bind(res);
  res.redirect = (statusOrUrl, destination) => typeof statusOrUrl === 'number'
    ? redirect(statusOrUrl, localizedUrl(destination, req.language))
    : redirect(localizedUrl(statusOrUrl, req.language));
  if (['GET','HEAD'].includes(req.method) && (!req.urlLanguage || req.languageAlias)) {
    const localPath = '/' + req.url.replace(/^\/+/, '');
    return res.redirect(302, localizedUrl(localPath, req.language, true));
  }
  next();
}
