import { z } from 'zod';
import Decimal from 'decimal.js';
const short = (max = 200) => z.string().trim().max(max);
const integer = (min, max) => z.coerce.number().int().min(min).max(max);
const quantity = z.string().trim().transform(v => v.replace(',', '.')).refine(v => v === '' || /^\d{1,7}(\.\d{1,4})?$/.test(v), 'Količina mora biti pozitivno število z največ štirimi decimalkami.').transform(v => v === '' ? null : new Decimal(v).toString());
const schema = z.object({
  title: short(160).min(1, 'Vnesite naslov recepta.'), description: short(3000), prepMinutes: integer(0, 10080), cookMinutes: integer(0, 10080), servings: integer(1, 100), notes: short(10000),
  sourceType: z.enum(['manual', 'url', 'photo', 'cookbook']), sourceUrl: short(2000).refine(v => !v || /^https?:\/\//i.test(v) && URL.canParse(v), 'Vnesite veljaven spletni naslov http ali https.'), sourceDescription: short(1000), status: z.enum(['draft', 'published']),
  categories: z.array(short(50).min(1)).max(10),
  ingredients: z.array(z.object({ name: short(150).min(1, 'Vnesite ime sestavine.'), quantity, unit: short(40), note: short(250) })).max(100),
  steps: z.array(short(3000).min(1, 'Korak ne sme biti prazen.')).max(100),
}).superRefine((v, ctx) => { if (v.status === 'published' && (!v.ingredients.length || !v.steps.length)) ctx.addIssue({ code: 'custom', path: ['status'], message: 'Objavljen recept potrebuje vsaj eno sestavino in en korak.' }); });
export function emptyRecipe() { return { title: '', description: '', prepMinutes: 0, cookMinutes: 0, servings: 2, notes: '', sourceType: 'manual', sourceUrl: '', sourceDescription: '', status: 'draft', categories: [], ingredients: [], steps: [], images: [] }; }
export function parseRecipe(body) {
  let ingredients, steps;
  try { ingredients = JSON.parse(body.ingredientsJson || '[]'); steps = JSON.parse(body.stepsJson || '[]'); } catch { return { success: false, errors: ['Seznama sestavin ali korakov ni mogoče prebrati.'] }; }
  const raw = { ...body, ingredients, steps, categories: typeof body.categories === 'string' ? [...new Set(body.categories.split(',').map(s => s.trim()).filter(Boolean))] : [] };
  const result = schema.safeParse(raw);
  return result.success ? result : { success: false, errors: result.error.issues.map(i => `${({ title: 'Naslov', prepMinutes: 'Priprava', cookMinutes: 'Kuhanje', servings: 'Porcije', ingredients: 'Sestavine', steps: 'Koraki', sourceUrl: 'Vir', categories: 'Kategorije', status: 'Stanje' })[i.path[0]] || 'Podatki'}: ${i.message.startsWith('Too') || i.message.startsWith('Invalid') ? 'Preverite vrednost in dovoljeno dolžino.' : i.message}`) };
}
