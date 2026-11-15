import { tr } from '../i18n/index.js';
const fail = message => { throw Object.assign(new Error(message), { status: 422 }); };
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2100;
}
export function parseMeal(input, { requireRecipe = true } = {}) {
  if (!validDate(input.date)) fail(tr("planner:s00b94c2a047e"));
  if (!['lunch', 'dinner'].includes(input.slot)) fail(tr("planner:s32be387ac6da"));
  const revision = input.revision ?? '';
  if (typeof revision !== 'string' || revision !== '' && !/^[a-f0-9-]{36}$/.test(revision)) fail(tr("planner:sb4554958af7f"));
  if (!requireRecipe) return { date: input.date, slot: input.slot, revision };
  if (typeof input.recipe !== 'string' || !/^(workspace|public):[1-9]\d*$/.test(input.recipe)) fail(tr("planner:s60f91399b638"));
  const [source, rawId] = input.recipe.split(':'); const sourceId = Number(rawId);
  if (!Number.isSafeInteger(sourceId)) fail(tr("planner:s43fcb7f88469"));
  const servings = typeof input.servings === 'string' && /^\d+$/.test(input.servings) ? Number(input.servings) : NaN;
  if (!Number.isInteger(servings) || servings < 1 || servings > 100) fail(tr("planner:sfd1b74f4ad77"));
  return { date: input.date, slot: input.slot, revision, source, sourceId, servings };
}
