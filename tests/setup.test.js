import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { openDatabase } from '../src/db/index.js';
import { users, members, households } from '../src/db/schema.js';

function runSetup(databasePath, answers = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/setup.js'], { env: { ...process.env, DATABASE_PATH: databasePath, SESSION_SECRET: randomBytes(48).toString('hex') }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', sent = 0; const timeout = setTimeout(() => { child.kill(); reject(new Error('Setup command timed out')); }, 10000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const current = answers[sent];
      if (current && output.includes(current[0])) { sent++; child.stdin.write(current[1] + '\n'); }
    });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => { clearTimeout(timeout); resolve({ code, output }); });
  });
}
test('setup creates exactly two accounts with hashes, refuses rerun and rolls back mismatched passwords', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'moja-kuhinja-setup-'));
  const databasePath = path.join(directory, 'setup.sqlite');
  const password = randomBytes(4).toString('hex'); // Exactly eight characters exercises the minimum.
  let connection = openDatabase(databasePath, true);
  connection.sqlite.close();
  try {
    const tooShort = password.slice(0, 7);
    const shortAnswers = [['Household name:', 'Test household'], ['Account 1 name:', 'First test user'], ['Account 1 email:', 'first@example.test'], ['Account 1 password', tooShort], ['Confirm password', tooShort]];
    const rejected = await runSetup(databasePath, shortAnswers); assert.equal(rejected.code, 1); assert.match(rejected.output, /od 8 do 1024/);
    const answers = [['Household name:', 'Test household'], ['Account 1 name:', 'First test user'], ['Account 1 email:', 'first@example.test'], ['Account 1 password', password], ['Confirm password', 'different-password']];
    const invalid = await runSetup(databasePath, answers); assert.equal(invalid.code, 1);
    connection = openDatabase(databasePath); assert.equal(connection.db.select().from(users).all().length, 0); connection.sqlite.close();
    const validAnswers = [['Household name:', 'Test household'], ['Account 1 name:', 'First test user'], ['Account 1 email:', 'FIRST@example.test'], ['Account 1 password', password], ['Confirm password', password], ['Account 2 name:', 'Second test user'], ['Account 2 email:', 'second@example.test'], ['Account 2 password', password], ['Confirm password', password]];
    const valid = await runSetup(databasePath, validAnswers); assert.equal(valid.code, 0, valid.output); assert.ok(!valid.output.includes(password));
    connection = openDatabase(databasePath);
    const accounts = connection.db.select().from(users).all(); assert.equal(accounts.length, 2); assert.equal(accounts[0].email, 'first@example.test');
    assert.match(accounts[0].passwordHash, /^\$argon2id\$/); assert.equal(await argon2.verify(accounts[0].passwordHash, password), true);
    assert.equal(connection.db.select().from(members).all().length, 2); assert.equal(connection.db.select().from(households).all().length, 1);
    connection.sqlite.close();
    const duplicate = await runSetup(databasePath); assert.equal(duplicate.code, 1);
  } finally { if (connection.sqlite.open) connection.sqlite.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
