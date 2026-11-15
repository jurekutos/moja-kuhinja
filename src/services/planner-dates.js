import { currentLanguage,locales } from '../i18n/index.js';
import { tr } from '../i18n/index.js';
import { validDate } from '../validators/planner.js';
export function todayInLjubljana(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(date, count) {
  const result = new Date(date + 'T12:00:00Z'); result.setUTCDate(result.getUTCDate() + count);
  return result.toISOString().slice(0, 10);
}
export function mondayOf(value = todayInLjubljana()) {
  if (!validDate(value)) throw Object.assign(new Error(tr("planner:s3daf0fedb182")), { status: 422 });
  const weekday = new Date(value + 'T12:00:00Z').getUTCDay();
  return addDays(value, -(weekday + 6) % 7);
}
export function dateLabel(value, options = { day: 'numeric', month: 'long' }) {
  return new Date(value + 'T12:00:00Z').toLocaleDateString(locales[currentLanguage()], { ...options, timeZone: 'UTC' });
}
