const fail = message => { throw Object.assign(new Error(message), { status: 422 }); };
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2100;
}
export function parseMeal(input, { requireRecipe = true } = {}) {
  if (!validDate(input.date)) fail('Izberite veljaven datum med letoma 1900 in 2100.');
  if (!['lunch', 'dinner'].includes(input.slot)) fail('Izberite kosilo ali večerjo.');
  const revision = input.revision ?? '';
  if (typeof revision !== 'string' || revision !== '' && !/^[a-f0-9-]{36}$/.test(revision)) fail('Podatki obrazca niso veljavni. Ponovno odprite obrok.');
  if (!requireRecipe) return { date: input.date, slot: input.slot, revision };
  if (typeof input.recipe !== 'string' || !/^(workspace|public):[1-9]\d*$/.test(input.recipe)) fail('Izberite recept.');
  const [source, rawId] = input.recipe.split(':'); const sourceId = Number(rawId);
  if (!Number.isSafeInteger(sourceId)) fail('Izberite veljaven recept.');
  const servings = typeof input.servings === 'string' && /^\d+$/.test(input.servings) ? Number(input.servings) : NaN;
  if (!Number.isInteger(servings) || servings < 1 || servings > 100) fail('Število porcij mora biti celo število od 1 do 100.');
  return { date: input.date, slot: input.slot, revision, source, sourceId, servings };
}
