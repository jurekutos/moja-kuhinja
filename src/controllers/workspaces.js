export function workspaceController(service) {
  const joinPage = (req, res, errors = [], status = 200) => {
    const invitation = service.invite(req.params.token);
    req.session.pendingInvite = req.params.token;
    res.status(status).render('workspaces/join', { title: 'Povabilo v kuhinjo', invitation, token: req.params.token, errors, values: { name: typeof req.body?.name === 'string' ? req.body.name : '', workspaceName: typeof req.body?.workspaceName === 'string' ? req.body.workspaceName : '' } });
  };
  return {
    page(req, res) { res.render('workspaces/index', { title: 'Moj prostor', people: service.list(req.user), invitations: req.user.role === 'admin' ? service.invitations(req.user) : [] }); },
    platform(req, res) { res.render('workspaces/invitations', { title: 'Povabi prijatelje', invitations: service.invitations(req.user, true) }); },
    invite(req, res) { req.session.inviteLink = service.createInvitation(req.user, req.body); req.session.flash = 'Povabilo je pripravljeno. Kopirajte povezavo in jo delite s povabljeno osebo.'; res.redirect('/workspace'); },
    invitePlatform(req, res) { req.session.inviteLink = service.createInvitation(req.user, req.body, true); req.session.flash = 'Povabilo za ustvarjanje novega prostora je pripravljeno.'; res.redirect('/admin/invitations'); },
    revoke(req, res) { service.revoke(req.user, Number(req.params.invitationId)); req.session.flash = 'Povabilo je preklicano.'; res.redirect('/workspace'); },
    revokePlatform(req, res) { service.revoke(req.user, Number(req.params.invitationId), true); req.session.flash = 'Povabilo je preklicano.'; res.redirect('/admin/invitations'); },
    member(req, res) { service.changeMember(req.user, Number(req.params.userId), req.body.role); req.session.flash = 'Članstvo je posodobljeno.'; res.redirect('/workspace'); },
    switch(req, res) { req.session.householdId = service.switch(req.user, Number(req.body.householdId)); res.redirect('/'); },
    join(req, res) { joinPage(req, res); },
    async accept(req, res, next) {
      try {
        const accepted = await service.accept(req.params.token, req.body, req.user);
        req.session.regenerate(error => { if (error) return next(error); req.session.userId = accepted.userId; req.session.householdId = accepted.householdId; req.session.flash = 'Dobrodošli v svojem kuharskem prostoru!'; req.session.save(error => error ? next(error) : res.redirect('/')); });
      } catch (error) { if (error.status === 422) return joinPage(req, res, [error.message], 422); throw error; }
    },
  };
}
