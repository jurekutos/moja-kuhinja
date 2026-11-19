import { tr } from '../i18n/index.js';
import path from 'node:path';
function safeReturn(value, fallback, roots) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  const url = new URL(value, 'http://local');
  return roots.includes(url.pathname) ? url.pathname + url.search : fallback;
}
export { safeReturn };
export function communityController(service, config, reads) {
  const renderList = (scope, titleKey, base) => (req, res) => res.render('community/index', { title: tr(titleKey), collectionScope: scope, base, query: req.query, ...service.list(req.user, req.query, scope) });
  return {
    list: renderList('approved', 'community:s454cea33a66c', '/community'),
    mine: renderList('mine', 'community:sf574a39bfff5', '/submissions'),
    reviews: renderList('reviews', 'community:s5975b7ee9ba8', '/admin/reviews'),
    detail(req, res) { const publication = service.get(Number(req.params.id), req.user,req.query.reviewLanguage ? {language:req.query.reviewLanguage,review:true}:{}); const readCounts = reads.record(req.user, publication.id, true); res.render('community/detail', { title: tr("community:s24b8fc2ca347"), publication, readCounts }); },
    async submit(req, res) { const id = await service.submit(Number(req.params.id), req.user,{language:req.body.language,intent:req.body.intent,categoryIds:[req.body.categoryIds||[]].flat().filter(Boolean).map(Number)}); req.session.flash = req.body.intent==='draft' ? tr('common:publicationDraftSaved') : tr("community:s66b4420bc4e0"); const destination=safeReturn(req.body.returnTo,`/community/${id}?reviewLanguage=${encodeURIComponent(req.body.language || req.language)}`,['/settings']); res.redirect(destination.startsWith('/settings') ? destination+'#my-recipes' : destination); },
    review(req, res) { service.review(Number(req.params.id), req.user, req.body.decision, req.body.feedback,req.body.language || req.language); req.session.flash = tr("community:sb84c56ae2187"); res.redirect('/admin/reviews'); },
    favorite(req, res) { const id = Number(req.params.id); service.toggleFavorite(id, req.user); res.redirect(safeReturn(req.body.returnTo, `/community/${id}`, ['/recipes', '/community', '/submissions', '/admin/reviews','/welcome'])); },
    async copy(req, res) { const id = await service.copy(Number(req.params.id), req.user,req.body.householdId===undefined?req.user.householdId:Number(req.body.householdId)); if(req.body.householdId!==undefined)req.session.householdId=Number(req.body.householdId); req.session.flash = tr("community:s781572f4a2ce"); res.redirect(`/recipes/${id}`); },
    submitDraft(req,res){service.submitDraft(Number(req.params.id),req.user,req.body.language);res.redirect(`/community/${req.params.id}?reviewLanguage=${encodeURIComponent(req.body.language)}`);},
    async addLanguage(req,res){const id=await service.addLanguage(Number(req.params.id),req.user,req.body.language,[req.body.categoryIds||[]].flat().filter(Boolean).map(Number),req.body.intent);res.redirect(`/community/${id}?reviewLanguage=${encodeURIComponent(req.body.language)}`);},
    image(req, res) {
      const publication = service.get(Number(req.params.id), req.user,req.query.reviewLanguage ? {language:req.query.reviewLanguage,review:true}:{});
      const index = Number(req.params.index); const image = Number.isSafeInteger(index) && index >= 0 && publication.recipe.images[index];
      if (!image) throw Object.assign(new Error(tr("community:sa5155e38cde6")), { status: 404 });
      res.set('Cache-Control', 'private, no-store').type('webp').sendFile(path.join(config.uploadDir, req.query.size === 'small' ? image.thumbnail : image.filename));
    },
  };
}
