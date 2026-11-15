import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/index.js';
import * as t from '../src/db/schema.js';
import { recipeService } from '../src/services/recipes.js';
import { parseRecipe } from '../src/validators/recipe.js';
import { scaleQuantity } from '../public/js/quantities.js';
import { validateImage, MAX_IMAGE_SIZE } from '../src/services/images.js';

let directory, connection, app, alice, bob, outsider, csrfA, csrfB, csrfO, service;
const password = 'Temporary test password only!';
function token(response) { const match = response.text.match(/name="_csrf" value="([a-f0-9]+)"/); assert.ok(match, response.text.slice(0, 400)); return match[1]; }
function recipe(overrides = {}) { return { title: 'Piščanec s špinačo', description: 'Domače kosilo', prepMinutes: '10', cookMinutes: '20', servings: '2', notes: 'Moja skrivnost', sourceType: 'manual', sourceUrl: '', sourceDescription: '', status: 'published', categories: 'Kosilo, Hitro', ingredientsJson: JSON.stringify([{ name: 'Piščanec', quantity: '300', unit: 'g', note: 'na kocke' }, { name: 'Sol', quantity: '', unit: 'po okusu', note: '' }]), stepsJson: JSON.stringify(['Narežite sestavine.', 'Skuhajte.']), ...overrides }; }
async function login(agent, email) { const initial = await agent.get('/sl/login').expect(200); await agent.post('/sl/login').type('form').send({ _csrf: token(initial), email, password }).expect(302); return token(await agent.get('/sl/recipes').expect(200)); }
async function create(overrides = {}) { const response = await alice.post('/sl/recipes').type('form').send({ ...recipe(overrides), _csrf: csrfA }).expect(302); return Number(response.headers.location.match(/recipes\/(\d+)/)[1]); }

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'moja-kuhinja-test-'));
  connection = openDatabase(path.join(directory, 'test.sqlite'), true);
  const db = connection.db;
  db.insert(t.households).values([{ id: 1, name: 'Testni dom' }, { id: 2, name: 'Drug dom' }]).run();
  const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  for (const [id, name, householdId] of [[1, 'Alice', 1], [2, 'Bob', 1], [3, 'Other', 2]]) { db.insert(t.users).values({ id, name, email: `${name.toLowerCase()}@example.test`, passwordHash: hash }).run(); db.insert(t.members).values({ userId: id, householdId }).run(); }
  app = createApp({ ...connection, config: { secret: 'test-secret-'.repeat(5), production: false, uploadDir: path.join(directory, 'uploads'), trustProxy: false } });
  service = recipeService(db);
  alice = request.agent(app); bob = request.agent(app); outsider = request.agent(app);
  csrfA = await login(alice, 'alice@example.test'); csrfB = await login(bob, 'bob@example.test'); csrfO = await login(outsider, 'other@example.test');
});
after(async () => { app?.locals.sessionStore.close(); connection?.sqlite.close(); if (directory) await fs.rm(directory, { recursive: true, force: true }); });

test('anonymous visitors cannot read or modify recipes or images', async () => {
  await request(app).get('/sl/').expect(200);
  for (const route of ['/recipes', '/recipes/new', '/recipes/1', '/recipes/1/edit', '/recipes/1/cook', '/images/1', '/workspace']) await request(app).get('/sl'+route).expect(302).expect('Location','/sl/login');
  await request(app).post('/sl/recipes').send(recipe()).expect(302);
});
test('login rejects invalid credentials, requires CSRF, and rotates the session', async () => {
  const agent = request.agent(app); const page = await agent.get('/sl/login'); const oldCookie = page.headers['set-cookie'][0].split(';')[0]; const csrf = token(page);
  await agent.post('/sl/login').type('form').send({ email: 'alice@example.test', password }).expect(403);
  await agent.post('/sl/login').type('form').send({ _csrf: csrf, email: 'alice@example.test', password: 'wrong' }).expect(422);
  const success = await agent.post('/sl/login').type('form').send({ _csrf: csrf, email: 'alice@example.test', password }).expect(302);
  assert.notEqual(success.headers['set-cookie'][0].split(';')[0], oldCookie);
  assert.match(success.headers['set-cookie'][0], /HttpOnly/); assert.match(success.headers['set-cookie'][0], /SameSite=Lax/);
  const newToken = token(await agent.get('/sl/recipes'));
  await agent.post('/sl/logout').type('form').send({ _csrf: newToken }).expect(302); await agent.get('/sl/recipes').expect(302).expect('Location','/sl/login');
});
test('CSRF rejects foreign and malformed Unicode tokens', async () => {
  await alice.post('/sl/recipes').type('form').send({ ...recipe(), _csrf: csrfB }).expect(403);
  await alice.post('/sl/recipes').type('form').send({ ...recipe(), _csrf: 'ž'.repeat(64) }).expect(403);
});
test('creates a recipe with normalized ingredients, categories and ordered steps', async () => {
  const id = await create(); const saved = service.get(id, 1, 1);
  assert.equal(saved.title, 'Piščanec s špinačo'); assert.equal(saved.ingredients[0].quantity, '300'); assert.equal(saved.ingredients[1].quantity, null); assert.ok(saved.ingredients[0].ingredientId); assert.deepEqual(saved.steps, ['Narežite sestavine.', 'Skuhajte.']); assert.deepEqual(saved.categories, ['Kosilo', 'Hitro']);
  await alice.get(`/sl/recipes/${id}`).expect(200); await alice.get(`/sl/recipes/${id}/edit`).expect(200); await alice.get(`/sl/recipes/${id}/cook`).expect(200);
});
test('household isolation covers detail, edits, favorite, delete and uploads', async () => {
  const id = await create();
  for (const suffix of ['', '/edit', '/cook']) await outsider.get(`/sl/recipes/${id}${suffix}`).expect(404);
  for (const suffix of ['', '/delete', '/favorite']) await outsider.post(`/sl/recipes/${id}${suffix}`).type('form').send({ ...recipe(), _csrf: csrfO }).expect(404);
  await outsider.post(`/sl/recipes/${id}/images`).field('_csrf', csrfO).expect(404);
  assert.equal(service.list({ id: 3, householdId: 2 }).count, 0);
});
test('members share recipes but have private notes and personal favorites', async () => {
  const id = await create(); assert.equal(service.get(id, 1, 1).notes, 'Moja skrivnost'); assert.equal(service.get(id, 1, 2).notes, '');
  await bob.get(`/sl/recipes/${id}`).expect(200);
  await alice.post(`/sl/recipes/${id}/favorite`).type('form').send({ _csrf: csrfA }).expect(302);
  assert.equal(service.get(id, 1, 1).favorite, true); assert.equal(service.get(id, 1, 2).favorite, false);
  assert.ok(service.list({ id: 1, householdId: 1 }, { favorite: '1' }).recipes.some(r => r.id === id));
  await alice.post(`/sl/recipes/${id}/favorite`).type('form').send({ _csrf: csrfA }).expect(302); assert.equal(service.get(id, 1, 1).favorite, false);
});
test('updates replace child rows atomically, preserving catalog references', async () => {
  const id = await create(); const ingredientId = service.get(id, 1, 1).ingredients[0].ingredientId;
  await alice.post(`/sl/recipes/${id}`).type('form').send({ ...recipe({ title: 'Posodobljen recept', ingredientsJson: JSON.stringify([{ name: 'PIŠČANEC', quantity: '0,125', unit: 'kg', note: 'nov zapis' }]), stepsJson: JSON.stringify(['Drugi korak najprej', 'Prvi korak zatem']) }), _csrf: csrfA }).expect(302);
  const saved = service.get(id, 1, 1); assert.equal(saved.ingredients.length, 1); assert.equal(saved.ingredients[0].ingredientId, ingredientId); assert.equal(saved.ingredients[0].quantity, '0.125'); assert.equal(saved.steps[0], 'Drugi korak najprej');
});
test('invalid input preserves submitted form values and does not create rows', async () => {
  const before = service.list({ id: 1, householdId: 1 }).count;
  for (const overrides of [{ title: '' }, { servings: '0' }, { prepMinutes: '-1' }, { sourceUrl: 'javascript:alert(1)' }, { ingredientsJson: '{bad' }, { stepsJson: '[]' }, { ingredientsJson: JSON.stringify([{ name: 'Test', quantity: 'NaN', unit: 'g', note: '' }]) }]) await alice.post('/sl/recipes').type('form').send({ ...recipe(overrides), _csrf: csrfA }).expect(422);
  assert.equal(service.list({ id: 1, householdId: 1 }).count, before);
});
test('drafts may be incomplete and preview does not persist', async () => {
  const id = await create({ status: 'draft', ingredientsJson: '[]', stepsJson: '[]' }); assert.equal(service.get(id, 1, 1).status, 'draft');
  const before = service.list({ id: 1, householdId: 1 }).count;
  const result = await alice.post('/sl/recipes').type('form').send({ ...recipe(), intent: 'preview', _csrf: csrfA }).expect(200); assert.match(result.text, /PREDOGLED/); assert.equal(service.list({ id: 1, householdId: 1 }).count, before);
});
test('serving calculations avoid binary artifacts, retain originals and handle null', () => {
  assert.equal(scaleQuantity('300', 2, 4), '600'); assert.equal(scaleQuantity('0.1', 2, 6), '0,3'); assert.equal(scaleQuantity('1', 3, 2), '0,667'); assert.equal(scaleQuantity(null, 2, 4), ''); assert.equal(scaleQuantity('0.125', 2, 4), '0,25'); assert.throws(() => scaleQuantity('1', 2, 0));
});
test('search handles Slovenian case, ingredient, category, favorites and literal wildcards', async () => {
  const id = await create({ title: 'Žganci za večerjo', ingredientsJson: JSON.stringify([{ name: 'Ajdova moka', quantity: '200', unit: 'g', note: '' }]) }); const user = { id: 1, householdId: 1 };
  assert.ok(service.list(user, { q: 'ŽGANCI' }).recipes.some(r => r.id === id)); assert.ok(service.list(user, { ingredient: 'AJDOVA' }).recipes.some(r => r.id === id)); assert.equal(service.list(user, { q: '%' }).count, 0);
  const category = service.categories(user).find(c => c.name === 'Kosilo'); assert.ok(service.list(user, { category: String(category.id) }).count > 0);
  await alice.get('/sl/recipes?q=%C5%BDganci&sort=alpha').expect(200);
});
test('output escapes stored markup and source URLs reject dangerous schemes', async () => {
  const id = await create({ title: '<script>alert(1)</script>' }); const result = await alice.get(`/sl/recipes/${id}`).expect(200); assert.ok(result.text.includes('&lt;script&gt;')); assert.ok(!result.text.includes('<script>alert(1)</script>'));
  assert.equal(parseRecipe(recipe({ sourceUrl: 'data:text/html,test' })).success, false);
});
test('upload validation checks MIME, content, size and actual decode', async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#81947a' } }).png().toBuffer();
  await validateImage({ mimetype: 'image/png', size: png.length, buffer: png });
  for (const file of [{ mimetype: 'image/svg+xml', size: 5, buffer: Buffer.from('<svg>') }, { mimetype: 'image/png', size: 10, buffer: Buffer.from('not a png') }, { mimetype: 'image/png', size: MAX_IMAGE_SIZE + 1, buffer: png }]) await assert.rejects(() => validateImage(file));
});
test('uploads, covers, authorized serving, removal and recipe deletion clean files', async () => {
  const id = await create(); const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#81947a' } }).png().toBuffer();
  await alice.post(`/sl/recipes/${id}/images`).field('_csrf', 'bad').attach('images', png, 'test.png').expect(403);
  await alice.post(`/sl/recipes/${id}/images`).field('_csrf', csrfA).attach('images', Buffer.from('fake'), { filename: 'fake.png', contentType: 'image/png' }).expect(422);
  await alice.post(`/sl/recipes/${id}/images`).field('_csrf', csrfA).attach('images', png, 'one.png').attach('images', png, 'two.png').expect(302);
  let saved = service.get(id, 1, 1); assert.equal(saved.images.length, 2); const [first, second] = saved.images;
  await alice.get(`/sl/images/${first.id}?size=small`).expect(200).expect('Content-Type', /image\/webp/);
  await bob.get(`/sl/images/${first.id}`).expect(200); await outsider.get(`/sl/images/${first.id}`).expect(404);
  await outsider.post(`/sl/images/${first.id}/delete`).type('form').send({ _csrf: csrfO }).expect(404);
  await alice.post(`/sl/images/${second.id}/cover`).type('form').send({ _csrf: csrfA }).expect(302); assert.equal(service.get(id, 1, 1).images[0].id, second.id);
  await alice.post(`/sl/images/${first.id}/delete`).type('form').send({ _csrf: csrfA }).expect(302); await assert.rejects(fs.stat(path.join(directory, 'uploads', first.filename)));
  await alice.post(`/sl/recipes/${id}/delete`).type('form').send({ _csrf: csrfA }).expect(302); await alice.get(`/sl/recipes/${id}`).expect(404); await assert.rejects(fs.stat(path.join(directory, 'uploads', second.filename)));
  assert.equal(connection.db.select().from(t.steps).where(eq(t.steps.recipeId, id)).all().length, 0);
});
test('pages render and sessions persist in SQLite', async () => {
  for (const route of ['/', '/planner', '/shopping', '/recipes/new']) await alice.get('/sl'+route).expect(200);
  assert.ok(connection.db.select().from(t.sessions).all().length >= 3); assert.equal(connection.sqlite.pragma('foreign_keys', { simple: true }), 1); assert.equal(connection.sqlite.pragma('journal_mode', { simple: true }), 'wal');
});
test('authentication rate limiter blocks repeated attempts', async () => {
  const agent = request.agent(app); const csrf = token(await agent.get('/sl/login'));
  for (let i = 0; i < 16; i++) { const result = await agent.post('/sl/login').type('form').send({ _csrf: csrf, email: 'nobody@example.test', password: 'wrong' }); if (result.status === 429) return; }
  assert.fail('Expected rate limiting');
});

test('household members share persisted comments with author names while notes remain private', async () => {
  const id = await create();
  await alice.post(`/sl/recipes/${id}/comments`).type('form').send({ _csrf: csrfA, body: '  Odlično kosilo!  ', userId: 2 }).expect(302).expect('Location',`/sl/recipes/${id}#comments`);
  await bob.post(`/sl/recipes/${id}/comments`).type('form').send({ _csrf: csrfB, body: 'Naslednjič dodajva baziliko.' }).expect(302);
  const rows = connection.db.select().from(t.comments).where(eq(t.comments.recipeId, id)).all();
  assert.equal(rows.length, 2); assert.equal(rows[0].userId, 1); assert.equal(rows[0].body, 'Odlično kosilo!');
  const page = await bob.get(`/sl/recipes/${id}`).expect(200);
  assert.match(page.text, /Odlično kosilo!/); assert.match(page.text, /Naslednjič dodajva baziliko/); assert.match(page.text, /Alice/); assert.match(page.text, /datetime=/);
  assert.ok(!page.text.includes('Moja skrivnost'));
  assert.equal(service.get(id, 1, 1).notes, 'Moja skrivnost');
});

test('comments require authentication, household authorization and CSRF', async () => {
  const id = await create();
  await request(app).post(`/sl/recipes/${id}/comments`).type('form').send({ body: 'Test' }).expect(302).expect('Location','/sl/login');
  await alice.post(`/sl/recipes/${id}/comments`).type('form').send({ body: 'Test' }).expect(403);
  await outsider.post(`/sl/recipes/${id}/comments`).type('form').send({ _csrf: csrfO, body: 'Test' }).expect(404);
  assert.equal(connection.db.select().from(t.comments).where(eq(t.comments.recipeId, id)).all().length, 0);
});

test('comment validation rejects blank, oversized and non-text content; markup is escaped', async () => {
  const id = await create();
  for (const body of ['', '   ', 'a'.repeat(2001), ['bad', 'input']]) {
    const response = await alice.post(`/sl/recipes/${id}/comments`).type('form').send({ _csrf: csrfA, body }).expect(422);
    assert.match(response.text, /role="alert"/);
  }
  assert.equal(connection.db.select().from(t.comments).where(eq(t.comments.recipeId, id)).all().length, 0);
  const body = '<script>alert(1)</script>\nKuharski namig.';
  await alice.post(`/sl/recipes/${id}/comments`).type('form').send({ _csrf: csrfA, body }).expect(302);
  const response = await bob.get(`/sl/recipes/${id}`).expect(200);
  assert.ok(response.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.ok(!response.text.includes('<script>alert(1)</script>'));
  await alice.post(`/sl/recipes/${id}/comments`).type('form').send({ _csrf: csrfA, body: 'a'.repeat(2000) }).expect(302);
});

test('only comment authors may delete their comments; recipe deletion cascades comments', async () => {
  const id = await create(); const otherId = await create();
  await alice.post(`/sl/recipes/${id}/comments`).type('form').send({ _csrf: csrfA, body: 'Za izbris' }).expect(302);
  const comment = connection.db.select().from(t.comments).where(eq(t.comments.recipeId, id)).get();
  await bob.post(`/sl/recipes/${id}/comments/${comment.id}/delete`).type('form').send({ _csrf: csrfB }).expect(404);
  await outsider.post(`/sl/recipes/${id}/comments/${comment.id}/delete`).type('form').send({ _csrf: csrfO }).expect(404);
  await alice.post(`/sl/recipes/${otherId}/comments/${comment.id}/delete`).type('form').send({ _csrf: csrfA }).expect(404);
  await alice.post(`/sl/recipes/${id}/comments/${comment.id}/delete`).type('form').send({}).expect(403);
  await alice.post(`/sl/recipes/${id}/comments/${comment.id}/delete`).type('form').send({ _csrf: csrfA }).expect(302);
  assert.equal(connection.db.select().from(t.comments).where(eq(t.comments.recipeId, id)).all().length, 0);
  await bob.post(`/sl/recipes/${id}/comments`).type('form').send({ _csrf: csrfB, body: 'Izbriši skupaj z receptom' }).expect(302);
  await alice.post(`/sl/recipes/${id}/delete`).type('form').send({ _csrf: csrfA }).expect(302);
  assert.equal(connection.db.select().from(t.comments).where(eq(t.comments.recipeId, id)).all().length, 0);
});
