export function workspaceAdminController(workspaces,accounts,deletion) {
  function activeAfter(req) {const spaces=accounts.memberships(req.user.id);if(!spaces.some(s=>s.householdId===req.session.householdId))req.session.householdId=spaces[0]?.householdId ?? null;}
  return {
    rename(req,res) {workspaces.rename(req.user,req.body.name);req.session.flash='Ime prostora je shranjeno.';res.redirect('/workspace');},
    leavePage(req,res) {
      const workspace=accounts.memberships(req.user.id).find(s=>s.householdId===Number(req.params.workspaceId));
      if(!workspace)throw Object.assign(new Error('Prostor ni na voljo.'),{status:404});
      res.render('workspaces/leave',{title:'Zapusti prostor',workspace});
    },
    leave(req,res) {
      const workspace=accounts.memberships(req.user.id).find(s=>s.householdId===Number(req.params.workspaceId));
      if(!workspace)throw Object.assign(new Error('Prostor ni na voljo.'),{status:404});
      if(req.body.confirm!=='leave')throw Object.assign(new Error('Potrdite izstop iz prostora.'),{status:422});
      workspaces.leave(req.user,workspace.householdId);activeAfter(req);req.session.flash='Zapustili ste prostor. Podatki prostora so ohranjeni.';res.redirect('/settings');
    },
    deletePage(req,res) {const workspace=deletion.authorized(req.user,req.user.householdId);res.render('workspaces/delete',{title:'Izbriši prostor',workspace,action:'/workspace/delete',back:'/workspace',errors:[]});},
    async remove(req,res) {
      try {const pending=await deletion.remove(req.user,req.user.householdId,req.body.confirmation);activeAfter(req);req.session.flash=pending?'Prostor je izbrisan. Nekatere datoteke čakajo na čiščenje.':'Prostor je trajno izbrisan.';res.redirect('/settings');}
      catch(error){if(error.status!==422)throw error;const workspace=deletion.authorized(req.user,req.user.householdId);res.status(422).render('workspaces/delete',{title:'Izbriši prostor',workspace,action:'/workspace/delete',back:'/workspace',errors:[error.message]});}
    },
  };
}
