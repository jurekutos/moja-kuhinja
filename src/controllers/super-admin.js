import { tr } from '../i18n/index.js';
export function superAdminController(service,workspaces,deletion,accounts) {
  function detail(req) {const workspace=service.detail(req.user,Number(req.params.workspaceId));return {workspace,people:workspaces.list({householdId:workspace.id})};}
  return {
    dashboard(req,res){res.render('super-admin/index',{title:tr("common:s154021b100f0"),summary:service.summary(req.user)});},
    users(req,res){res.render('super-admin/users',{title:tr("common:s9afb49cffa3f"),...service.users(req.user,req.query),query:req.query});},
    workspaces(req,res){res.render('super-admin/workspaces',{title:tr("common:s73af10076090"),...service.workspaces(req.user,req.query),query:req.query});},
    detail(req,res){res.render('super-admin/workspace',{title:tr("common:se182e190a41f"),...detail(req)});},
    statistics(req,res){res.render('super-admin/statistics',{title:tr("common:s067c2e93e64b"),stats:service.statistics(req.user)});},
    removeMember(req,res){const id=Number(req.params.workspaceId);service.requireOwner(req.user);if(req.body.confirm!=='remove')throw Object.assign(new Error(tr("common:s9b17b749d689")),{status:422});workspaces.changeMember({...req.user,householdId:id},Number(req.params.userId),'remove',{superAdmin:true});req.session.flash=tr("common:s4c30fcfadef4");res.redirect(`/super-admin/workspaces/${id}`);},
    confirmMember(req,res){const data=detail(req);const person=data.people.find(p=>p.userId===Number(req.params.userId));if(!person)throw Object.assign(new Error(tr("common:se058808ac6db")),{status:404});res.render('super-admin/remove-member',{title:tr("common:s5bf801cb83eb"),...data,person});},
    deletePage(req,res){const workspace=service.detail(req.user,Number(req.params.workspaceId));res.render('workspaces/delete',{title:tr("common:sff1336ba9910"),workspace,action:`/super-admin/workspaces/${workspace.id}/delete`,back:`/super-admin/workspaces/${workspace.id}`,errors:[]});},
    async remove(req,res){
      const id=Number(req.params.workspaceId);service.requireOwner(req.user);
      try {const pending=await deletion.remove(req.user,id,req.body.confirmation);const spaces=accounts.memberships(req.user.id);if(req.session.householdId===id)req.session.householdId=spaces[0]?.householdId ?? null;req.session.flash=pending?tr("common:sa11d52fa4287"):tr("common:s215c6b6444e7");res.redirect('/super-admin/workspaces');}
      catch(error){if(error.status!==422)throw error;const workspace=service.detail(req.user,id);res.status(422).render('workspaces/delete',{title:tr("common:sff1336ba9910"),workspace,action:`/super-admin/workspaces/${id}/delete`,back:`/super-admin/workspaces/${id}`,errors:[error.message]});}
    },
  };
}
