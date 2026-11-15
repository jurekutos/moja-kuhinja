import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import argon2 from 'argon2';
import request from 'supertest';
import { eq,and,sql } from 'drizzle-orm';
import { openDatabase } from '../src/db/index.js';
import * as t from '../src/db/schema.js';
import { createApp } from '../src/app.js';
import { resources,languageContext,tr,unitLabel } from '../src/i18n/index.js';
import { recipeService } from '../src/services/recipes.js';
import { recipeTranslationService } from '../src/services/recipe-translations.js';
import { globalCatalogService } from '../src/services/global-catalog.js';
import { recipeCatalog } from '../src/services/recipe-catalog.js';
import { communityService } from '../src/services/community.js';
import { imageService } from '../src/services/images.js';
import { plannerService } from '../src/services/planner.js';
import { recipeReadService } from '../src/services/recipe-reads.js';
import { parseRecipe } from '../src/validators/recipe.js';
import { workspaceDeletionService } from '../src/services/workspace-deletion.js';
import { scaleQuantity } from '../public/js/quantities.js';
let root,c,app,recipes,translations,catalog,community,globalCatalog,agent,csrf;
const owner={id:1,householdId:1,role:'admin',language:'sl',name:'Owner',isModerator:true,isSuperAdmin:true};
const outsider={id:2,householdId:2,role:'admin',language:'de',name:'Other'};
const token=response=>response.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
const sample=(title='Slovenska juha')=>({title,description:'Domača jed',prepMinutes:5,cookMinutes:10,servings:2,notes:'Private note',sourceType:'manual',sourceUrl:'',sourceDescription:'',status:'published',categories:['Moja kategorija'],ingredients:[{name:'Čebula',quantity:'0.125',unit:'kos',note:'sesekljana',canonicalIngredientId:2}],steps:['Skuhajte čebulo.']});
function translatedInput(id,title='Onion soup',reviewed=true) {
  const recipe=recipes.get(id,1,1,false);
  return {title,description:'Home cooking',revision:String(recipe.contentRevision),reviewed:reviewed?'1':'',ingredientsJson:JSON.stringify(recipe.ingredients.map(i=>({ingredientId:i.id,name:'Onion',note:'chopped'}))),stepsJson:JSON.stringify(recipe.stepRows.map(s=>({stepId:s.id,body:'Cook the onion.'})))};
}
before(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'moja-i18n-'));c=openDatabase(path.join(root,'db.sqlite'),true);
  c.db.insert(t.households).values([{id:1,name:'First'},{id:2,name:'Other'}]).run();
  const hash=await argon2.hash('Synthetic-password');
  for(const id of [1,2])c.db.insert(t.users).values({id,name:`User ${id}`,email:`i18n${id}@example.test`,passwordHash:hash,isModerator:id===1,isSuperAdmin:id===1}).run();
  c.db.insert(t.members).values([{userId:1,householdId:1,role:'admin'},{userId:2,householdId:2,role:'admin'}]).run();
  app=createApp({...c,config:{secret:'synthetic-language-secret-'.repeat(3),production:false,trustProxy:false,uploadDir:path.join(root,'uploads')}});
  recipes=recipeService(c.db);translations=recipeTranslationService(c.db,recipes);globalCatalog=globalCatalogService(c.db);catalog=recipeCatalog(c.db,recipes);community=communityService(c.db,recipes,imageService(c.db,path.join(root,'uploads')),path.join(root,'uploads'));
  agent=request.agent(app);const login=await agent.get('/sl/login');await agent.post('/sl/login').type('form').send({_csrf:token(login),email:'i18n1@example.test',password:'Synthetic-password'}).expect(302);csrf=token(await agent.get('/sl/settings'));
});
after(async()=>{app.locals.sessionStore.close();c.sqlite.close();await fs.rm(root,{recursive:true,force:true});});

test('all feature translation keys exist in all languages and request contexts remain independent',async()=>{
  for(const language of ['en','de']){
    assert.deepEqual(Object.keys(resources[language]).sort(),Object.keys(resources.sl).sort());
    for(const namespace of Object.keys(resources.sl))assert.deepEqual(Object.keys(resources[language][namespace]).sort(),Object.keys(resources.sl[namespace]).sort());
    for(const dictionary of Object.values(resources[language]))assert.ok(Object.values(dictionary).every(v=>typeof v==='string'&&v.length));
  }
  assert.deepEqual(await Promise.all(['de','en'].map(language=>languageContext.run({language},async()=>{await new Promise(r=>setTimeout(r,5));return tr('common:language');}))),['Sprache','Language']);
});
test('every statically referenced server, EJS and browser translation key exists in all supported languages',async()=>{
  async function files(directory){const entries=await fs.readdir(directory,{withFileTypes:true});const result=[];for(const entry of entries){const filename=path.join(directory,entry.name);if(entry.isDirectory())result.push(...await files(filename));else if(/\.(js|ejs)$/.test(filename))result.push(filename);}return result;}
  for(const filename of [...await files('src'),...await files('public/js')]){
    const source=await fs.readFile(filename,'utf8');
    for(const match of source.matchAll(/\b(?:t|tr)\(\s*(['"])([^'"]+)\1/g)){
      const [namespace,key]=match[2].split(':');
      if(!key)continue; // A namespace prefix concatenated with a dynamic unit key.
      for(const language of ['sl','en','de'])assert.ok(resources[language][namespace]?.[key],`${filename}: ${language}/${match[2]}`);
    }
  }
});
test('anonymous cookie selection, CSRF, localized login/errors and persisted account preference',async()=>{
  const anonymous=request.agent(app);let page=await anonymous.get('/de/login');
  await anonymous.post('/sl/language').type('form').send({language:'de'}).expect(403);
  await anonymous.post('/sl/language').type('form').send({_csrf:token(page),language:'de'}).expect(302);
  page=await anonymous.get('/de/login');assert.match(page.text,/<html lang="de">/);assert.match(page.text,/Anmelden/);
  const invalid=await anonymous.post('/de/login').type('form').send({_csrf:token(page),email:'invalid@example.test',password:'wrong'}).expect(422);assert.match(invalid.text,/E-Mail-Adresse oder Passwort ist falsch/);
  await agent.post('/sl/language').type('form').send({_csrf:csrf,language:'en',returnTo:'//untrusted.test'}).expect(302).expect('Location','/en/settings');
  assert.equal(c.db.select().from(t.users).where(eq(t.users.id,1)).get().language,'en');
  page=await agent.get('/en/settings');assert.match(page.text,/<html lang="en">/);assert.match(page.text,/Current password/);
  const second=request.agent(app);const login=await second.get('/sl/login');await second.post('/sl/login').type('form').send({_csrf:token(login),email:'i18n1@example.test',password:'Synthetic-password'}).expect(302);assert.match((await second.get('/en/settings')).text,/<html lang="en">/);
  await agent.post('/sl/language').type('form').send({_csrf:csrf,language:'fr'}).expect(422);
  await agent.post('/sl/language').type('form').send({_csrf:csrf,language:'sl'}).expect(302);
  const validation=languageContext.run({language:'de'},()=>parseRecipe({title:'',description:'',prepMinutes:0,cookMinutes:0,servings:2,notes:'',sourceType:'manual',sourceUrl:'',sourceDescription:'',status:'draft',categories:'',ingredientsJson:'[]',stepsJson:'[]'}));
  assert.ok(validation.errors.some(v=>v.includes('Geben Sie einen Rezepttitel ein')));
});
test('private fallback, explicit versions, author checks and localized search retain household isolation',()=>{
  const id=recipes.save(sample(),owner);const original=recipes.get(id,1,1,false);
  assert.equal(recipes.get(id,1,1,'de').title,'Slovenska juha');assert.equal(recipes.get(id,1,1,'de').fallback,true);
  assert.throws(()=>translations.form(outsider,id,'en'),e=>e.status===404);
  translations.save(owner,id,'en',translatedInput(id));
  assert.equal(recipes.get(id,1,1,'en').title,'Onion soup');assert.equal(recipes.get(id,1,1,'sl').title,'Slovenska juha');
  const selected=recipes.get(id,1,1,'en');assert.equal(selected.ingredients[0].id,original.ingredients[0].id);assert.equal(selected.ingredients[0].quantity,'0.125');assert.equal(selected.stepRows[0].id,original.stepRows[0].id);
  assert.equal(catalog.list({...owner,language:'en'},{q:'Onion soup'}).count,1);assert.equal(catalog.list({...owner,language:'en'},{ingredient:'onion'}).count,1);
  assert.equal(catalog.list({...outsider,language:'en'},{q:'Onion soup'}).count,0);
  recipes.save({...sample(),ingredients:[{...sample().ingredients[0],quantity:'2'}]},owner,id);
  assert.equal(recipes.get(id,1,1,'en').language,'sl');assert.equal(recipes.get(id,1,1,'en').ingredients[0].id,original.ingredients[0].id);
  assert.throws(()=>translations.save(owner,id,'en',{...translatedInput(id),revision:'1'}),e=>e.status===409);
  const incomplete=translatedInput(id);incomplete.ingredientsJson=JSON.stringify([{ingredientId:original.ingredients[0].id,name:'Onion',note:''}]);
  assert.throws(()=>translations.save(owner,id,'en',incomplete),e=>e.status===422);
  translations.save(owner,id,'en',{...incomplete,reviewed:''});assert.equal(recipes.get(id,1,1,'en').language,'sl');
});
test('global dictionaries use stable IDs, explicit mappings, aliases and complete activated categories',()=>{
  assert.equal(globalCatalog.list('categories','de',true).find(v=>v.key==='soups').name,'Suppen');
  assert.throws(()=>globalCatalog.save(outsider,'ingredients',{key:'x'}),e=>e.status===403);
  assert.throws(()=>globalCatalog.save(owner,'categories',{key:'partial_category',sl:'Delno',en:'Partial',de:'',active:'1'}),e=>e.status===422);
  const id=globalCatalog.save(owner,'ingredients',{key:'spring_onion',sl:'Mlada čebula',en:'Spring onion',de:'Frühlingszwiebel',aliases_en:'Scallion',aliases_de:'Lauchzwiebel'});
  assert.equal(globalCatalog.autocomplete('en','SCALLION')[0].id,id);assert.equal(globalCatalog.autocomplete('de','Lauchzwiebel')[0].id,id);assert.equal(globalCatalog.autocomplete('sl','Scallion').length,0);
  const custom=recipes.save({...sample('Custom'),ingredients:[{name:'Moja posebna mešanica',quantity:null,unit:'ščepec',note:''}]},owner);
  assert.equal(recipes.get(custom,1,1).ingredients[0].canonicalIngredientId,null);
  assert.throws(()=>globalCatalog.mapping([9999]),e=>e.status===422);
});
test('serving precision and known/custom unit display are independent of recipe translation',()=>{
  assert.equal(scaleQuantity('0.125',2,3,'en'),'0.188');assert.equal(scaleQuantity('0.125',2,3,'de'),'0,188');
  assert.equal(unitLabel('kos','de'),'Stück');assert.equal(unitLabel('tablespoon','en'),'tbsp');assert.equal(unitLabel('žlička','de'),'TL');assert.equal(unitLabel('moj lonček','en'),'moj lonček');
});
test('a missing dictionary translation requires a manually reviewed recipe-specific ingredient name',async()=>{
  const canonicalIngredientId=globalCatalog.save(owner,'ingredients',{key:'custom_spice',sl:'Posebna začimba',en:'Custom spice',de:''});
  const id=recipes.save({...sample('Dictionary fallback'),ingredients:[{...sample().ingredients[0],canonicalIngredientId}]},owner);
  const form=translations.form(owner,id,'de');assert.equal(form.ingredientTexts[0].name,'');
  const input=translatedInput(id,'Gewürzsuppe');const values=JSON.parse(input.ingredientsJson);values[0].name='';input.ingredientsJson=JSON.stringify(values);
  assert.throws(()=>translations.save(owner,id,'de',input),e=>e.status===422);
  values[0].name='Besonderes Gewürz';input.ingredientsJson=JSON.stringify(values);translations.save(owner,id,'de',input);
  const pub=await community.submit(id,owner,{language:'de'});community.review(pub,owner,'approved','','de');
  assert.equal(community.get(pub,outsider).recipe.ingredients[0].name,'Besonderes Gewürz');
  c.db.delete(t.publications).where(eq(t.publications.id,pub)).run();
});
test('public language approval gates direct links, images, favorites, copying, search, statistics and planner content',async()=>{
  const id=recipes.save(sample('Skrivna slovenska javna jed'),owner);
  const publicationId=await community.submit(id,owner,{language:'sl',categoryIds:[2]});community.review(publicationId,owner,'approved','');
  assert.throws(()=>community.get(publicationId,outsider,{language:'sl',review:true}),e=>e.status===404);
  assert.equal(catalog.list(outsider,{view:'public'}).count,0);assert.throws(()=>community.get(publicationId,outsider),e=>e.status===404);
  assert.throws(()=>community.toggleFavorite(publicationId,outsider),e=>e.status===404);await assert.rejects(()=>community.copy(publicationId,outsider),e=>e.status===404);
  assert.equal(recipeReadService(c.db).statistics(outsider,{view:'public'}).recipes.length,0);
  translations.save(owner,id,'de',translatedInput(id,'Zwiebelsuppe'));
  await community.addLanguage(publicationId,owner,'de',[2]);
  assert.equal(catalog.list(outsider,{view:'public'}).count,0);
  const sourceSnapshot=community.get(publicationId,owner).snapshot;
  community.review(publicationId,owner,'approved','','de');
  const german=community.get(publicationId,outsider);assert.equal(german.recipe.title,'Zwiebelsuppe');assert.deepEqual(german.recipe.categories,['Suppen']);assert.equal(community.get(publicationId,owner).snapshot,sourceSnapshot);
  assert.equal(catalog.list(outsider,{view:'public',q:'Zwiebelsuppe',ingredient:'Onion',category:'name:suppen'}).count,1);
  assert.equal(catalog.list(outsider,{view:'public',q:'Skrivna slovenska'}).count,0);
  community.toggleFavorite(publicationId,outsider);assert.equal(catalog.list(outsider,{view:'public',favorite:'1'}).count,1);
  assert.equal(catalog.list({...outsider,language:'en'},{view:'public',favorite:'1'}).count,0);
  const planner=plannerService(c.db);planner.save(outsider,{date:'2026-11-16',slot:'lunch',recipe:`public:${publicationId}`,servings:'4',revision:''});
  assert.equal(planner.week(outsider,'2026-11-16').days[0].meals[0].entry.title,'Zwiebelsuppe');
  const hidden=planner.week({...outsider,language:'en'},'2026-11-16').days[0].meals[0].entry;assert.equal(hidden.available,false);assert.ok(!JSON.stringify(hidden).includes('Zwiebelsuppe'));
  const copy=await community.copy(publicationId,outsider);assert.equal(recipes.get(copy,2,2).originalLanguage,'de');
  recipes.save({...sample('Private changed'),ingredients:[{...sample().ingredients[0],quantity:'8'}]},owner,id);
  assert.equal(community.get(publicationId,outsider).recipe.title,'Zwiebelsuppe');assert.equal(community.get(publicationId,outsider).recipe.ingredients[0].quantity,'0.125');
  await agent.post('/sl/language').type('form').send({_csrf:csrf,language:'en'}).expect(302);
  await agent.get(`/en/community/${publicationId}`).expect(404);await agent.get(`/en/community/${publicationId}/images/0`).expect(404);
  await agent.post(`/en/community/${publicationId}/copy`).type('form').send({_csrf:csrf}).expect(404);
  const publicPage=await agent.get('/en/recipes?view=public').expect(200);assert.ok(!publicPage.text.includes('Skrivna slovenska javna jed'));
  await agent.post('/sl/language').type('form').send({_csrf:csrf,language:'sl'}).expect(302);
  community.review(publicationId,owner,'rejected','Withdrawal','de');assert.throws(()=>community.get(publicationId,outsider),e=>e.status===404);assert.equal(community.get(publicationId,owner).status,'approved');
});
test('public counts and pagination are calculated after the language filter, including incomplete snapshots',()=>{
  for(let i=0;i<27;i++)c.db.insert(t.publications).values({householdId:1,submittedBy:1,status:'approved',createdAt:new Date().toISOString(),snapshot:JSON.stringify({...sample(`EN ${i}`),language:'en',images:[]})}).run();
  c.db.insert(t.publications).values({householdId:1,submittedBy:1,status:'approved',createdAt:new Date().toISOString(),snapshot:JSON.stringify({...sample('INCOMPLETE'),language:'en',ingredients:[],images:[]})}).run();
  const page=catalog.list({...owner,language:'en'},{view:'public',page:'2'});assert.equal(page.count,27);assert.equal(page.recipes.length,3);assert.ok(page.recipes.every(v=>v.title.startsWith('EN ')));
  assert.equal(catalog.list({...owner,language:'de'},{view:'public'}).count,0);
});
test('public drafts require explicit submission and retain review history when another snapshot is created',async()=>{
  const id=recipes.save(sample('Draft publication'),owner);
  const pub=await community.submit(id,owner,{intent:'draft',language:'sl'});
  assert.equal(community.get(pub,owner,{language:'sl',review:true}).status,'draft');
  assert.throws(()=>community.get(pub,{...outsider,language:'sl'}),e=>e.status===404);
  assert.throws(()=>community.review(pub,owner,'approved',''),e=>e.status===422);
  community.submitDraft(pub,owner,'sl');assert.equal(community.get(pub,owner,{review:true}).status,'pending');
  community.review(pub,owner,'rejected','Please revise');
  const next=await community.submit(id,owner,{language:'sl'});assert.notEqual(next,pub);
  assert.equal(community.get(pub,owner,{review:true}).feedback,'Please revise');
});
test('workspace deletion preserves an approved secondary language even when the original is still pending',async()=>{
  c.db.insert(t.households).values({id:3,name:'Multilingual temporary'}).run();
  c.db.insert(t.members).values({userId:1,householdId:3,role:'admin'}).run();
  const user={...owner,householdId:3};const id=recipes.save(sample('Original pending'),user);
  const original=recipes.get(id,3,1,false);
  translations.save(user,id,'de',{title:'Beibehalten',description:'Beschreibung',reviewed:'1',revision:String(original.contentRevision),ingredientsJson:JSON.stringify(original.ingredients.map(i=>({ingredientId:i.id,name:'Zwiebel',note:'gehackt'}))),stepsJson:JSON.stringify(original.stepRows.map(s=>({stepId:s.id,body:'Kochen.'})))});
  const pub=await community.submit(id,user,{language:'sl'});await community.addLanguage(pub,user,'de');community.review(pub,owner,'approved','','de');
  await workspaceDeletionService(c.db,path.join(root,'uploads')).remove(user,3,'Multilingual temporary');
  assert.equal(community.get(pub,outsider).recipe.title,'Beibehalten');assert.throws(()=>community.get(pub,{id:1,householdId:null,role:'viewer',language:'sl'}),e=>e.status===404);
  assert.deepEqual(c.sqlite.pragma('foreign_key_check'),[]);
});
test('a changed source cannot turn an old public language version into a different recipe variant',async()=>{
  const id=recipes.save(sample('Frozen source'),owner);const pub=await community.submit(id,owner,{language:'sl'});community.review(pub,owner,'approved','');
  const original=community.get(pub,owner).snapshot;
  recipes.save({...sample('Source updated'),servings:4},owner,id);
  await assert.rejects(()=>community.addLanguage(pub,owner,'en'),e=>e.status===409);
  assert.equal(community.get(pub,owner).snapshot,original);
  assert.equal(c.db.select().from(t.publicationTranslations).where(eq(t.publicationTranslations.publicationId,pub)).all().length,1);
});
test('deleted public planner sources do not disclose their old foreign-language title snapshots',()=>{
  const pub=c.db.insert(t.publications).values({householdId:1,submittedBy:1,status:'approved',createdAt:new Date().toISOString(),snapshot:JSON.stringify({...sample('Foreign public title'),language:'en',images:[]})}).returning().get().id;
  const planner=plannerService(c.db);planner.save({...owner,language:'en'},{date:'2026-11-20',slot:'dinner',recipe:`public:${pub}`,servings:'2',revision:''});
  c.db.delete(t.publications).where(eq(t.publications.id,pub)).run();
  const row=planner.get({...owner,language:'de'},'2026-11-20','dinner');assert.equal(row.available,false);assert.ok(!JSON.stringify(row).includes('Foreign public title'));
});
