import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import sharp from 'sharp';
import request from 'supertest';
import { eq,and,sql } from 'drizzle-orm';
import { openDatabase,applyMigrations } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import * as t from '../src/db/schema.js';
import { recipeService } from '../src/services/recipes.js';
import { imageService } from '../src/services/images.js';
import { communityService } from '../src/services/community.js';
import { workspaceService } from '../src/services/workspaces.js';
import { workspaceDeletionService } from '../src/services/workspace-deletion.js';
import { drainFileDeletions } from '../src/services/file-cleanup.js';
let root,c,app,owner,admin,editor,viewer,moderator,orphan,tokens,recipes,images,community,workspace,deletion;
const password='Synthetic-password-only';
const who=(id,householdId,role='admin')=>({id,householdId,role,name:'Test user',isModerator:false,isSuperAdmin:id===1});
const token=res=>{const result=res.text.match(/name="_csrf" value="([a-f0-9]+)"/);assert.ok(result,res.text.slice(0,300));return result[1];};
async function login(agent,id,pass=password){const page=await agent.get('/sl/login');await agent.post('/sl/login').type('form').send({_csrf:token(page),email:`user${id}@example.test`,password:pass}).expect(302);return token(await agent.get('/sl/settings'));}
const sample=title=>({title,description:'PRIVATE RECIPE CONTENT',prepMinutes:5,cookMinutes:10,servings:2,notes:'PRIVATE PERSONAL NOTE',sourceType:'manual',sourceUrl:'',sourceDescription:'',status:'published',categories:['Kosilo'],ingredients:[{name:'Testenine',quantity:'200',unit:'g',note:''}],steps:['Skuhajte.']});
before(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'moja-admin-'));c=openDatabase(path.join(root,'db.sqlite'),true);
  const now=new Date().toISOString();c.db.insert(t.households).values([{id:1,name:'Owner home',createdAt:now},{id:2,name:'Member home',createdAt:'2020-01-01T00:00:00Z'},{id:3,name:'Other home',createdAt:now}]).run();
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  for(let id=1;id<=6;id++)c.db.insert(t.users).values({id,name:`Person ${id}`,email:`user${id}@example.test`,passwordHash:hash,isSuperAdmin:id===1,isModerator:id===5,createdAt:id===4?null:id===3?'2020-01-01T00:00:00Z':now}).run();
  c.db.insert(t.members).values([{userId:1,householdId:1,role:'admin'},{userId:1,householdId:3,role:'admin'},{userId:2,householdId:2,role:'admin'},{userId:3,householdId:2,role:'editor'},{userId:3,householdId:1,role:'viewer'},{userId:4,householdId:2,role:'viewer'},{userId:5,householdId:1,role:'editor'}]).run();
  app=createApp({...c,config:{secret:'test-secret-'.repeat(5),production:false,trustProxy:false,uploadDir:path.join(root,'uploads')}});
  [owner,admin,editor,viewer,moderator,orphan]=Array.from({length:6},()=>request.agent(app));tokens=[];
  for(const [index,agent] of [owner,admin,editor,viewer,moderator,orphan].entries())tokens[index+1]=await login(agent,index+1);
  recipes=recipeService(c.db);images=imageService(c.db,path.join(root,'uploads'));community=communityService(c.db,recipes,images,path.join(root,'uploads'));workspace=workspaceService(c.db);deletion=workspaceDeletionService(c.db,path.join(root,'uploads'));
});
after(async()=>{app.locals.sessionStore.close();c.sqlite.close();await fs.rm(root,{recursive:true,force:true});});

test('settings are authenticated, allow own display name, reject forged email/privilege/target changes and escape names',async()=>{
  await request(app).get('/sl/settings').expect(302).expect('Location','/sl/login');await request(app).post('/sl/settings/profile').send({name:'Bad'}).expect(302);
  await viewer.post('/sl/settings/profile').type('form').send({name:'Bad'}).expect(403);
  await viewer.post('/sl/settings/profile').type('form').send({_csrf:tokens[4],name:'<script>viewer</script>'}).expect(302);
  const page=await viewer.get('/sl/settings').expect(200);assert.match(page.text,/&lt;script&gt;viewer&lt;\/script&gt;/);assert.ok(!page.text.includes('passwordHash'));assert.ok(!page.text.includes('$argon2'));
  for(const extra of [{email:'new@example.test'},{userId:1},{isSuperAdmin:true},{is_super_admin:1}])await viewer.post('/sl/settings/profile').type('form').send({_csrf:tokens[4],name:'Changed',...extra}).expect(422);
  const row=c.db.select().from(t.users).where(eq(t.users.id,4)).get();assert.equal(row.email,'user4@example.test');assert.equal(row.isSuperAdmin,false);assert.equal(c.db.select().from(t.users).where(eq(t.users.id,1)).get().name,'Person 1');
});
test('Super Admin is distinct from workspace admin and moderator; metadata pages expose no private recipe contents',async()=>{
  const id=recipes.save(sample('Secret recipe title'),who(2,2));
  for(const url of ['/super-admin','/super-admin/users','/super-admin/workspaces','/super-admin/workspaces/2','/super-admin/statistics']){
    await request(app).get('/sl'+url).expect(302);await admin.get('/sl'+url).expect(403);await moderator.get('/sl'+url).expect(403);
    const page=await owner.get('/sl'+url).expect(200);assert.ok(!page.text.includes('PRIVATE RECIPE CONTENT'));assert.ok(!page.text.includes('PRIVATE PERSONAL NOTE'));assert.ok(!page.text.includes('Secret recipe title'));assert.ok(!page.text.includes('$argon2'));
  }
  await owner.get(`/sl/recipes/${id}`).expect(404);
  const page=await admin.get('/sl/settings');assert.ok(!page.text.includes('href="/sl/super-admin"'));assert.ok((await owner.get('/sl/settings')).text.includes('href="/sl/super-admin"'));
});
test('Super Admin summaries, registrations, workspace metadata and pagination use real database values',async()=>{
  const {superAdminService}=await import('../src/services/super-admin.js');const service=superAdminService(c.db);
  const stats=service.summary(who(1,1));assert.deepEqual(stats,{users:6,workspaces:3,memberships:7,recipes:1,approved:0,meals:0,recentUsers:4,recentWorkspaces:2});
  const data=service.statistics(who(1,1));assert.equal(data.unknownUsers,1);assert.equal(data.registrations.reduce((sum,r)=>sum+r.count,0),5);assert.equal(data.recipesByWorkspace.find(r=>r.id===2).count,1);
  const usersPage=await owner.get('/sl/super-admin/users?q=user2&sort=name').expect(200);assert.match(usersPage.text,/user2@example.test/);assert.ok(!usersPage.text.includes('user3@example.test'));
  for(let i=7;i<=32;i++)c.db.insert(t.users).values({id:i,name:`Synthetic ${i}`,email:`synthetic${i}@example.test`,passwordHash:'not-a-real-password-hash',createdAt:'2020-01-01'}).run();
  const paginated=service.users(who(1,1),{q:'Synthetic',page:'2',sort:'name'});assert.equal(paginated.count,26);assert.equal(paginated.rows.length,1);assert.equal(paginated.pages,2);
  await owner.get('/sl/super-admin/workspaces?q=Member&sort=oldest').expect(200);assert.equal(service.workspaces(who(1,1),{q:'Member'}).rows[0].memberCount,3);
});
test('password changes verify current password, confirmation, reject email fields and rotate/invalidate sessions',async()=>{
  const second=request.agent(app);await login(second,6);const cookieBefore=(await orphan.get('/sl/settings')).headers['set-cookie'];
  for(const values of [{currentPassword:'wrong',newPassword:'New-passphrase',confirmation:'New-passphrase'},{currentPassword:password,newPassword:'short',confirmation:'short'},{currentPassword:password,newPassword:'New-passphrase',confirmation:'Mismatch'}])await orphan.post('/sl/settings/password').type('form').send({_csrf:tokens[6],...values}).expect(422);
  const old=c.db.select().from(t.users).where(eq(t.users.id,6)).get();
  await orphan.post('/sl/settings/password').type('form').send({_csrf:tokens[6],currentPassword:password,newPassword:'New-passphrase',confirmation:'New-passphrase',email:'evil@example.test'}).expect(422);
  const response=await orphan.post('/sl/settings/password').type('form').send({_csrf:tokens[6],currentPassword:password,newPassword:'New-passphrase',confirmation:'New-passphrase'}).expect(302);
  assert.ok(response.headers['set-cookie']);const updated=c.db.select().from(t.users).where(eq(t.users.id,6)).get();assert.equal(updated.sessionVersion,old.sessionVersion+1);assert.equal(await argon2.verify(updated.passwordHash,'New-passphrase'),true);
  await second.get('/sl/settings').expect(302).expect('Location','/sl/login');await orphan.get('/sl/settings').expect(200);
  // Even a concurrent stale session write cannot restore authentication after revocation.
  const signed=request.agent(app);await login(signed,5);const sessionRow=c.db.select().from(t.sessions).all().find(r=>JSON.parse(r.data).userId===5);const sessionData=JSON.parse(sessionRow.data);
  c.db.update(t.users).set({sessionVersion:1}).where(eq(t.users.id,5)).run();c.db.update(t.sessions).set({data:JSON.stringify(sessionData)}).where(eq(t.sessions.sid,sessionRow.sid)).run();await signed.get('/sl/settings').expect(302);tokens[5]=await login(moderator,5);
  assert.ok(!JSON.stringify(c.db.select().from(t.auditEvents).all()).includes('New-passphrase'));assert.equal(c.db.select().from(t.auditEvents).all().filter(e=>e.action==='password_changed').length,1);
});
test('members may leave only their own membership; active workspace falls back safely and no-workspace state remains usable',async()=>{
  await editor.post('/sl/workspace/switch').type('form').send({_csrf:tokens[3],householdId:2}).expect(302);
  await editor.get('/sl/workspaces/2/leave').expect(200);
  await editor.post('/sl/workspaces/2/leave').type('form').send({_csrf:tokens[3]}).expect(422);
  await editor.post('/sl/workspaces/3/leave').type('form').send({_csrf:tokens[3],confirm:'leave'}).expect(404);
  await editor.post('/sl/workspaces/2/leave').type('form').send({_csrf:tokens[3],confirm:'leave'}).expect(302);
  const page=await editor.get('/sl/settings');assert.ok(page.text.includes('Owner home'));assert.ok(!page.text.includes('Member home'));
  await editor.get('/sl/recipes/1').expect(404);assert.equal(c.db.select().from(t.households).all().length,3);
  await editor.post('/sl/workspaces/1/leave').type('form').send({_csrf:tokens[3],confirm:'leave'}).expect(302);const empty=await editor.get('/sl/').expect(200);assert.match(empty.text,/Trenutno niste član/);await editor.get('/sl/settings').expect(200);
  await admin.post('/sl/workspaces/2/leave').type('form').send({_csrf:tokens[2],confirm:'leave'}).expect(422);
});
test('workspace admins rename only their active space and existing role/remove logic keeps last admin',async()=>{
  await viewer.post('/sl/workspace/rename').type('form').send({_csrf:tokens[4],name:'No'}).expect(403);
  await admin.post('/sl/workspace/rename').type('form').send({_csrf:tokens[2],name:'Renamed home',householdId:1}).expect(302);
  assert.equal(c.db.select().from(t.households).where(eq(t.households.id,1)).get().name,'Owner home');assert.equal(c.db.select().from(t.households).where(eq(t.households.id,2)).get().name,'Renamed home');
  await owner.post('/sl/super-admin/workspaces/2/members/2/remove').type('form').send({_csrf:tokens[1],confirm:'remove'}).expect(422);
  await moderator.post('/sl/super-admin/workspaces/2/members/4/remove').type('form').send({_csrf:tokens[5],confirm:'remove'}).expect(403);
  await owner.get('/sl/super-admin/workspaces/2/members/4/remove').expect(200);await owner.post('/sl/super-admin/workspaces/2/members/4/remove').type('form').send({_csrf:tokens[1],confirm:'remove'}).expect(302);
  await viewer.get('/sl/recipes/1').expect(404);assert.ok(c.db.select().from(t.auditEvents).all().some(e=>e.action==='super_admin_membership_removed'));
});
test('workspace deletion requires admin, CSRF and exact name; preserves other data, users and approved snapshots/photos',async()=>{
  const recipeId=recipes.save(sample('Delete with workspace'),who(2,2));const outsideId=recipes.save(sample('Keep other space'),who(1,1));
  const buffer=await sharp({create:{width:20,height:20,channels:3,background:'#81947a'}}).png().toBuffer();await images.add(recipeId,[{buffer,size:buffer.length,mimetype:'image/png'}]);const privateImage=recipes.get(recipeId,2,2).images[0];
  await images.add(outsideId,[{buffer,size:buffer.length,mimetype:'image/png'}]);const unrelatedImage=recipes.get(outsideId,1,1).images[0];
  c.db.insert(t.comments).values({recipeId,userId:2,body:'Synthetic comment',position:0,createdAt:new Date().toISOString()}).run();c.db.insert(t.favorites).values({recipeId,userId:2}).run();
  const publicationId=await community.submit(recipeId,{...who(2,2),name:'Admin'});community.review(publicationId,{...who(1,1),isModerator:true},'approved','');const publicImage=community.get(publicationId,who(1,1)).recipe.images[0];
  const pendingId=await community.submit(recipeId,{...who(2,2),name:'Admin'});const pendingImage=community.get(pendingId,{...who(2,2)}).recipe.images[0];
  c.db.insert(t.communityFavorites).values({userId:1,publicationId}).run();c.db.insert(t.mealPlanEntries).values({householdId:2,date:'2026-11-16',slot:'lunch',recipeId,servings:2,titleSnapshot:'Meal',revision:randomBytes(18).toString('hex'),updatedBy:2,createdAt:'2026-01-01',updatedAt:'2026-01-01'}).run();
  c.db.insert(t.mealPlanEntries).values({householdId:1,date:'2026-11-16',slot:'dinner',publicationId,servings:2,titleSnapshot:'Public meal',revision:'synthetic-revision',updatedBy:1,createdAt:'2026-01-01',updatedAt:'2026-01-01'}).run();
  workspace.createInvitation(who(2,2),{email:'invite@example.test',role:'editor'});
  await moderator.post('/sl/workspace/delete').type('form').send({_csrf:tokens[5],confirmation:'Owner home'}).expect(403);
  await admin.post('/sl/workspace/delete').type('form').send({confirmation:'Renamed home'}).expect(403);
  await admin.post('/sl/workspace/delete').type('form').send({_csrf:tokens[2],confirmation:'renamed home'}).expect(422);
  assert.ok(c.db.select().from(t.households).where(eq(t.households.id,2)).get());await admin.get('/sl/workspace/delete').expect(200);
  await admin.post('/sl/workspace/delete').type('form').send({_csrf:tokens[2],confirmation:'Renamed home'}).expect(302).expect('Location','/sl/settings');
  assert.equal(c.db.select().from(t.households).where(eq(t.households.id,2)).get(),undefined);assert.equal(c.db.select().from(t.members).where(eq(t.members.householdId,2)).all().length,0);assert.ok(c.db.select().from(t.users).where(eq(t.users.id,2)).get());
  assert.equal(c.db.select().from(t.recipes).where(eq(t.recipes.householdId,2)).all().length,0);assert.equal(c.db.select().from(t.ingredients).where(eq(t.ingredients.householdId,2)).all().length,0);assert.equal(c.db.select().from(t.categories).where(eq(t.categories.householdId,2)).all().length,0);assert.equal(c.db.select().from(t.invitations).where(eq(t.invitations.householdId,2)).all().length,0);assert.equal(c.db.select().from(t.mealPlanEntries).where(eq(t.mealPlanEntries.householdId,2)).all().length,0);
  assert.equal(recipes.get(outsideId,1,1).title,'Keep other space');const approved=c.db.select().from(t.publications).where(eq(t.publications.id,publicationId)).get();assert.equal(approved.status,'approved');assert.equal(approved.householdId,null);assert.equal(approved.recipeId,null);assert.equal(c.db.select().from(t.publications).where(eq(t.publications.id,pendingId)).get(),undefined);
  await fs.access(path.join(root,'uploads',publicImage.filename));await assert.rejects(fs.access(path.join(root,'uploads',privateImage.filename)));await assert.rejects(fs.access(path.join(root,'uploads',pendingImage.filename)));assert.equal(c.db.select().from(t.communityFavorites).all().length,1);assert.deepEqual(c.sqlite.pragma('foreign_key_check'),[]);
  await fs.access(path.join(root,'uploads',unrelatedImage.filename));assert.equal(c.db.select().from(t.mealPlanEntries).where(eq(t.mealPlanEntries.householdId,1)).get().publicationId,publicationId);assert.equal(c.db.select().from(t.comments).where(eq(t.comments.recipeId,recipeId)).all().length,0);assert.equal(c.db.select().from(t.recipeNotes).where(eq(t.recipeNotes.recipeId,recipeId)).all().length,0);assert.equal(c.db.select().from(t.favorites).where(eq(t.favorites.recipeId,recipeId)).all().length,0);
  assert.equal(c.db.select().from(t.auditEvents).all().filter(e=>e.action==='workspace_deleted' && e.workspaceId===2).length,1);await admin.get('/sl/').expect(200);await admin.get('/sl/settings').expect(200);
});
test('Super Admin can delete another workspace without joining it; action is audited and ordinary moderators cannot',async()=>{
  await moderator.post('/sl/super-admin/workspaces/3/delete').type('form').send({_csrf:tokens[5],confirmation:'Other home'}).expect(403);
  await owner.get('/sl/super-admin/workspaces/3/delete').expect(200);await owner.post('/sl/super-admin/workspaces/3/delete').type('form').send({_csrf:tokens[1],confirmation:'Other home'}).expect(302);
  assert.equal(c.db.select().from(t.households).where(eq(t.households.id,3)).get(),undefined);assert.ok(c.db.select().from(t.households).where(eq(t.households.id,1)).get());
});
test('an admin may leave when another admin remains, and the active workspace is safely cleared',async()=>{
  const id=c.db.insert(t.households).values({name:'Two admins'}).returning({id:t.households.id}).get().id;
  c.db.insert(t.members).values([{userId:1,householdId:id,role:'admin'},{userId:2,householdId:id,role:'admin'}]).run();
  await admin.post('/sl/workspace/switch').type('form').send({_csrf:tokens[2],householdId:id}).expect(302);
  await admin.post(`/sl/workspaces/${id}/leave`).type('form').send({_csrf:tokens[2],confirm:'leave'}).expect(302);const page=await admin.get('/sl/').expect(200);assert.match(page.text,/Trenutno niste član/);
  assert.equal(c.db.select().from(t.members).where(eq(t.members.householdId,id)).all().length,1);
});
test('failed workspace deletion rolls back all database changes and never removes files',async()=>{
  const id=c.db.insert(t.households).values({name:'Rollback home'}).returning({id:t.households.id}).get().id;c.db.insert(t.members).values({userId:1,householdId:id,role:'admin'}).run();const recipeId=recipes.save(sample('Rollback recipe'),who(1,id));
  c.sqlite.exec("CREATE TRIGGER deny_workspace_delete BEFORE DELETE ON households WHEN old.name = 'Rollback home' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
  const before=c.db.select().from(t.auditEvents).all().length;
  await assert.rejects(deletion.remove(who(1,id),id,'Rollback home'));assert.ok(c.db.select().from(t.households).where(eq(t.households.id,id)).get());assert.equal(recipes.get(recipeId,id,1).title,'Rollback recipe');assert.equal(c.db.select().from(t.auditEvents).all().length,before);c.sqlite.exec('DROP TRIGGER deny_workspace_delete');
});
test('file cleanup retries failures and never deletes files referenced by surviving recipes or publications',async()=>{
  const name=randomBytes(18).toString('hex')+'.webp';await fs.mkdir(path.join(root,'uploads',name));c.db.insert(t.fileDeletions).values({filename:name,createdAt:new Date().toISOString()}).run();
  assert.equal(await drainFileDeletions(c.db,path.join(root,'uploads')),1);assert.equal(c.db.select().from(t.fileDeletions).all().length,1);await fs.rmdir(path.join(root,'uploads',name));assert.equal(await drainFileDeletions(c.db,path.join(root,'uploads')),0);
  const publication=c.db.select().from(t.publications).where(eq(t.publications.status,'approved')).get();const image=JSON.parse(publication.snapshot).images[0];c.db.insert(t.fileDeletions).values({filename:image.filename,createdAt:new Date().toISOString()}).run();await drainFileDeletions(c.db,path.join(root,'uploads'));await fs.access(path.join(root,'uploads',image.filename));
});
