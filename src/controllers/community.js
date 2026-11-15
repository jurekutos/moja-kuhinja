import path from 'node:path';
function safeReturn(value, fallback, roots) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  const url = new URL(value, 'http://local');
  return roots.includes(url.pathname) ? url.pathname + url.search : fallback;
}
export { safeReturn };
export function communityController(service, config) {
  const renderList = (scope, title, base) => (req, res) => res.render('community/index', { title, collectionScope: scope, base, query: req.query, ...service.list(req.user, req.query, scope) });
  return {
    list: renderList('approved', 'Skupna kuharica', '/community'),
    mine: renderList('mine', 'Oddaje mojega prostora', '/submissions'),
    reviews: renderList('reviews', 'Pregled receptov', '/admin/reviews'),
    detail(req, res) { res.render('community/detail', { title: 'Skupni recept', publication: service.get(Number(req.params.id), req.user) }); },
    async submit(req, res) { const id = await service.submit(Number(req.params.id), req.user); req.session.flash = 'Recept je poslan v pregled. Zasebne opombe in komentarji niso vključeni.'; res.redirect(`/community/${id}`); },
    review(req, res) { service.review(Number(req.params.id), req.user, req.body.decision, req.body.feedback); req.session.flash = 'Odločitev je shranjena.'; res.redirect('/admin/reviews'); },
    favorite(req, res) { const id = Number(req.params.id); service.toggleFavorite(id, req.user); res.redirect(safeReturn(req.body.returnTo, `/community/${id}`, ['/recipes', '/community', '/submissions', '/admin/reviews'])); },
    async copy(req, res) { const id = await service.copy(Number(req.params.id), req.user); req.session.flash = 'Kopija recepta je dodana v vaš prostor. Urejate jo lahko neodvisno od skupne kuharice.'; res.redirect(`/recipes/${id}`); },
    image(req, res) {
      const publication = service.get(Number(req.params.id), req.user);
      const index = Number(req.params.index); const image = Number.isSafeInteger(index) && index >= 0 && publication.recipe.images[index];
      if (!image) throw Object.assign(new Error('Slika ni na voljo.'), { status: 404 });
      res.set('Cache-Control', 'private, no-store').type('webp').sendFile(path.join(config.uploadDir, req.query.size === 'small' ? image.thumbnail : image.filename));
    },
  };
}
