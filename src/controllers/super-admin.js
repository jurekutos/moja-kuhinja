export function superAdminController(service,workspaces,deletion,accounts) {
  function detail(req) {const workspace=service.detail(req.user,Number(req.params.workspaceId));return {workspace,people:workspaces.list({householdId:workspace.id})};}
  return {
    dashboard(req,res){res.render('super-admin/index',{title:'Upravljanje platforme',summary:service.summary(req.user)});},
    users(req,res){res.render('super-admin/users',{title:'Uporabniki',...service.users(req.user,req.query),query:req.query});},
    workspaces(req,res){res.render('super-admin/workspaces',{title:'Prostori',...service.workspaces(req.user,req.query),query:req.query});},
    detail(req,res){res.render('super-admin/workspace',{title:'Upravljanje prostora',...detail(req)});},
    statistics(req,res){res.render('super-admin/statistics',{title:'Statistika platforme',stats:service.statistics(req.user)});},
    removeMember(req,res){const id=Number(req.params.workspaceId);service.requireOwner(req.user);if(req.body.confirm!=='remove')throw Object.assign(new Error('Potrdite odstranitev članstva.'),{status:422});workspaces.changeMember({...req.user,householdId:id},Number(req.params.userId),'remove',{superAdmin:true});req.session.flash='Članstvo je odstranjeno.';res.redirect(`/super-admin/workspaces/${id}`);},
    confirmMember(req,res){const data=detail(req);const person=data.people.find(p=>p.userId===Number(req.params.userId));if(!person)throw Object.assign(new Error('Član ne obstaja.'),{status:404});res.render('super-admin/remove-member',{title:'Odstrani članstvo',...data,person});},
    deletePage(req,res){const workspace=service.detail(req.user,Number(req.params.workspaceId));res.render('workspaces/delete',{title:'Izbriši prostor',workspace,action:`/super-admin/workspaces/${workspace.id}/delete`,back:`/super-admin/workspaces/${workspace.id}`,errors:[]});},
    async remove(req,res){
      const id=Number(req.params.workspaceId);service.requireOwner(req.user);
      try {const pending=await deletion.remove(req.user,id,req.body.confirmation);const spaces=accounts.memberships(req.user.id);if(req.session.householdId===id)req.session.householdId=spaces[0]?.householdId ?? null;req.session.flash=pending?'Prostor je izbrisan. Nekatere datoteke čakajo na čiščenje.':'Prostor je trajno izbrisan.';res.redirect('/super-admin/workspaces');}
      catch(error){if(error.status!==422)throw error;const workspace=service.detail(req.user,id);res.status(422).render('workspaces/delete',{title:'Izbriši prostor',workspace,action:`/super-admin/workspaces/${id}/delete`,back:`/super-admin/workspaces/${id}`,errors:[error.message]});}
    },
  };
}
