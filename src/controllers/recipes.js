import { tr } from '../i18n/index.js';
import { emptyRecipe, parseRecipe } from '../validators/recipe.js';
import { parseComment } from '../validators/comment.js';
import { safeReturn } from './community.js';
export function recipeController(service, imageService, comments, catalog, reads, globalCatalog) {
  const read = req => service.get(Number(req.params.id), req.user.householdId, req.user.id, ['sl','en','de'].includes(req.query.lang) ? req.query.lang : undefined);
  const flash = (req, message) => { req.session.flash = message; };
  return {
    dashboard(req, res) { if(!req.user.householdId)return res.render('workspaces/empty',{title:tr("recipes:sebee8091cd30")});const result = service.list(req.user); const favorites = service.list(req.user, { favorite: '1' }); res.render('dashboard', { title: tr("recipes:s2402237814d8"), recipes: result.recipes.slice(0, 4), count: result.count, favoriteCount: favorites.count }); },
    list(req, res) {
      const result = catalog.list(req.user, req.query);
      const viewLink = next => { const params = new URLSearchParams(); for (const [key, value] of Object.entries(result.query)) if (typeof value === 'string' && key !== 'page' && key !== 'view') params.set(key, value); params.set('view', next); return '/recipes?' + params.toString(); };
      res.render('recipes/index', { title: tr("recipes:s1ad7bccda1ea"), ...result, viewLink });
    },
    new(req, res) { res.render('recipes/form', { title: tr("recipes:sc0961b8473ff"), recipe: { ...emptyRecipe(), originalLanguage:req.user.language }, errors: [], preview: false }); },
    edit(req, res) { res.render('recipes/form', { title: tr("recipes:s49c1c23a4a70"), recipe: service.requireAuthor(Number(req.params.id),req.user), errors: [], preview: false }); },
    detail(req, res) { const recipe = read(req); const readCounts = reads.record(req.user, recipe.id); res.render('recipes/detail', { title: tr("recipes:sfde0f6c0b56c"), recipe, globalCategories:globalCatalog.list('categories',req.language,true), readCounts, cooking: false, preview: false, comments: comments.list(recipe.id, req.user), commentError: '', commentBody: '' }); },
    cook(req, res) { res.render('recipes/detail', { title: tr("recipes:s38850af64a29"), recipe: read(req), cooking: true, preview: false }); },
    save(req, res) {
      const id = req.params.id ? Number(req.params.id) : undefined;
      const existing = id ? service.requireAuthor(id,req.user) : emptyRecipe();
      const result = parseRecipe(req.body);
      let rawIngredients = [], rawSteps = [];
      try { rawIngredients = JSON.parse(req.body.ingredientsJson || '[]'); rawSteps = JSON.parse(req.body.stepsJson || '[]'); } catch { /* validation displays the error */ }
      const submitted = { ...existing, ...Object.fromEntries(['originalLanguage', 'title', 'description', 'prepMinutes', 'cookMinutes', 'servings', 'notes', 'sourceType', 'sourceUrl', 'sourceDescription', 'status'].map(k => [k, typeof req.body[k] === 'string' ? req.body[k] : existing[k]])), categories: typeof req.body.categories === 'string' ? req.body.categories.split(',') : [], ingredients: Array.isArray(rawIngredients) ? rawIngredients.filter(v => v && typeof v === 'object').map(v => ({ canonicalIngredientId:Number.isSafeInteger(v.canonicalIngredientId)?v.canonicalIngredientId:null, name: String(v.name ?? ''), quantity: String(v.quantity ?? ''), unit: String(v.unit ?? ''), note: String(v.note ?? '') })) : [], steps: Array.isArray(rawSteps) ? rawSteps.map(String) : [] };
      if (!result.success) return res.status(422).render('recipes/form', { title: tr("recipes:sb326ea44e28f"), recipe: submitted, errors: result.errors, preview: false });
      if (req.body.intent === 'preview') return res.render('recipes/form', { title: tr("recipes:s32519973467a"), recipe: { ...existing, ...result.data }, errors: [], preview: true });
      const savedId = service.save(result.data, req.user, id);
      flash(req, result.data.status === 'draft' ? tr("recipes:s8598e23a73e1") : tr("recipes:s639987ab598a"));
      res.redirect(`/recipes/${savedId}${id ? '' : '/edit#photos'}`);
    },
    async remove(req, res) { const recipe = read(req); const rows = service.remove(recipe.id, req.user); await imageService.unlinkRows(rows); flash(req, tr("recipes:sf0727dc4a198")); res.redirect('/recipes'); },
    favorite(req, res) { const recipe = read(req); service.toggleFavorite(recipe.id, req.user); res.redirect(safeReturn(req.body.returnTo, `/recipes/${recipe.id}`, ['/', '/recipes'])); },
    notes(req, res) { const recipe = read(req); service.saveNotes(recipe.id, req.user, req.body.notes); flash(req, tr("recipes:sd096b0a152ce")); res.redirect(`/recipes/${recipe.id}#private-notes`); },
    addComment(req, res) {
      const recipe = read(req);
      const result = parseComment(req.body.body);
      if (!result.success) return res.status(422).render('recipes/detail', { title: tr("recipes:sfde0f6c0b56c"), recipe, globalCategories:globalCatalog.list('categories',req.language,true), cooking: false, preview: false, comments: comments.list(recipe.id, req.user), commentError: result.error, commentBody: typeof req.body.body === 'string' ? req.body.body : '' });
      comments.add(recipe.id, req.user, result.data);
      flash(req, tr("recipes:s9ad4a14d580a")); res.redirect(`/recipes/${recipe.id}#comments`);
    },
    deleteComment(req, res) {
      const recipe = read(req);
      if (!/^\d+$/.test(req.params.commentId) || !Number.isSafeInteger(Number(req.params.commentId))) throw Object.assign(new Error(tr("recipes:s004ef9618f91")), { status: 404 });
      comments.remove(recipe.id, Number(req.params.commentId), req.user);
      flash(req, tr("recipes:s66bf37bd992c")); res.redirect(`/recipes/${recipe.id}#comments`);
    },
    async upload(req, res) { const recipe = read(req); if (!req.files?.length) throw Object.assign(new Error(tr("recipes:sb56f157007e4")), { status: 422 }); await imageService.add(recipe.id, req.files); flash(req, tr("recipes:s5863a86e4a76")); res.redirect(`/recipes/${recipe.id}/edit#photos`); },
  };
}
