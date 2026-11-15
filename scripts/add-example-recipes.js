import { and, eq, asc } from 'drizzle-orm';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';
import { households, members, recipes } from '../src/db/schema.js';
import { recipeService } from '../src/services/recipes.js';
import { parseRecipe } from '../src/validators/recipe.js';

const examples = [
  {
    title: 'Testenine s paradižnikovo omako',
    description: 'Preprosto in hitro kosilo s paradižnikom, česnom in baziliko. Za dve osebi, pripravljeno v približno 20 minutah.',
    prepMinutes: 5, cookMinutes: 15, categories: 'Kosilo, Hitro, Vegetarijansko',
    ingredients: [
      { name: 'Testenine', quantity: '200', unit: 'g', note: 'špageti ali peresniki' },
      { name: 'Pasiran paradižnik', quantity: '400', unit: 'g', note: '' },
      { name: 'Česen', quantity: '2', unit: 'strok', note: 'drobno sesekljan' },
      { name: 'Oljčno olje', quantity: '1', unit: 'žlica', note: '' },
      { name: 'Bazilika', quantity: '', unit: 'po okusu', note: 'sveža ali posušena' },
      { name: 'Sol', quantity: '', unit: 'po okusu', note: '' },
      { name: 'Črni poper', quantity: '', unit: 'po okusu', note: '' },
    ],
    steps: [
      'V večjem loncu zavrite vodo, jo posolite in dodajte testenine. Kuhajte jih po navodilih na embalaži.',
      'Medtem olupite in drobno sesekljajte česen. V ponvi na zmernem ognju segrejte oljčno olje ter česen pražite približno 30 sekund, da zadiši. Ne pustite, da porjavi.',
      'Prilijte pasiran paradižnik, dodajte baziliko, sol in poper. Na rahlem ognju kuhajte približno 10 minut ter občasno premešajte.',
      'Pred odcejanjem prihranite skodelico vode od kuhanja testenin. Odcejene testenine stresite v omako, premešajte in po potrebi dodajte malo prihranjene vode. Postrezite takoj.',
    ],
  },
  {
    title: 'Omleta s špinačo in sirom',
    description: 'Mehka jajčna omleta s svežo špinačo in naribanim sirom. Preprost zajtrk ali lahka večerja za dve osebi.',
    prepMinutes: 5, cookMinutes: 10, categories: 'Zajtrk, Večerja, Hitro, Vegetarijansko',
    ingredients: [
      { name: 'Jajca', quantity: '4', unit: 'kos', note: '' },
      { name: 'Špinača', quantity: '100', unit: 'g', note: 'sveža, oprana in odcejena' },
      { name: 'Sir', quantity: '50', unit: 'g', note: 'nariban, na primer gavda' },
      { name: 'Mleko', quantity: '2', unit: 'žlica', note: '' },
      { name: 'Oljčno olje', quantity: '1', unit: 'žlica', note: '' },
      { name: 'Sol', quantity: '', unit: 'po okusu', note: '' },
      { name: 'Črni poper', quantity: '', unit: 'po okusu', note: '' },
    ],
    steps: [
      'V skledo ubijte jajca, dodajte mleko, sol in poper ter z vilicami dobro razžvrkljajte. Sir naribajte.',
      'V večji ponvi s prevleko proti prijemanju na zmernem ognju segrejte olje. Dodajte špinačo in jo med mešanjem pražite približno 2 minuti, da oveni. Pustite, da odvečna tekočina izpari.',
      'Špinačo enakomerno razporedite po ponvi in jo prelijte z jajčno zmesjo. Ogenj zmanjšajte ter kuhajte približno 4 do 6 minut. Robove občasno nežno privzdignite z lopatico, da tekoča jajčna zmes steče pod omleto.',
      'Ko je jajčna zmes skoraj strjena, polovico omlete potresite s sirom. Omleto prepognite, pokrijte ponev in kuhajte še 1 do 2 minuti, da so jajca povsem strjena in sir stopljen. Razdelite na dva dela in postrezite.',
    ],
  },
];

const { db, sqlite } = openDatabase(loadConfig().databasePath);
try {
  const homes = db.select({ id: households.id }).from(households).all();
  if (homes.length !== 1) throw new Error('Expected exactly one household; no recipes were added.');
  const owner = db.select({ id: members.userId, householdId: members.householdId }).from(members).where(eq(members.householdId, homes[0].id)).orderBy(asc(members.userId)).get();
  if (!owner) throw new Error('Create the household accounts first.');
  const service = recipeService(db);
  const results = db.transaction(() => examples.map(example => {
    const existing = db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.householdId, owner.householdId), eq(recipes.title, example.title))).get();
    if (existing) return { id: existing.id, title: example.title, result: 'already exists' };
    const { ingredients, steps, ...values } = example;
    const parsed = parseRecipe({ ...values, servings: 2, notes: '', sourceType: 'manual', sourceUrl: '', sourceDescription: '', status: 'published', ingredientsJson: JSON.stringify(ingredients), stepsJson: JSON.stringify(steps) });
    if (!parsed.success) throw new Error(parsed.errors.join('\n'));
    const id = service.save(parsed.data, owner);
    const saved = service.get(id, owner.householdId, owner.id);
    if (saved.ingredients.length !== ingredients.length || saved.steps.length !== steps.length) throw new Error('Recipe verification failed.');
    return { id, title: saved.title, result: 'added' };
  }));
  results.forEach(result => console.log(`${result.result}: ${result.title} (/recipes/${result.id})`));
} finally { sqlite.close(); }
