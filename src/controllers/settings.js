export function settingsController(service) {
  function render(req,res,errors=[],status=200) { res.status(status).render('settings/index',{title:'Moj profil',profile:service.profile(req.user.id),memberships:service.memberships(req.user.id),errors}); }
  return {
    page(req,res){render(req,res);},
    name(req,res) { try { service.rename(req.user,req.body);req.session.flash='Ime je shranjeno.';res.redirect('/settings'); } catch(error) { if(error.status===422)return render(req,res,[error.message],422);throw error; } },
    async password(req,res,next) {
      try {
        const version=await service.changePassword(req.user,req.body);const userId=req.user.id;const householdId=req.user.householdId;
        req.session.regenerate(error=>{if(error)return next(error);req.session.userId=userId;req.session.authVersion=version;req.session.householdId=householdId;req.session.flash='Geslo je spremenjeno. Druge prijave so preklicane.';req.session.save(error=>error?next(error):res.redirect('/settings'));});
      } catch(error) { if(error.status===422)return render(req,res,[error.message],422);throw error; }
    },
  };
}
