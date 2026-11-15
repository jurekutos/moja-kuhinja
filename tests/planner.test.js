import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { openDatabase } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import * as t from '../src/db/schema.js';
import { plannerService } from '../src/services/planner.js';
import { mondayOf,addDays,todayInLjubljana } from '../src/services/planner-dates.js';
import { validDate,parseMeal } from '../src/validators/planner.js';
import { recipeService } from '../src/services/recipes.js';

let directory,c,app,planner,recipes,admin,editor,viewer,other,csrfA,csrfE,csrfV,csrfO,recipeId,foreignId,publicId;
const owner={id:1,householdId:1,role:'admin'};
const collaborator={id:2,householdId:1,role:'editor'};
const outsider={id:4,householdId:2,role:'admin'};
const password='planner-test-pass';
const csrf=response=>response.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
const sample=title=>({title,description:'',prepMinutes:5,cookMinutes:10,servings:2,notes:'',sourceType:'manual',sourceUrl:'',sourceDescription:'',status:'published',categories:['Kosilo'],ingredients:[{name:'Testenine',quantity:'200',unit:'g',note:''}],steps:['Skuhajte testenine.']});
const meal=(overrides={})=>({date:'2026-11-16',slot:'lunch',recipe:`workspace:${recipeId}`,servings:'4',revision:'',...overrides});
async function login(agent,email) { const page=await agent.get('/login'); await agent.post('/login').type('form').send({_csrf:csrf(page),email,password}).expect(302); return csrf(await agent.get('/planner')); }
before(async()=>{
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'moja-planner-')); c=openDatabase(path.join(directory,'db.sqlite'),true);
  c.db.insert(t.households).values([{id:1,name:'Dom'},{id:2,name:'Drug dom'}]).run();
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  for(const [id,name,role,householdId] of [[1,'Admin','admin',1],[2,'Editor','editor',1],[3,'Viewer','viewer',1],[4,'Other','admin',2]]) { c.db.insert(t.users).values({id,name,email:`${name.toLowerCase()}@example.test`,passwordHash:hash}).run();c.db.insert(t.members).values({userId:id,householdId,role}).run(); }
  app=createApp({...c,config:{secret:'test-planner-'.repeat(5),production:false,trustProxy:false,uploadDir:path.join(directory,'uploads')}});
  planner=plannerService(c.db); recipes=recipeService(c.db); recipeId=recipes.save(sample('Testenine za jedilnik'),owner);foreignId=recipes.save(sample('Tuj zasebni recept'),outsider);
  publicId=c.db.insert(t.publications).values({householdId:2,recipeId:foreignId,submittedBy:4,status:'approved',snapshot:JSON.stringify({...sample('Javni recept'),author:'Other',images:[]}),createdAt:new Date().toISOString()}).returning({id:t.publications.id}).get().id;
  admin=request.agent(app);editor=request.agent(app);viewer=request.agent(app);other=request.agent(app);
  csrfA=await login(admin,'admin@example.test');csrfE=await login(editor,'editor@example.test');csrfV=await login(viewer,'viewer@example.test');csrfO=await login(other,'other@example.test');
});
after(async()=>{app.locals.sessionStore.close();c.sqlite.close();await fs.rm(directory,{recursive:true,force:true});});

test('planner dates handle Monday/Sunday, year boundaries, leap days, DST and Ljubljana midnight',()=>{
  assert.equal(mondayOf('2026-11-15'),'2026-11-09');assert.equal(mondayOf('2026-11-16'),'2026-11-16');assert.equal(mondayOf('2027-01-01'),'2026-12-28');
  assert.equal(addDays('2024-02-28',1),'2024-02-29');assert.equal(addDays('2026-03-28',2),'2026-03-30');assert.equal(addDays('2026-10-24',2),'2026-10-26');
  assert.equal(todayInLjubljana(new Date('2026-11-15T23:30:00Z')),'2026-11-16');
  for(const date of ['2026-02-29','2026-04-31','not-a-date','2026-1-01']) assert.equal(validDate(date),false);
});
test('planner requires authentication, membership, editor permission and CSRF',async()=>{
  await request(app).get('/planner').expect(302).expect('Location','/login');
  await admin.post('/planner/save').type('form').send(meal()).expect(403);
  await viewer.get('/planner?week=2026-11-16').expect(200);await viewer.get('/planner/meal?date=2026-11-16&slot=lunch').expect(403);
  await viewer.post('/planner/save').type('form').send({...meal(),_csrf:csrfV}).expect(403);
  await viewer.post('/planner/remove').type('form').send({...meal(),_csrf:csrfV}).expect(403);
  assert.throws(()=>planner.week({id:1,householdId:2},'2026-11-16'),error=>error.status===403);
});
test('shared weekly plan saves, edits and removes meals without changing recipe servings or quantities',async()=>{
  await admin.post('/planner/save').type('form').send({...meal(),_csrf:csrfA}).expect(302).expect('Location','/planner?week=2026-11-16#day-2026-11-16');
  const entry=planner.get(owner,'2026-11-16','lunch');assert.equal(entry.servings,4);
  const page=await editor.get('/planner?week=2026-11-16').expect(200);assert.match(page.text,/Testenine za jedilnik/);assert.match(page.text,/servings=4/);
  const editPage=await editor.get('/planner/meal?date=2026-11-16&slot=lunch').expect(200);assert.match(editPage.text,/name="servings"[^>]*value="4"/);
  await editor.post('/planner/save').type('form').send({...meal({servings:'6',revision:entry.revision}),_csrf:csrfE}).expect(302);
  assert.equal(planner.get(owner,'2026-11-16','lunch').servings,6);
  assert.equal(recipes.get(recipeId,1,1).servings,2);assert.equal(recipes.get(recipeId,1,1).ingredients[0].quantity,'200');
  await viewer.get('/planner?week=2026-11-16').expect(200);
  const current=planner.get(owner,'2026-11-16','lunch');await admin.post('/planner/remove').type('form').send({_csrf:csrfA,date:current.date,slot:current.slot,revision:current.revision}).expect(302);assert.equal(planner.get(owner,current.date,current.slot),null);
});
test('planner rejects invalid dates, slots, sources and serving counts and excludes drafts from choices',async()=>{
  const draft=recipes.save({...sample('Osnutek jedilnika'),status:'draft'},owner);
  const picker=await admin.get('/planner/meal?date=2026-11-16&slot=dinner').expect(200);assert.ok(!picker.text.includes('Osnutek jedilnika'));assert.ok(!picker.text.includes('Tuj zasebni recept'));
  for(const overrides of [{date:'2026-02-30'},{slot:'breakfast'},{servings:'0'},{servings:'101'},{servings:'1.5'},{recipe:'bad'},{revision:'bad'}]) assert.throws(()=>parseMeal(meal(overrides)),error=>error.status===422);
  const result=await admin.post('/planner/save').type('form').send({...meal({servings:'0'}),_csrf:csrfA}).expect(422);assert.match(result.text,/Število porcij mora/);assert.match(result.text,/value="0"/);
  await admin.post('/planner/save').type('form').send({...meal({recipe:`workspace:${draft}`}),_csrf:csrfA}).expect(404);
  await admin.post('/planner/save').type('form').send({...meal({recipe:`workspace:${foreignId}`}),_csrf:csrfA}).expect(404);
  await admin.get('/planner?week=bad').expect(422);await admin.get('/planner/meal?date=2026-11-16&slot=invalid').expect(422);
});
test('public recipes can be planned directly; private source and plan ownership never cross workspace boundaries',async()=>{
  await admin.post('/planner/save').type('form').send({...meal({slot:'dinner',recipe:`public:${publicId}`,servings:'3'}),_csrf:csrfA}).expect(302);
  const entry=planner.get(owner,'2026-11-16','dinner');assert.equal(entry.publicationId,publicId);assert.equal(entry.recipeId,null);
  const outsidePage=await other.get('/planner?week=2026-11-16').expect(200);assert.ok(!outsidePage.text.includes('Javni recept'));
  await other.post('/planner/remove').type('form').send({_csrf:csrfO,date:entry.date,slot:entry.slot,revision:entry.revision}).expect(409);
  assert.equal(planner.get(owner,entry.date,entry.slot).revision,entry.revision);
  c.db.update(t.publications).set({status:'rejected'}).where(eq(t.publications.id,publicId)).run();
  assert.equal(planner.get(owner,entry.date,entry.slot).available,false);
  await admin.post('/planner/save').type('form').send({...meal({date:'2026-11-17',recipe:`public:${publicId}`}),_csrf:csrfA}).expect(404);
});
test('concurrent changes cannot overwrite or delete newer meal plans',async()=>{
  planner.save(owner,meal({date:'2026-11-18'}));
  await editor.post('/planner/save').type('form').send({...meal({date:'2026-11-18'}),_csrf:csrfE}).expect(409);
  const old=planner.get(owner,'2026-11-18','lunch');planner.save(collaborator,meal({date:old.date,revision:old.revision,servings:'8'}));
  await admin.post('/planner/save').type('form').send({...meal({date:old.date,revision:old.revision}),_csrf:csrfA}).expect(409);
  await admin.post('/planner/remove').type('form').send({_csrf:csrfA,date:old.date,slot:old.slot,revision:old.revision}).expect(409);
  assert.equal(planner.get(owner,old.date,old.slot).servings,8);
  assert.equal(c.db.select().from(t.mealPlanEntries).all().filter(e=>e.date===old.date && e.slot===old.slot).length,1);
});
test('deleted recipes leave a visible unavailable meal which can be replaced',()=>{
  const id=recipes.save(sample('Recept za izbris'),owner);planner.save(owner,meal({date:'2026-11-19',recipe:`workspace:${id}`}));recipes.remove(id,owner);
  const entry=planner.get(owner,'2026-11-19','lunch');assert.equal(entry.available,false);assert.equal(entry.title,'Recept za izbris');
  planner.save(owner,meal({date:entry.date,revision:entry.revision}));assert.equal(planner.get(owner,entry.date,entry.slot).available,true);
  assert.deepEqual(c.sqlite.pragma('foreign_key_check'),[]);
});

test('meal visibility is shared per workspace, persists across weeks and preserves hidden meals',async()=>{
  planner.save(owner,meal({date:'2026-11-20',slot:'lunch'}));planner.save(owner,meal({date:'2026-11-20',slot:'dinner'}));
  const before=c.db.select().from(t.mealPlanEntries).all();
  await admin.post('/planner/preferences').type('form').send({_csrf:csrfA,week:'2026-11-16',meals:'lunch',householdId:2}).expect(302).expect('Location','/planner?week=2026-11-16');
  const week=planner.week(collaborator,'2026-11-16');assert.equal(week.totalSlots,7);assert.equal(week.plannerMeals,'lunch');assert.ok(week.days.every(day=>day.meals.length===1 && day.meals[0].slot==='lunch'));assert.ok(week.hiddenCount>0);
  assert.equal(planner.week(owner,'2026-11-23').plannerMeals,'lunch');assert.equal(planner.week(outsider,'2026-11-16').plannerMeals,'both');
  const page=await viewer.get('/planner?week=2026-11-16').expect(200);assert.equal((page.text.match(/class="planner-slot"/g)||[]).length,7);
  assert.deepEqual(c.db.select().from(t.mealPlanEntries).all(),before);
  await admin.get('/planner/meal?date=2026-11-20&slot=dinner').expect(422);
  await admin.post('/planner/save').type('form').send({...meal({date:'2026-11-21',slot:'dinner'}),_csrf:csrfA}).expect(422);
  await editor.post('/planner/preferences').type('form').send({_csrf:csrfE,week:'2026-11-16',meals:'dinner'}).expect(302);assert.ok(planner.week(owner,'2026-11-16').days.every(day=>day.meals[0].slot==='dinner'));
  await admin.post('/planner/preferences').type('form').send({_csrf:csrfA,week:'2026-11-16',meals:'both'}).expect(302);
  assert.equal(planner.week(owner,'2026-11-16').totalSlots,14);assert.deepEqual(c.db.select().from(t.mealPlanEntries).all(),before);
});
test('planner preferences require editor permission, CSRF and a valid meal selection',async()=>{
  await request(app).post('/planner/preferences').type('form').send({week:'2026-11-16',meals:'lunch'}).expect(302).expect('Location','/login');
  await admin.post('/planner/preferences').type('form').send({week:'2026-11-16',meals:'lunch'}).expect(403);
  await viewer.post('/planner/preferences').type('form').send({_csrf:csrfV,week:'2026-11-16',meals:'lunch'}).expect(403);
  for(const meals of ['', 'none','breakfast']) await admin.post('/planner/preferences').type('form').send({_csrf:csrfA,week:'2026-11-16',meals}).expect(422);
  assert.equal(planner.week(owner,'2026-11-16').plannerMeals,'both');
});
