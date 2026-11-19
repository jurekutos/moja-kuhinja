import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright-core';
import argon2 from 'argon2';
import sharp from 'sharp';
import { openDatabase } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { publicLibraryService } from '../src/services/public-library.js';
import { seedPublicLibrary } from '../src/services/seed-public-library.js';
import { users, households, members, publications, publicationTranslations } from '../src/db/schema.js';

// Uses a temporary database, random test credentials and an existing browser only.
const candidates = [process.env.BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
let executablePath;
for (const candidate of candidates) { try { await fs.access(candidate); executablePath = candidate; break; } catch { /* try next installed browser */ } }
if (!executablePath) throw new Error('Set BROWSER_PATH to an existing Chrome/Chromium/Edge executable. No browser is downloaded automatically.');
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'moja-kuhinja-browser-'));
const connection = openDatabase(path.join(directory, 'test.sqlite'), true);
const password = randomBytes(24).toString('hex');
connection.db.insert(households).values({ id: 1, name: 'Preizkusna kuhinja' }).run();
connection.db.insert(users).values({ id: 1, name: 'Preizkus', email: 'browser@example.test', passwordHash: await argon2.hash(password, { type: argon2.argon2id }), isModerator: true,isSuperAdmin:true,createdAt:new Date().toISOString() }).run();
connection.db.insert(members).values({ userId: 1, householdId: 1, role: 'admin' }).run();
connection.db.insert(users).values({id:2,name:'Member',email:'member@example.test',passwordHash:await argon2.hash(password)}).run();
connection.db.insert(members).values({userId:2,householdId:1,role:'editor'}).run();
seedPublicLibrary(connection.db,{id:1,name:'Admin',isSuperAdmin:true},path.join(directory,'uploads'),{publish:true});
const app = createApp({ ...connection, config: { secret: randomBytes(48).toString('hex'), production: false, uploadDir: path.join(directory, 'uploads'), trustProxy: false } });
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
let browser;
try {
  browser=await chromium.launch({executablePath,headless:true});
  const adminPage=await browser.newPage({viewport:{width:1440,height:1000}}),memberContext=await browser.newContext(),memberPage=await memberContext.newPage();
  const base=`http://127.0.0.1:${server.address().port}/sl`,errors=[];
  for(const page of [adminPage,memberPage]){page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));}
  async function login(page,email){await page.goto(base+'/login');await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);await page.locator('button[type=submit],form button').last().click();await page.waitForURL(base+'/kitchen');}
  async function fillRecipe(page,title){await page.locator('[name=title]').fill(title);await page.locator('[name=description]').fill('Original browser recipe');await page.locator('#add-ingredient').click();await page.locator('[data-field=name]').fill('Water');await page.locator('[data-field=quantity]').fill('1.5');await page.locator('[data-field=unit]').fill('l');await page.locator('#add-step').click();await page.locator('#step-rows textarea').fill('Boil the water.');}
  await login(adminPage,'browser@example.test');
  await adminPage.goto(base+'/super-admin/public-recipes');
  const ids=await adminPage.locator('select[name=first] option[value]:not([value=""])').evaluateAll(nodes=>nodes.slice(0,3).map(n=>n.value));
  for(const [i,name] of ['first','second','third'].entries())await adminPage.locator(`select[name=${name}]`).selectOption(ids[i]);
  await adminPage.locator('form[action$="/featured"] button').click();await adminPage.waitForURL(base+'/super-admin/public-recipes');
  await adminPage.goto(base+'/');assert.equal(await adminPage.locator('.public-featured .recipe-card').count(),3);
  await adminPage.goto(base+'/super-admin/public-recipes/new');await fillRecipe(adminPage,'Admin draft recipe');await adminPage.locator('#recipe-form button[value=draft]').click();await adminPage.waitForURL(/public-recipes\/\d+\/edit/);
  const draftUrl=adminPage.url(),draftId=draftUrl.match(/public-recipes\/(\d+)/)[1];
  const png=await sharp({create:{width:300,height:200,channels:3,background:'#81947a'}}).png().toBuffer();
  await adminPage.locator('input[type=file]').setInputFiles({name:'image.png',mimeType:'image/png',buffer:png});await adminPage.locator('form[enctype] button').click();await adminPage.locator('.image-manager img').waitFor();
  await adminPage.locator('#recipe-form button[value=publish]').click();await adminPage.waitForURL(/public-recipes\/\d+\/edit/);
  const anon=await browser.newPage();await anon.goto(base+'/community/'+draftId);assert.equal(await anon.locator('h1').textContent(),'Admin draft recipe');await anon.close();
  await login(memberPage,'member@example.test');await memberPage.goto(base+'/suggestions/new');await fillRecipe(memberPage,'Member suggested soup');await memberPage.locator('#recipe-form button[value=suggest]').click();await memberPage.waitForURL(base+'/submissions');
  const suggestion=connection.db.select().from(publicationTranslations).all().find(row=>JSON.parse(row.snapshot).title==='Member suggested soup');assert.equal(suggestion.status,'pending');
  await adminPage.goto(base+`/super-admin/public-recipes/${suggestion.publicationId}/edit`);await adminPage.locator('[name=title]').fill('Reviewed member soup');await adminPage.locator('#recipe-form button[value=publish]').click();await adminPage.waitForURL(/public-recipes\/\d+\/edit/);
  await memberPage.goto(base+'/community/'+suggestion.publicationId);await memberPage.locator('form[action$="/copy"] button').click();await memberPage.waitForURL(/\/recipes\/\d+$/);const privateUrl=memberPage.url();
  await memberPage.goto(base+'/recipes?view=all&q=Reviewed');assert.equal(await memberPage.locator('.recipe-card').count(),1);
  await memberPage.goto(base+'/community/'+suggestion.publicationId);await memberPage.locator('form[action$="/copy"] button').click();await memberPage.waitForURL(privateUrl);
  await memberPage.goto(privateUrl+'/edit');await memberPage.locator('[name=title]').fill('Private independent soup');await memberPage.locator('button[value=save]').click();await memberPage.waitForURL(privateUrl);
  await memberPage.goto(base+'/community/'+suggestion.publicationId);assert.equal(await memberPage.locator('h1').textContent(),'Reviewed member soup');
  for(const width of [1440,390,320]){
    await memberPage.setViewportSize({width,height:900});await adminPage.setViewportSize({width,height:900});
    for(const route of ['/','/community','/suggestions/new',`/community/${draftId}`]){await memberPage.goto(base+route);assert.ok(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Member overflow at ${width}: ${route}`);}
    for(const route of ['/super-admin/public-recipes',`/super-admin/public-recipes/${draftId}/edit`]){await adminPage.goto(base+route);assert.ok(await adminPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Admin overflow at ${width}: ${route}`);}
  }
  await fs.mkdir('.runtime/screenshots',{recursive:true});await adminPage.screenshot({path:'.runtime/screenshots/library-editor-mobile.png',fullPage:true});
  adminPage.once('dialog',dialog=>dialog.accept());await adminPage.locator('button[name=decision][value=draft]').click();await adminPage.waitForURL(base+'/super-admin/public-recipes');
  const removed=await adminPage.request.get(base+'/community/'+draftId);assert.equal(removed.status(),404);
  await adminPage.goto(base+`/super-admin/public-recipes/${suggestion.publicationId}/edit`);await adminPage.locator('textarea[name=feedback]').fill('Please clarify the method.');adminPage.once('dialog',dialog=>dialog.accept());await adminPage.locator('button[name=decision][value=rejected]').click();await adminPage.waitForURL(base+'/super-admin/public-recipes');
  await memberPage.goto(privateUrl);assert.equal(await memberPage.locator('h1').textContent(),'Private independent soup');
  assert.deepEqual(errors,[]);console.log('Library browser checks passed: three featured recipes, public admin drafts/publishing/images, member suggestions, review editing, independent duplicate-safe import, rejection/unpublishing and responsive public/admin forms at 1440/390/320px.');
  await memberContext.close();
} finally {
  await browser?.close();await new Promise(resolve=>server.close(resolve));app.locals.sessionStore.close();connection.sqlite.close();await fs.rm(directory,{recursive:true,force:true});
}
