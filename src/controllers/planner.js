import { mondayOf, dateLabel } from '../services/planner-dates.js';
export function plannerController(planner, catalog) {
  function form(req, res, errors = [], values = null) {
    const input = values || req.query;
    const entry = planner.get(req.user,input.date,input.slot);
    const week = mondayOf(input.date);
    let recipe = typeof input.recipe === 'string' ? input.recipe : entry?.available ? `${entry.recipeId ? 'workspace' : 'public'}:${entry.recipeId || entry.publicationId}` : '';
    let selected = null;
    if (recipe) {
      if (!/^(workspace|public):[1-9]\d*$/.test(recipe) || !Number.isSafeInteger(Number(recipe.split(':')[1]))) { errors.push('Izberite veljaven recept.'); recipe = ''; }
      else {
        const [type,id] = recipe.split(':');
        try { selected = planner.selection(req.user,type,Number(id)); } catch(error) { if (error.status !== 404) throw error; errors.push(error.message); recipe = ''; }
      }
    }
    const query = { q: req.query.q, view: req.query.view || 'all', favorite: req.query.favorite, page: req.query.page, sort: 'alpha' };
    const choices = catalog.list(req.user,query,{publishedOnly:true});
    const choiceLink = value => { const params = new URLSearchParams({date:input.date,slot:input.slot,recipe:value,view:choices.view}); if (typeof query.q === 'string') params.set('q',query.q); if (query.favorite === '1') params.set('favorite','1'); return '/planner/meal?' + params.toString(); };
    const choicePage = page => { const params = new URLSearchParams({date:input.date,slot:input.slot,view:choices.view,page:String(page)}); if (recipe) params.set('recipe',recipe); if (typeof query.q === 'string') params.set('q',query.q); if (query.favorite === '1') params.set('favorite','1'); return '/planner/meal?' + params.toString(); };
    const currentKey = entry?.available ? `${entry.recipeId ? 'workspace' : 'public'}:${entry.recipeId || entry.publicationId}` : '';
    res.status(errors.length ? 422 : 200).render('planner/meal', { title:'Načrtuj obrok', date:input.date,slot:input.slot,week,dateLabel,entry,selected,recipe,servings:values ? input.servings : recipe === currentKey && entry ? entry.servings : selected?.servings || 2,revision:values ? input.revision : entry?.revision || '',errors,choices,choiceLink,choicePage,query });
  }
  return {
    index(req,res) { res.render('planner/index',{title:'Jedilnik',...planner.week(req.user,req.query.week)}); },
    preferences(req,res) { const week=mondayOf(req.body.week); planner.configure(req.user,req.body.meals); req.session.flash='Prikaz obrokov je shranjen za vaš prostor. Skriti obroki ostanejo shranjeni.'; res.redirect(`/planner?week=${week}`); },
    meal(req,res) { form(req,res); },
    save(req,res) {
      try { const week = planner.save(req.user,req.body); req.session.flash = 'Obrok je shranjen v skupni jedilnik.'; res.redirect(`/planner?week=${week}#day-${req.body.date}`); }
      catch(error) { if (error.status === 422) return form(req,res,[error.message],req.body); if (error.status === 409) return res.status(409).render('planner/conflict',{title:'Jedilnik je spremenjen',week:mondayOf(req.body.date)}); throw error; }
    },
    remove(req,res) { try { const week = planner.remove(req.user,req.body); req.session.flash = 'Obrok je odstranjen iz jedilnika.'; res.redirect(`/planner?week=${week}#day-${req.body.date}`); } catch(error) { if (error.status === 409) return res.status(409).render('planner/conflict',{title:'Jedilnik je spremenjen',week:mondayOf(req.body.date)}); throw error; } },
  };
}
