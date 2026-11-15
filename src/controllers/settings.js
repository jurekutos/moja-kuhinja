import { tr } from '../i18n/index.js';
export function settingsController(service, recipes, catalog) {
  function render(req,res,errors=[],status=200) {
    const publishing=service.publishingRecipes(req.user,req.query);
    publishing.rows=publishing.rows.map(row=>({...row,recipe:recipes.get(row.id,req.user.householdId,req.user.id,req.language)}));
    res.status(status).render('settings/index',{title:tr("auth:s35e2ed99f9ee"),profile:service.profile(req.user.id),memberships:service.memberships(req.user.id),errors,publishing,globalCategories:catalog.list('categories',req.language,true)});
  }
  return {
    page(req,res){render(req,res);},
    name(req,res) { try { service.rename(req.user,req.body);req.session.flash=tr("auth:s7411afa77e8d");res.redirect('/settings'); } catch(error) { if(error.status===422)return render(req,res,[error.message],422);throw error; } },
    async password(req,res,next) {
      try {
        const version=await service.changePassword(req.user,req.body);const userId=req.user.id;const householdId=req.user.householdId;
        req.session.regenerate(error=>{if(error)return next(error);req.session.userId=userId;req.session.authVersion=version;req.session.householdId=householdId;req.session.flash=tr("auth:s2eea39e5da70");req.session.save(error=>error?next(error):res.redirect('/settings'));});
      } catch(error) { if(error.status===422)return render(req,res,[error.message],422);throw error; }
    },
  };
}
