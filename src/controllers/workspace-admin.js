import { tr } from '../i18n/index.js';
export function workspaceAdminController(workspaces,accounts,deletion) {
  function activeAfter(req) {const spaces=accounts.memberships(req.user.id);if(!spaces.some(s=>s.householdId===req.session.householdId))req.session.householdId=spaces[0]?.householdId ?? null;}
  return {
    rename(req,res) {workspaces.rename(req.user,req.body.name);req.session.flash=tr("workspaces:sc66e4dcffd78");res.redirect('/workspace');},
    leavePage(req,res) {
      const workspace=accounts.memberships(req.user.id).find(s=>s.householdId===Number(req.params.workspaceId));
      if(!workspace)throw Object.assign(new Error(tr("workspaces:s86f92f71b92d")),{status:404});
      res.render('workspaces/leave',{title:tr("workspaces:saad8662cfc9d"),workspace});
    },
    leave(req,res) {
      const workspace=accounts.memberships(req.user.id).find(s=>s.householdId===Number(req.params.workspaceId));
      if(!workspace)throw Object.assign(new Error(tr("workspaces:s86f92f71b92d")),{status:404});
      if(req.body.confirm!=='leave')throw Object.assign(new Error(tr("workspaces:sbcc572889657")),{status:422});
      workspaces.leave(req.user,workspace.householdId);activeAfter(req);req.session.flash=tr("workspaces:sa71708705fa8");res.redirect('/settings');
    },
    deletePage(req,res) {const workspace=deletion.authorized(req.user,req.user.householdId);res.render('workspaces/delete',{title:tr("workspaces:sff1336ba9910"),workspace,action:'/workspace/delete',back:'/workspace',errors:[]});},
    async remove(req,res) {
      try {const pending=await deletion.remove(req.user,req.user.householdId,req.body.confirmation);activeAfter(req);req.session.flash=pending?tr("workspaces:sa11d52fa4287"):tr("workspaces:s215c6b6444e7");res.redirect('/settings');}
      catch(error){if(error.status!==422)throw error;const workspace=deletion.authorized(req.user,req.user.householdId);res.status(422).render('workspaces/delete',{title:tr("workspaces:sff1336ba9910"),workspace,action:'/workspace/delete',back:'/workspace',errors:[error.message]});}
    },
  };
}
