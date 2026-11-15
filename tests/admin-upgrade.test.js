import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { openDatabase,applyMigrations } from '../src/db/index.js';
function cli(args,filename,script='scripts/grant-super-admin.js') {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[script,...args],{env:{...process.env,DATABASE_PATH:filename,UPLOAD_DIR:path.join(path.dirname(filename),'uploads'),SESSION_SECRET:randomBytes(48).toString('hex')},stdio:['ignore','pipe','pipe']});let output='';
    child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,output}));
  });
}
test('nonempty admin migration preserves publication references, plans, sessions, users and unknown dates without granting owner privileges',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'moja-admin-upgrade-'));const filename=path.join(root,'db.sqlite');const folder=path.join(root,'migrations');await fs.cp('src/db/migrations',folder,{recursive:true});
  const journalFile=path.join(folder,'meta','_journal.json');const journal=JSON.parse(await fs.readFile(journalFile,'utf8'));journal.entries=journal.entries.slice(0,5);await fs.writeFile(journalFile,JSON.stringify(journal));
  const c=openDatabase(filename);
  try {
    applyMigrations(c.db,c.sqlite,folder);
    c.sqlite.prepare('insert into households (id,name) values (?,?)').run(1,'Legacy space');
    c.sqlite.prepare('insert into users (id,name,email,password_hash,is_moderator) values (?,?,?,?,?)').run(1,'Legacy user','legacy@example.test','untouched-hash',1);
    c.sqlite.prepare('insert into household_members (user_id,household_id,role) values (?,?,?)').run(1,1,'admin');
    c.sqlite.prepare('insert into recipes (id,household_id,title,created_by,created_at,updated_at) values (?,?,?,?,?,?)').run(1,1,'Legacy recipe',1,'2026-01-01','2026-01-01');
    c.sqlite.prepare('insert into recipe_publications (id,household_id,recipe_id,submitted_by,status,snapshot,created_at) values (?,?,?,?,?,?,?)').run(1,1,1,1,'approved',JSON.stringify({title:'Snapshot',images:[]}),'2026-01-01');
    c.sqlite.prepare('insert into community_favorites (user_id,publication_id) values (?,?)').run(1,1);
    c.sqlite.prepare('insert into meal_plan_entries (household_id,date,slot,publication_id,title_snapshot,servings,revision,updated_by,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?)').run(1,'2026-11-16','lunch',1,'Snapshot',2,'revision',1,'2026-01-01','2026-01-01');
    c.sqlite.prepare('insert into sessions (sid,data,expires) values (?,?,?)').run('legacy-session',JSON.stringify({userId:1,csrf:'legacy-csrf'}),Date.now()+86400000);
    applyMigrations(c.db,c.sqlite);
    assert.equal(c.sqlite.prepare('select count(*) n from community_favorites').get().n,1);assert.equal(c.sqlite.prepare('select publication_id from meal_plan_entries').get().publication_id,1);assert.equal(c.sqlite.prepare('select count(*) n from sessions').get().n,1);
    const account=c.sqlite.prepare('select * from users').get();assert.equal(account.is_super_admin,0);assert.equal(account.session_version,0);assert.equal(account.password_hash,'untouched-hash');assert.equal(account.created_at,null);assert.equal(c.sqlite.prepare('select created_at from households').get().created_at,null);
    assert.deepEqual(c.sqlite.pragma('foreign_key_check'),[]);assert.equal(c.sqlite.pragma('foreign_keys',{simple:true}),1);
    applyMigrations(c.db,c.sqlite);assert.equal(c.sqlite.prepare('select count(*) n from recipe_publications').get().n,1);
  } finally {c.sqlite.close();await fs.rm(root,{recursive:true,force:true});}
});
test('owner CLI requires an explicit existing email and confirmation, is idempotent and never grants another owner by accident',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'moja-owner-cli-'));const filename=path.join(root,'db.sqlite');const c=openDatabase(filename,true);
  try {
    for(const [id,email] of [[1,'first@example.test'],[2,'owner@example.test']])c.sqlite.prepare('insert into users (id,name,email,password_hash) values (?,?,?,?)').run(id,'Test account',email,'synthetic-hash');
    assert.notEqual((await cli([],filename)).code,0);assert.notEqual((await cli(['--email','owner@example.test'],filename)).code,0);assert.notEqual((await cli(['--email','missing@example.test','--confirm-owner'],filename)).code,0);
    assert.equal((await cli(['--email','owner@example.test','--confirm-owner'],filename)).code,0);assert.equal((await cli(['--email','owner@example.test','--confirm-owner'],filename)).code,0);
    assert.equal(c.sqlite.prepare('select is_super_admin from users where id=1').get().is_super_admin,0);assert.equal(c.sqlite.prepare('select is_super_admin from users where id=2').get().is_super_admin,1);assert.equal(c.sqlite.prepare('select count(*) n from audit_events').get().n,1);
    assert.notEqual((await cli(['--email','first@example.test','--confirm-owner'],filename)).code,0);
    await fs.mkdir(path.join(root,'uploads'));await fs.writeFile(path.join(root,'uploads','synthetic.txt'),'synthetic file');
    // Backup itself is tested only with this synthetic database and a temporary working directory.
    const {backupMatched}=await import('../src/services/backup.js');const destination=path.join(root,'backup');await backupMatched(c.sqlite,path.join(root,'uploads'),destination);
    const backup=openDatabase(path.join(destination,'kitchen.sqlite'));assert.equal(backup.sqlite.prepare('select count(*) n from users').get().n,2);backup.sqlite.close();assert.equal(await fs.readFile(path.join(destination,'uploads','synthetic.txt'),'utf8'),'synthetic file');await fs.access(path.join(destination,'manifest.json'));
  } finally {c.sqlite.close();await fs.rm(root,{recursive:true,force:true});}
});
