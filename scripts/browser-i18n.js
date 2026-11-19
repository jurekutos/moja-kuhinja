import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright-core';
import argon2 from 'argon2';
import sharp from 'sharp';
import { openDatabase } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import * as t from '../src/db/schema.js';
import { recipeService } from '../src/services/recipes.js';
import { imageService } from '../src/services/images.js';
import { communityService } from '../src/services/community.js';
const candidates=[process.env.BROWSER_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean);
let executablePath;for(const candidate of candidates){try{await fs.access(candidate);executablePath=candidate;break;}catch{/* Next installed browser. */}}
if(!executablePath)throw new Error('Set BROWSER_PATH to an installed Chromium browser.');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'moja-browser-i18n-'));const c=openDatabase(path.join(root,'db.sqlite'),true);
let browser,server,app;
try{
  const password=randomBytes(20).toString('hex');
  c.db.insert(t.households).values({id:1,name:'Test kitchen'}).run();
  c.db.insert(t.users).values({id:1,name:'Test author',email:'language-browser@example.test',passwordHash:await argon2.hash(password),isSuperAdmin:true,isModerator:true}).run();
  c.db.insert(t.members).values({userId:1,householdId:1,role:'admin'}).run();
  const user={id:1,householdId:1,role:'admin',name:'Test author',language:'sl',isModerator:true};
  const recipes=recipeService(c.db),images=imageService(c.db,path.join(root,'uploads')),community=communityService(c.db,recipes,images,path.join(root,'uploads'));
  const id=recipes.save({title:'Slovenska čebulna juha',description:'Domača juha',prepMinutes:5,cookMinutes:10,servings:2,notes:'',sourceType:'manual',sourceUrl:'',sourceDescription:'',status:'published',categories:['Moja kategorija'],ingredients:[{name:'Čebula',quantity:'0.125',unit:'kos',note:'sesekljana',canonicalIngredientId:2}],steps:['Skuhajte.']},user);
  const buffer=await sharp({create:{width:30,height:20,channels:3,background:'#81947a'}}).png().toBuffer();await images.add(id,[{buffer,size:buffer.length,mimetype:'image/png'}]);
  const pub=await community.submit(id,user,{categoryIds:[2]});community.review(pub,user,'approved','');
  app=createApp({...c,config:{secret:randomBytes(40).toString('hex'),production:false,trustProxy:false,uploadDir:path.join(root,'uploads')}});
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});const origin=`http://127.0.0.1:${server.address().port}`;let base=origin+'/sl';
  browser=await chromium.launch({executablePath,headless:true});const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/login');await page.locator('.language-picker select').selectOption('de');await page.locator('.language-picker button').click();assert.equal(await page.locator('html').getAttribute('lang'),'de');await page.getByLabel('E-Mail-Adresse',{exact:true}).fill('language-browser@example.test');await page.getByLabel('Passwort',{exact:true}).fill(password);await page.getByRole('button',{name:'Anmelden',exact:true}).click();await page.waitForURL(base+'/kitchen');
  await page.goto(base+'/settings');await page.locator('.language-picker select').selectOption('en');await page.locator('.language-picker button').click();base=origin+'/en';assert.equal(await page.locator('h1').textContent(),'My profile');
  await page.goto(base+`/recipes/${id}`);assert.equal(await page.locator('h1').textContent(),'Slovenska čebulna juha');assert.ok((await page.locator('.language-indicator').textContent()).includes('Showing the original language'));
  await page.goto(base+`/community/${pub}`);assert.equal(await page.locator('h1').textContent(),'Not found');assert.ok(!(await page.locator('main').textContent()).includes('Slovenska čebulna juha'));
  await page.goto(base+`/recipes/${id}/translations/en`);await page.locator('input[name=title]').fill('English onion soup');await page.locator('textarea[name=description]').fill('A home soup');await page.locator('[data-translation-name]').fill('Onion');await page.locator('[data-translation-note]').fill('chopped');await page.locator('[data-translated-step]').fill('Cook the onion.');await page.locator('input[name=reviewed]').check();await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForURL(base+`/recipes/${id}?lang=en`);assert.equal(await page.locator('h1').textContent(),'English onion soup');await page.getByLabel('Servings',{exact:true}).fill('3');assert.equal(await page.locator('[data-quantity]').textContent(),'0.188');
  await page.goto(base+`/community/${pub}?reviewLanguage=sl`);await page.locator('form[action$="/languages"] select').selectOption('en');await page.locator('form[action$="/languages"] button').filter({hasText:'Submit language version for review'}).click();await page.waitForURL(base+`/community/${pub}?reviewLanguage=en`);await page.getByRole('button',{name:'Approve publication',exact:true}).click();await page.waitForURL(base+'/admin/reviews');
  await page.goto(base+'/recipes?view=public');assert.equal(await page.locator('.recipe-card').count(),1);assert.ok((await page.locator('.recipe-card').textContent()).includes('English onion soup'));
  await page.goto(base+'/recipes/new');const row=page.locator('.ingredient-row').first();await page.getByRole('button',{name:'+ Add ingredient',exact:true}).click();await row.locator('input[data-field=name]').fill('onion');await row.locator('select').selectOption('2');assert.equal(await row.locator('input[data-field=name]').inputValue(),'Onion');
  const translatedPaths=['/suggestions/new','/super-admin/public-recipes','/super-admin/public-recipes/new','/','/settings','/recipes','/recipes/new',`/recipes/${id}`,`/recipes/${id}/edit`,`/recipes/${id}/translations/en`,'/recipes/statistics','/community','/planner','/workspace','/super-admin','/super-admin/statistics','/super-admin/catalog/categories','/super-admin/catalog/ingredients'];
  await fs.mkdir('.runtime/screenshots',{recursive:true});
  for(const language of ['en','de']){
    await page.goto(base+'/settings');await page.locator('.language-picker select').selectOption(language);await page.locator('.language-picker button').click();base=origin+'/'+language;
    for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});for(const url of translatedPaths){await page.goto(base+url);assert.equal(await page.locator('html').getAttribute('lang'),language);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${language} overflow at ${width}: ${url}`);assert.equal(await page.locator('h1').count(),1);assert.ok(!(await page.locator('main').textContent()).match(/\b(?:common|recipes|auth|planner):s[a-f0-9]{12}\b/));}}
    await page.goto(base+`/recipes/${id}`);await page.screenshot({path:`.runtime/screenshots/i18n-${language}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('Multilingual browser checks passed: preferences, localized login/settings, private fallback, translation editing, per-language public review, public visibility, ingredient autocomplete, decimal scaling and EN/DE layouts at 1440/390/320px.');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));app?.locals.sessionStore.close();c.sqlite.close();await fs.rm(root,{recursive:true,force:true});}
