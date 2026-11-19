import { tr } from '../i18n/index.js';
export function workspaceController(service) {
  const joinPage = (req, res, errors = [], status = 200) => {
    const invitation = service.invite(req.params.token);
    req.session.pendingInvite = req.params.token;
    res.status(status).render('workspaces/join', { title: tr("workspaces:s04fe4de6b156"), invitation, token: req.params.token, errors, values: { name: typeof req.body?.name === 'string' ? req.body.name : '', workspaceName: typeof req.body?.workspaceName === 'string' ? req.body.workspaceName : '' } });
  };
  return {
    page(req, res) { if(!req.user.householdId)return res.render('workspaces/empty',{title:tr("workspaces:sebee8091cd30")});res.render('workspaces/index', { title: tr("workspaces:sd62e71a971f6"), people: service.list(req.user), invitations: req.user.role === 'admin' ? service.invitations(req.user) : [] }); },
    platform(req, res) { res.render('workspaces/invitations', { title: tr("workspaces:saa12975d7062"), invitations: service.invitations(req.user, true) }); },
    invite(req, res) { req.session.inviteLink = service.createInvitation(req.user, req.body); req.session.flash = tr("workspaces:s986491184c6f"); res.redirect('/workspace'); },
    invitePlatform(req, res) { req.session.inviteLink = service.createInvitation(req.user, req.body, true); req.session.flash = tr("workspaces:sf57726114450"); res.redirect('/admin/invitations'); },
    revoke(req, res) { service.revoke(req.user, Number(req.params.invitationId)); req.session.flash = tr("workspaces:s531235b6b3ac"); res.redirect('/workspace'); },
    revokePlatform(req, res) { service.revoke(req.user, Number(req.params.invitationId), true); req.session.flash = tr("workspaces:s531235b6b3ac"); res.redirect('/admin/invitations'); },
    member(req, res) { service.changeMember(req.user, Number(req.params.userId), req.body.role); req.session.flash = tr("workspaces:sd839fd23aae5"); res.redirect('/workspace'); },
    switch(req, res) { req.session.householdId = service.switch(req.user, Number(req.body.householdId)); res.redirect(req.body.destination==='/workspace'?'/workspace':'/kitchen'); },
    join(req, res) { joinPage(req, res); },
    async accept(req, res, next) {
      try {
        const accepted = await service.accept(req.params.token, {...req.body,language:req.language}, req.user);
        req.session.regenerate(error => { if (error) return next(error); req.session.userId = accepted.userId;req.session.authVersion=accepted.authVersion; req.session.householdId = accepted.householdId; req.session.flash = tr("workspaces:s01d7a745e2c0"); req.session.save(error => error ? next(error) : res.redirect('/kitchen')); });
      } catch (error) { if (error.status === 422) return joinPage(req, res, [error.message], 422); throw error; }
    },
  };
}
