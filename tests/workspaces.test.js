import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import argon2 from 'argon2';
import request from 'supertest';
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/index.js';
import * as t from '../src/db/schema.js';
import { workspaceService } from '../src/services/workspaces.js';
import { recipeService } from '../src/services/recipes.js';
import { communityService } from '../src/services/community.js';
import { imageService } from '../src/services/images.js';
import { parseRecipe } from '../src/validators/recipe.js';
import { recipeCatalog } from '../src/services/recipe-catalog.js';

let directory, c, app, ws, recipes, community, images, admin, editor, viewer, outsider, adminToken, editorToken, viewerToken, outsiderToken;
const password = 'test-passphrase';
const adminUser = { id: 1, householdId: 1, name: 'Admin', email: 'admin@example.test', role: 'admin', isModerator: true };
const editorUser = { id: 2, householdId: 1, name: 'Editor', email: 'editor@example.test', role: 'editor', isModerator: false };
const outsideUser = { id: 4, householdId: 2, name: 'Other', email: 'other@example.test', role: 'admin', isModerator: false };
const getToken = response => response.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
async function login(agent, email) { const page = await agent.get('/sl/login').expect(200); await agent.post('/sl/login').type('form').send({ _csrf: getToken(page), email, password }).expect(302); return getToken(await agent.get('/sl/recipes').expect(200)); }
function sample(title = 'Skupni recept') {
  const parsed = parseRecipe({ title, description: 'Opis recepta', prepMinutes: 5, cookMinutes: 10, servings: 2, notes: 'ZASEBNA OPOMBA', status: 'published', sourceType: 'manual', sourceUrl: '', sourceDescription: '', categories: 'Hitro', ingredientsJson: JSON.stringify([{ name: 'Testenine', quantity: '200', unit: 'g', note: '' }]), stepsJson: JSON.stringify(['Skuhajte in postrezite.']) });
  assert.ok(parsed.success); return parsed.data;
}
before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'moja-workspaces-')); c = openDatabase(path.join(directory, 'db.sqlite'), true);
  c.db.insert(t.households).values([{id:1,name:'Dom'}, {id:2,name:'Drug dom'}]).run();
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  for (const [id,name,role,householdId] of [[1,'Admin','admin',1],[2,'Editor','editor',1],[3,'Viewer','viewer',1],[4,'Other','admin',2]]) {
    c.db.insert(t.users).values({id,name,email:`${name.toLowerCase()}@example.test`,passwordHash:hash,isModerator:id===1}).run();
    c.db.insert(t.members).values({userId:id,householdId,role}).run();
  }
  app = createApp({...c,config:{secret:'test-secret-'.repeat(5),production:false,uploadDir:path.join(directory,'uploads'),trustProxy:false}});
  ws = workspaceService(c.db); recipes = recipeService(c.db); images = imageService(c.db,path.join(directory,'uploads')); community = communityService(c.db,recipes,images,path.join(directory,'uploads'));
  admin = request.agent(app); editor = request.agent(app); viewer = request.agent(app); outsider = request.agent(app);
  adminToken = await login(admin,'admin@example.test'); editorToken = await login(editor,'editor@example.test'); viewerToken = await login(viewer,'viewer@example.test'); outsiderToken = await login(outsider,'other@example.test');
});
after(async () => { app.locals.sessionStore.close(); c.sqlite.close(); await fs.rm(directory,{recursive:true,force:true}); });

test('public landing and protected workspace/community pages render', async () => {
  const page = await request(app).get('/sl/').expect(200); assert.match(page.text,/Vsi tvoji recepti/); assert.ok(!page.text.includes('ZASEBNA OPOMBA'));
  for (const url of ['/workspace','/community','/submissions','/admin/invitations','/admin/reviews']) await admin.get('/sl'+url).expect(200);
  await viewer.get('/sl/admin/invitations').expect(403); await outsider.get('/sl/admin/reviews').expect(403);
});
test('viewer reads, favorites, comments and private notes but cannot modify shared recipes or invite', async () => {
  const id = recipes.save(sample(), adminUser);
  await viewer.get(`/sl/recipes/${id}`).expect(200); await viewer.get('/sl/recipes/new').expect(403); await viewer.get(`/sl/recipes/${id}/edit`).expect(403);
  for (const suffix of ['', '/delete','/submit','/images']) await viewer.post(`/sl/recipes/${id}${suffix}`).type('form').send({_csrf:viewerToken}).expect(403);
  await viewer.post('/sl/recipes').type('form').send({_csrf:viewerToken}).expect(403);
  await viewer.post('/sl/workspace/invitations').type('form').send({_csrf:viewerToken,email:'x@example.test',role:'admin'}).expect(403);
  await viewer.post(`/sl/recipes/${id}/comments`).type('form').send({_csrf:viewerToken,body:'Dobro!'}).expect(302);
  await viewer.post(`/sl/recipes/${id}/notes`).type('form').send({_csrf:viewerToken,notes:'Samo moje'}).expect(302);
  assert.equal(recipes.get(id,1,3).notes,'Samo moje'); assert.equal(recipes.get(id,1,1).notes,'ZASEBNA OPOMBA');
});
test('quick hearts retain list filters and reject external redirects', async () => {
  const id = recipes.save(sample('Srček'),adminUser);
  await viewer.post(`/sl/recipes/${id}/favorite`).type('form').send({_csrf:viewerToken,returnTo:'/recipes?q=Sr%C4%8Dek&sort=alpha'}).expect(302).expect('Location','/sl/recipes?q=Sr%C4%8Dek&sort=alpha');
  assert.equal(recipes.get(id,1,3).favorite,true); assert.equal(recipes.get(id,1,1).favorite,false);
  const page = await viewer.get('/sl/recipes?q=Sr%C4%8Dek').expect(200); assert.match(page.text,/aria-pressed="true"/);
  await viewer.post(`/sl/recipes/${id}/favorite`).type('form').send({_csrf:viewerToken,returnTo:'//evil.test'}).expect(302).expect('Location',`/sl/recipes/${id}`);
});
test('admins manage roles but cannot demote or remove the final admin; role changes apply immediately', async () => {
  await editor.post('/sl/workspace/members/3').type('form').send({_csrf:editorToken,role:'admin'}).expect(403);
  await admin.post('/sl/workspace/members/1').type('form').send({_csrf:adminToken,role:'viewer'}).expect(422);
  await admin.post('/sl/workspace/members/1').type('form').send({_csrf:adminToken,role:'remove'}).expect(422);
  await admin.post('/sl/workspace/members/4').type('form').send({_csrf:adminToken,role:'editor'}).expect(404);
  await admin.post('/sl/workspace/members/2').type('form').send({_csrf:adminToken,role:'viewer'}).expect(302);
  await editor.get('/sl/recipes/new').expect(403);
  await admin.post('/sl/workspace/members/2').type('form').send({_csrf:adminToken,role:'editor'}).expect(302);
  await editor.get('/sl/recipes/new').expect(200);
});
test('invited new user joins correct workspace with assigned role, hashed token and no privilege escalation', async () => {
  const link = ws.createInvitation(adminUser,{email:'new@example.test',role:'viewer'}); const raw = link.split('/').at(-1);
  const row = c.db.select().from(t.invitations).where(eq(t.invitations.email,'new@example.test')).get(); assert.notEqual(row.tokenHash,raw);
  const agent = request.agent(app); const page = await agent.get('/sl'+link).expect(200); const csrf = getToken(page);
  await agent.post('/sl'+link).type('form').send({_csrf:csrf,name:'New',password:'12345678',confirmation:'12345678',role:'admin',householdId:2}).expect(302);
  const user = c.db.select().from(t.users).where(eq(t.users.email,'new@example.test')).get(); assert.equal(user.isModerator,false); assert.match(user.passwordHash,/^\$argon2id/);
  const member = c.db.select().from(t.members).where(eq(t.members.userId,user.id)).get(); assert.equal(member.householdId,1); assert.equal(member.role,'viewer');
  await agent.get('/sl/recipes/new').expect(403); await agent.get('/sl'+link).expect(404);
});
test('new workspace invitations require moderator; signup validates confirmation and creates separate admin workspace', async () => {
  await outsider.post('/sl/admin/invitations').type('form').send({_csrf:outsiderToken,email:'friend@example.test'}).expect(403);
  const link = ws.createInvitation(adminUser,{email:'friend@example.test'},true);
  const agent = request.agent(app); const csrf = getToken(await agent.get('/sl'+link));
  await agent.post('/sl'+link).type('form').send({_csrf:csrf,name:'Friend',workspaceName:'Prijateljeva kuhinja',password:'12345678',confirmation:'different'}).expect(422);
  assert.equal(c.db.select().from(t.users).where(eq(t.users.email,'friend@example.test')).get(),undefined);
  await agent.post('/sl'+link).type('form').send({_csrf:csrf,name:'Friend',workspaceName:'Prijateljeva kuhinja',password:'12345678',confirmation:'12345678'}).expect(302);
  const user = c.db.select().from(t.users).where(eq(t.users.email,'friend@example.test')).get(); const member = c.db.select().from(t.members).where(eq(t.members.userId,user.id)).get(); assert.equal(member.role,'admin'); assert.notEqual(member.householdId,1);
  await agent.get('/sl/recipes/1').expect(404); await agent.get('/sl/admin/invitations').expect(403);
});
test('expired/revoked invitations fail; existing accounts must authenticate as the invited email', async () => {
  const expired = ws.createInvitation(adminUser,{email:'expired@example.test',role:'editor'}); const raw = expired.split('/').at(-1);
  const row = ws.invite(raw); c.db.update(t.invitations).set({expiresAt:Date.now()-1}).where(eq(t.invitations.id,row.id)).run(); await request(app).get('/sl'+expired).expect(404);
  const revoked = ws.createInvitation(adminUser,{email:'revoked@example.test',role:'editor'}); ws.revoke(adminUser,ws.invite(revoked.split('/').at(-1)).id); await request(app).get('/sl'+revoked).expect(404);
  const link = ws.createInvitation(adminUser,{email:'other@example.test',role:'editor'});
  const anon = request.agent(app); const csrf = getToken(await anon.get('/sl'+link)); await anon.post('/sl'+link).type('form').send({_csrf:csrf,name:'Impostor',password:'12345678',confirmation:'12345678'}).expect(422);
  await admin.post('/sl'+link).type('form').send({_csrf:adminToken}).expect(403);
  await outsider.post('/sl'+link).type('form').send({_csrf:outsiderToken}).expect(302);
  outsiderToken = getToken(await outsider.get('/sl/workspace')); // Acceptance rotates the session.
  const memberships = c.db.select().from(t.members).where(eq(t.members.userId,4)).all(); assert.equal(memberships.length,2);
  await outsider.post('/sl/workspace/switch').type('form').send({_csrf:outsiderToken,householdId:999}).expect(404);
  await outsider.post('/sl/workspace/switch').type('form').send({_csrf:outsiderToken,householdId:2}).expect(302);
});
test('moderation publishes immutable copies including independent images, with no private notes/comments', async () => {
  const draft = recipes.save({...sample('Osnutek ni za skupnost'),status:'draft'},adminUser);
  await admin.post(`/sl/recipes/${draft}/submit`).type('form').send({_csrf:adminToken}).expect(422);
  const id = recipes.save(sample('Globalne testenine'),adminUser);
  const buffer = await sharp({create:{width:20,height:20,channels:3,background:'#81947a'}}).png().toBuffer(); await images.add(id,[{buffer,size:buffer.length,mimetype:'image/png'}]);
  await admin.post(`/sl/recipes/${id}/submit`).type('form').send({_csrf:adminToken}).expect(302);
  const row = c.db.select().from(t.publications).where(eq(t.publications.recipeId,id)).get(); const snapshot = JSON.parse(row.snapshot);
  assert.equal(snapshot.notes,undefined); assert.equal(snapshot.comments,undefined); assert.notEqual(snapshot.images[0].filename,recipes.get(id,1,1).images[0].filename);
  await outsider.get(`/sl/community/${row.id}`).expect(404); await outsider.get(`/sl/community/${row.id}/images/0`).expect(404);
  await editor.post(`/sl/community/${row.id}/review`).type('form').send({_csrf:editorToken,decision:'approved',feedback:''}).expect(403);
  await admin.post(`/sl/recipes/${id}/submit`).type('form').send({_csrf:adminToken}).expect(422);
  await admin.post(`/sl/community/${row.id}/review`).type('form').send({_csrf:adminToken,decision:'approved',feedback:''}).expect(302);
  recipes.save(sample('Spremenjeni zasebni naslov'),adminUser,id);
  assert.equal(community.get(row.id,outsideUser).recipe.title,'Globalne testenine');
  await outsider.get(`/sl/community/${row.id}`).redirects(1).expect(200); await outsider.get(`/sl/community/${row.id}/images/0?size=small`).expect(200);
  const rows = recipes.remove(id,adminUser); await images.unlinkRows(rows);
  await outsider.get(`/sl/community/${row.id}/images/0`).expect(200); assert.equal(community.get(row.id,outsideUser).recipe.title,'Globalne testenine');
  assert.ok(!JSON.stringify(community.get(row.id,outsideUser).recipe).includes('ZASEBNA OPOMBA'));
  await outsider.post(`/sl/community/${row.id}/favorite`).type('form').send({_csrf:outsiderToken,returnTo:'/community?q=Globalne'}).expect(302).expect('Location','/sl/community?q=Globalne'); assert.equal(community.get(row.id,outsideUser).favorite,true);
  await viewer.post(`/sl/community/${row.id}/copy`).type('form').send({_csrf:viewerToken}).expect(403);
  const copyResponse = await outsider.post(`/sl/community/${row.id}/copy`).type('form').send({_csrf:outsiderToken}).expect(302); const copyId = Number(copyResponse.headers.location.split('/').at(-1));
  const copy = recipes.get(copyId,2,4); assert.equal(copy.title,'Globalne testenine'); assert.equal(copy.images.length,1); assert.notEqual(copy.images[0].filename,snapshot.images[0].filename); assert.equal(copy.notes,'');
  await admin.post(`/sl/community/${row.id}/review`).type('form').send({_csrf:adminToken,decision:'rejected',feedback:''}).expect(422);
  await admin.post(`/sl/community/${row.id}/review`).type('form').send({_csrf:adminToken,decision:'rejected',feedback:'Popravite vir.'}).expect(302);
  await outsider.get(`/sl/community/${row.id}`).expect(404); await outsider.get(`/sl/community/${row.id}/images/0`).expect(404); assert.equal(recipes.get(copyId,2,4).title,'Globalne testenine');
});
test('workspace invitation UI produces a copyable link and CSRF protects admin and community writes', async () => {
  await admin.post('/sl/workspace/invitations').type('form').send({email:'ui@example.test',role:'editor'}).expect(403);
  await admin.post('/sl/workspace/invitations').type('form').send({_csrf:adminToken,email:'ui@example.test',role:'editor'}).expect(302);
  const page = await admin.get('/sl/workspace').expect(200); assert.match(page.text,/id="invitation-url"/); assert.match(page.text,/Kopiraj povezavo/);
  const next = await admin.get('/sl/workspace').expect(200); assert.ok(!next.text.includes('id="invitation-url"'));
  await admin.post('/sl/admin/invitations').type('form').send({_csrf:adminToken,email:'ui2@example.test'}).expect(302); await admin.get('/sl/admin/invitations').expect(200);
  await admin.post('/sl/workspace/members/not-an-id').type('form').send({_csrf:adminToken,role:'viewer'}).expect(404);
  await admin.post('/sl/community/1/review').type('form').send({decision:'approved',feedback:''}).expect(403);
});

test('a removed member loses workspace access but can sign in and accept a fresh invitation', async () => {
  const user = c.db.select().from(t.users).where(eq(t.users.email,'new@example.test')).get();
  const recipeId = recipes.save(sample('Zasebno po odstranitvi'),adminUser);
  ws.changeMember(adminUser,user.id,'remove');
  const agent = request.agent(app); const loginPage = await agent.get('/sl/login');
  await agent.post('/sl/login').type('form').send({_csrf:getToken(loginPage),email:user.email,password:'12345678'}).expect(302);
  await agent.get(`/sl/recipes/${recipeId}`).expect(404); await agent.get('/sl/recipes/new').expect(403);
  const link = ws.createInvitation(adminUser,{email:user.email,role:'viewer'});
  const page = await agent.get('/sl'+link).expect(200);
  await agent.post('/sl'+link).type('form').send({_csrf:getToken(page)}).expect(302);
  await agent.get(`/sl/recipes/${recipeId}`).expect(200);
});

test('recipe views combine only own workspace recipes and approved public snapshots with working filters', async () => {
  const catalog = recipeCatalog(c.db,recipes);
  const localId = recipes.save(sample('Pogled lokalni'),adminUser);
  const foreignId = recipes.save({...sample('Pogled javni'),categories:['Samo javna kategorija']},outsideUser);
  const pendingId = recipes.save(sample('Pogled čaka'),outsideUser);
  recipes.save(sample('Pogled tuj zasebni'),outsideUser);
  const globalId=c.db.insert(t.globalCategories).values({key:'test_public_category',active:true}).returning().get().id;
  for(const language of ['sl','en','de'])c.db.insert(t.globalCategoryNames).values({categoryId:globalId,language,name:'Samo javna kategorija'}).run();
  const publicationId = await community.submit(foreignId,outsideUser,{categoryIds:[globalId]});
  await community.submit(pendingId,outsideUser);
  community.review(publicationId,adminUser,'approved','');
  const own = catalog.list(adminUser,{q:'Pogled',view:'workspace'});
  assert.deepEqual(own.recipes.map(r=>r.id),[localId]);
  const onlyPublic = catalog.list(adminUser,{q:'Pogled',view:'public'});
  assert.equal(onlyPublic.count,1); assert.equal(onlyPublic.recipes[0].communityId,publicationId);
  const combined = catalog.list(adminUser,{q:'Pogled',view:'all',sort:'alpha'});
  assert.deepEqual(combined.recipes.map(r=>r.title),['Pogled javni','Pogled lokalni']);
  assert.equal(catalog.list(adminUser,{q:'Pogled',view:'all',ingredient:'TESTENINE'}).count,2);
  assert.equal(catalog.list(adminUser,{q:'Pogled',view:'all',category:'name:samo javna kategorija'}).count,1);
  assert.equal(catalog.list(adminUser,{q:'Pogled',view:'workspace',category:'name:samo javna kategorija'}).count,0);
  assert.ok(onlyPublic.categories.some(c=>c.name==='Samo javna kategorija'));
  assert.ok(!own.categories.some(c=>c.name==='Samo javna kategorija'));
  recipes.toggleFavorite(localId,adminUser); community.toggleFavorite(publicationId,adminUser);
  assert.equal(catalog.list(adminUser,{q:'Pogled',view:'all',favorite:'1'}).count,2);
  assert.equal(catalog.list(editorUser,{q:'Pogled',view:'all',favorite:'1'}).count,0);
  const page = await admin.get('/sl/recipes?view=all&q=Pogled&sort=alpha').expect(200);
  for (const text of ['Moj prostor','Vsi recepti','Samo javni']) assert.ok(page.text.includes(text));
  assert.match(page.text,/href="\/sl\/community\//); assert.match(page.text,/name="view" value="all"/);
  assert.ok(!page.text.includes('Pogled tuj zasebni')); assert.ok(!page.text.includes('Pogled čaka'));
  await admin.post(`/sl/community/${publicationId}/favorite`).type('form').send({_csrf:adminToken,returnTo:'/recipes?view=public&q=Pogled'}).expect(302).expect('Location','/sl/recipes?view=public&q=Pogled');
});

test('combined recipe pagination sorts across both sources before selecting a page', async () => {
  const catalog = recipeCatalog(c.db,recipes);
  for (let i=0;i<25;i++) recipes.save(sample(`PreverjanjeStrani ${String(i).padStart(2,'0')}`),adminUser);
  const globalId = recipes.save(sample('PreverjanjeStrani 00 javni'),outsideUser); const publicationId = await community.submit(globalId,outsideUser); community.review(publicationId,adminUser,'approved','');
  const first = catalog.list(adminUser,{view:'all',q:'PreverjanjeStrani',sort:'alpha'});
  const second = catalog.list(adminUser,{view:'all',q:'PreverjanjeStrani',sort:'alpha',page:'2'});
  assert.equal(first.count,26); assert.equal(first.recipes.length,24); assert.equal(second.recipes.length,2); assert.equal(first.pages,2);
  assert.equal(first.recipes[1].communityId,publicationId); assert.equal(second.recipes.at(-1).title,'PreverjanjeStrani 24');
  const page = await admin.get('/sl/recipes?view=all&q=PreverjanjeStrani&sort=alpha').expect(200); assert.ok(page.text.includes('view=all&amp;q=PreverjanjeStrani&amp;sort=alpha&amp;page=2'));
  assert.equal(catalog.list(adminUser,{view:'invalid',q:'PreverjanjeStrani'}).count,25);
});
