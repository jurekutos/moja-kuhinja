import { tr } from '../i18n/index.js';
import { z } from 'zod';
import Decimal from 'decimal.js';
const short = (max = 200) => z.string().trim().max(max);
const integer = (min, max) => z.coerce.number().int().min(min).max(max);
const quantity = () => z.string().trim().transform(v => v.replace(',', '.')).refine(v => v === '' || /^\d{1,7}(\.\d{1,4})?$/.test(v), tr("recipes:s77b27641edbb")).transform(v => v === '' ? null : new Decimal(v).toString());
const schema = () => z.object({
  originalLanguage: z.enum(['sl','en','de']).optional(),
  title: short(160).min(1, tr("recipes:s5e10aebee162")), description: short(3000), prepMinutes: integer(0, 10080), cookMinutes: integer(0, 10080), servings: integer(1, 100), notes: short(10000),
  sourceType: z.enum(['manual', 'url', 'photo', 'cookbook']), sourceUrl: short(2000).refine(v => !v || /^https?:\/\//i.test(v) && URL.canParse(v), tr("recipes:s1636c87749d9")), sourceDescription: short(1000), status: z.enum(['draft', 'published']),
  categories: z.array(short(50).min(1)).max(10),
  ingredients: z.array(z.object({ canonicalIngredientId: z.number().int().positive().nullable().optional(), name: short(150).min(1, tr("recipes:sc9d1a96ce3cf")), quantity:quantity(), unit: short(40).transform(v=>({'kos':'piece','piece':'piece','Stück':'piece','žlica':'tablespoon','tbsp':'tablespoon','EL':'tablespoon','žlička':'teaspoon','tsp':'teaspoon','TL':'teaspoon'})[v] || v), note: short(250) })).max(100),
  steps: z.array(short(3000).min(1, tr("recipes:s8e492a3a4b6d"))).max(100),
}).superRefine((v, ctx) => { if (v.status === 'published' && (!v.ingredients.length || !v.steps.length)) ctx.addIssue({ code: 'custom', path: ['status'], message: tr("recipes:s4bb647fb6081") }); });
export function emptyRecipe() { return { title: '', description: '', prepMinutes: 0, cookMinutes: 0, servings: 2, notes: '', sourceType: 'manual', sourceUrl: '', sourceDescription: '', status: 'draft', categories: [], ingredients: [], steps: [], images: [] }; }
export function parseRecipe(body) {
  let ingredients, steps;
  try { ingredients = JSON.parse(body.ingredientsJson || '[]'); steps = JSON.parse(body.stepsJson || '[]'); } catch { return { success: false, errors: [tr("recipes:s417e6641a735")] }; }
  const raw = { ...body, ingredients, steps, categories: typeof body.categories === 'string' ? [...new Set(body.categories.split(',').map(s => s.trim()).filter(Boolean))] : [] };
  const result = schema().safeParse(raw);
  return result.success ? result : { success: false, errors: result.error.issues.map(i => `${({ title: tr("recipes:s9bbf5bb58882"), prepMinutes: tr("recipes:s4dd38350a781"), cookMinutes: tr("recipes:s815d80bb0441"), servings: tr("recipes:sd97145bb4a5d"), ingredients: tr("recipes:s49527351414c"), steps: tr("recipes:s5d65abb7fada"), sourceUrl: tr("recipes:s8b4ba25419ad"), categories: tr("recipes:s62d5c6fd6eb0"), status: tr("recipes:s4e6c2c30de56") })[i.path[0]] || tr("recipes:sfcf9bfe80f4d")}: ${i.message.startsWith('Too') || i.message.startsWith('Invalid') ? tr("recipes:sa934de1b3bab") : i.message}`) };
}
