import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import argon2 from 'argon2';
import { loadConfig } from '../src/config/index.js';
import { openDatabase } from '../src/db/index.js';
import { households, users, members } from '../src/db/schema.js';
const { db, sqlite } = openDatabase(loadConfig().databasePath);
if (db.select().from(users).get()) { console.error('Setup is only allowed on an empty user database.'); sqlite.close(); process.exit(1); }
let hidden = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
const rl = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
try {
  const name = (await rl.question('Household name: ')).trim(); if (!name || name.length > 100) throw new Error('Invalid household name.');
  const accounts = [];
  for (let i = 1; i <= 2; i++) {
    const userName = (await rl.question(`Account ${i} name: `)).trim();
    const email = (await rl.question(`Account ${i} email: `)).trim().toLowerCase();
    if (!userName || userName.length > 100) throw new Error('Vnesite ime z 1 do 100 znaki.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Vnesite veljaven e-poštni naslov.');
    process.stdout.write(`Account ${i} password (hidden, at least 8 characters): `); hidden = true;
    const password = await rl.question(''); hidden = false; process.stdout.write('\n');
    process.stdout.write('Confirm password (hidden): '); hidden = true;
    const confirmation = await rl.question(''); hidden = false; process.stdout.write('\n');
    if (password.length < 8 || password.length > 1024) throw new Error('Geslo mora vsebovati od 8 do 1024 znakov. Ponovno zaženite npm run setup.');
    if (password !== confirmation) throw new Error('Gesli se ne ujemata. V obeh pozivih vnesite popolnoma enako geslo. Ponovno zaženite npm run setup.');
    accounts.push({ name: userName, email, passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }) });
  }
  if (accounts[0].email === accounts[1].email) throw new Error('Accounts need different email addresses.');
  db.transaction(tx => { const household = tx.insert(households).values({ name }).returning().get(); for (const [index, account] of accounts.entries()) { const user = tx.insert(users).values({ ...account, isModerator: index === 0 }).returning().get(); tx.insert(members).values({ userId: user.id, householdId: household.id, role: index === 0 ? 'admin' : 'editor' }).run(); } });
  console.log('Household and two accounts created.');
} catch(e) { hidden = false; console.error(e.message); process.exitCode = 1; } finally { rl.close(); sqlite.close(); }
