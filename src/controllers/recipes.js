import { emptyRecipe, parseRecipe } from '../validators/recipe.js';
import { parseComment } from '../validators/comment.js';
import { safeReturn } from './community.js';
export function recipeController(service, imageService, comments, catalog) {
  const read = req => service.get(Number(req.params.id), req.user.householdId, req.user.id);
  const flash = (req, message) => { req.session.flash = message; };
  return {
    dashboard(req, res) { const result = service.list(req.user); const favorites = service.list(req.user, { favorite: '1' }); res.render('dashboard', { title: 'Domov', recipes: result.recipes.slice(0, 4), count: result.count, favoriteCount: favorites.count }); },
    list(req, res) {
      const result = catalog.list(req.user, req.query);
      const viewLink = next => { const params = new URLSearchParams(); for (const [key, value] of Object.entries(result.query)) if (typeof value === 'string' && key !== 'page' && key !== 'view') params.set(key, value); params.set('view', next); return '/recipes?' + params.toString(); };
      res.render('recipes/index', { title: 'Recepti', ...result, viewLink });
    },
    new(req, res) { res.render('recipes/form', { title: 'Nov recept', recipe: emptyRecipe(), errors: [], preview: false }); },
    edit(req, res) { res.render('recipes/form', { title: 'Uredi recept', recipe: read(req), errors: [], preview: false }); },
    detail(req, res) { const recipe = read(req); res.render('recipes/detail', { title: 'Recept', recipe, cooking: false, preview: false, comments: comments.list(recipe.id, req.user), commentError: '', commentBody: '' }); },
    cook(req, res) { res.render('recipes/detail', { title: 'Kuhajmo skupaj', recipe: read(req), cooking: true, preview: false }); },
    save(req, res) {
      const id = req.params.id ? Number(req.params.id) : undefined;
      const existing = id ? read(req) : emptyRecipe();
      const result = parseRecipe(req.body);
      let rawIngredients = [], rawSteps = [];
      try { rawIngredients = JSON.parse(req.body.ingredientsJson || '[]'); rawSteps = JSON.parse(req.body.stepsJson || '[]'); } catch { /* validation displays the error */ }
      const submitted = { ...existing, ...Object.fromEntries(['title', 'description', 'prepMinutes', 'cookMinutes', 'servings', 'notes', 'sourceType', 'sourceUrl', 'sourceDescription', 'status'].map(k => [k, typeof req.body[k] === 'string' ? req.body[k] : existing[k]])), categories: typeof req.body.categories === 'string' ? req.body.categories.split(',') : [], ingredients: Array.isArray(rawIngredients) ? rawIngredients.filter(v => v && typeof v === 'object').map(v => ({ name: String(v.name ?? ''), quantity: String(v.quantity ?? ''), unit: String(v.unit ?? ''), note: String(v.note ?? '') })) : [], steps: Array.isArray(rawSteps) ? rawSteps.map(String) : [] };
      if (!result.success) return res.status(422).render('recipes/form', { title: 'Preverite recept', recipe: submitted, errors: result.errors, preview: false });
      if (req.body.intent === 'preview') return res.render('recipes/form', { title: 'Predogled recepta', recipe: { ...existing, ...result.data }, errors: [], preview: true });
      const savedId = service.save(result.data, req.user, id);
      flash(req, result.data.status === 'draft' ? 'Osnutek je shranjen.' : 'Recept je shranjen.');
      res.redirect(`/recipes/${savedId}${id ? '' : '/edit#photos'}`);
    },
    async remove(req, res) { const recipe = read(req); const rows = service.remove(recipe.id, req.user); await imageService.unlinkRows(rows); flash(req, 'Recept je izbrisan.'); res.redirect('/recipes'); },
    favorite(req, res) { const recipe = read(req); service.toggleFavorite(recipe.id, req.user); res.redirect(safeReturn(req.body.returnTo, `/recipes/${recipe.id}`, ['/', '/recipes'])); },
    notes(req, res) { const recipe = read(req); service.saveNotes(recipe.id, req.user, req.body.notes); flash(req, 'Zasebne opombe so shranjene.'); res.redirect(`/recipes/${recipe.id}#private-notes`); },
    addComment(req, res) {
      const recipe = read(req);
      const result = parseComment(req.body.body);
      if (!result.success) return res.status(422).render('recipes/detail', { title: 'Recept', recipe, cooking: false, preview: false, comments: comments.list(recipe.id, req.user), commentError: result.error, commentBody: typeof req.body.body === 'string' ? req.body.body : '' });
      comments.add(recipe.id, req.user, result.data);
      flash(req, 'Komentar je dodan.'); res.redirect(`/recipes/${recipe.id}#comments`);
    },
    deleteComment(req, res) {
      const recipe = read(req);
      if (!/^\d+$/.test(req.params.commentId) || !Number.isSafeInteger(Number(req.params.commentId))) throw Object.assign(new Error('Komentar ne obstaja.'), { status: 404 });
      comments.remove(recipe.id, Number(req.params.commentId), req.user);
      flash(req, 'Komentar je izbrisan.'); res.redirect(`/recipes/${recipe.id}#comments`);
    },
    async upload(req, res) { const recipe = read(req); if (!req.files?.length) throw Object.assign(new Error('Najprej izberite sliko.'), { status: 422 }); await imageService.add(recipe.id, req.files); flash(req, 'Slike so dodane.'); res.redirect(`/recipes/${recipe.id}/edit#photos`); },
  };
}
