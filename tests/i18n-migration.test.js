import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openDatabase,applyMigrations} from '../src/db/index.js';

test('additive multilingual migration preserves source IDs, text, snapshots, accounts, sessions and planner references',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'moja-language-upgrade-'));
  const folder=path.join(root,'migrations');await fs.cp('src/db/migrations',folder,{recursive:true});
  const journalPath=path.join(folder,'meta','_journal.json');const journal=JSON.parse(await fs.readFile(journalPath,'utf8'));journal.entries=journal.entries.slice(0,7);await fs.writeFile(journalPath,JSON.stringify(journal));
  const c=openDatabase(path.join(root,'db.sqlite'));
  try{
    applyMigrations(c.db,c.sqlite,folder);
    c.sqlite.exec(`insert into households(id,name) values(1,'Legacy');
      insert into users(id,name,email,password_hash) values(1,'Legacy','legacy@example.test','unchanged-hash');
      insert into household_members(user_id,household_id,role) values(1,1,'admin');
      insert into recipes(id,household_id,title,description,created_by,created_at,updated_at) values(42,1,'Stara juha','Opis',1,'2026-01-01','2026-02-01');
      insert into ingredients(id,household_id,name,normalized_name) values(7,1,'Čebula','čebula');
      insert into recipe_ingredients(id,recipe_id,ingredient_id,name,quantity,unit,note,position) values(91,42,7,'Čebula','0.125','kos','sesekljana',0);
      insert into recipe_steps(id,recipe_id,body,position) values(81,42,'Skuhajte.',0);
      insert into categories(id,household_id,name,normalized_name) values(6,1,'Moje','moje');
      insert into recipe_categories(recipe_id,category_id) values(42,6);
      insert into recipe_images(id,recipe_id,filename,thumbnail,position) values(3,42,'same.webp','same-small.webp',0);
      insert into recipe_notes(user_id,recipe_id,body) values(1,42,'Private');
      insert into recipe_comments(id,recipe_id,user_id,body,created_at) values(1,42,1,'Comment','2026-01-01');
      insert into favorites(user_id,recipe_id) values(1,42);
      insert into recipe_reads(user_id,recipe_id,day) values(1,42,'2026-11-15');
      insert into sessions(sid,data,expires) values('old-session','{"userId":1}',9999999999999);`);
    const snapshot=JSON.stringify({title:'Javna stara juha',description:'Opis',ingredients:[{name:'Čebula',quantity:'0.125',unit:'kos',note:'sesekljana'}],steps:['Skuhajte.'],images:[{filename:'public.webp',thumbnail:'public-small.webp'}],categories:['Moje']});
    c.sqlite.prepare('insert into recipe_publications(id,recipe_id,household_id,submitted_by,status,snapshot,created_at,reviewed_at,reviewed_by) values(9,42,1,1,?,?,?, ?,1)').run('approved',snapshot,'2026-01-01','2026-01-02');
    c.sqlite.prepare('insert into recipe_publications(id,recipe_id,household_id,submitted_by,status,snapshot,created_at) values(10,42,1,1,?,?,?)').run('approved',JSON.stringify({title:'Incomplete',ingredients:[],steps:[],images:[]}), '2026-01-01');
    c.sqlite.exec(`insert into community_favorites(user_id,publication_id) values(1,9);
      insert into meal_plan_entries(household_id,date,slot,publication_id,title_snapshot,servings,revision,updated_by,created_at,updated_at) values(1,'2026-11-16','lunch',9,'Javna stara juha',4,'old-revision',1,'2026-01-01','2026-01-01');`);
    const oldTables=['users','households','household_members','recipes','ingredients','recipe_ingredients','recipe_steps','categories','recipe_categories','recipe_images','recipe_notes','recipe_comments','favorites','community_favorites','recipe_publications','recipe_reads','sessions','meal_plan_entries'];
    const before=Object.fromEntries(oldTables.map(table=>[table,c.sqlite.prepare(`select * from ${table}`).all()]));
    applyMigrations(c.db,c.sqlite);
    for(const [table,rows] of Object.entries(before)){
      const after=c.sqlite.prepare(`select * from ${table}`).all();
      assert.equal(after.length,rows.length,table);
      rows.forEach((row,index)=>{for(const [key,value] of Object.entries(row))assert.deepEqual(after[index][key],value,`${table}.${key}`);});
    }
    assert.equal(c.sqlite.prepare('select language from users').get().language,'sl');
    assert.equal(c.sqlite.prepare('select original_language from recipes').get().original_language,'sl');
    const version=c.sqlite.prepare('select * from recipe_translations where recipe_id=42').get();assert.equal(version.language,'sl');assert.equal(version.title,'Stara juha');
    assert.equal(c.sqlite.prepare('select ingredient_id from translated_ingredients where translation_id=?').get(version.id).ingredient_id,91);
    assert.equal(c.sqlite.prepare('select step_id from translated_steps where translation_id=?').get(version.id).step_id,81);
    const publicVersion=c.sqlite.prepare('select * from publication_translations where publication_id=9').get();assert.equal(publicVersion.snapshot,snapshot);assert.equal(publicVersion.complete,1);assert.equal(publicVersion.status,'approved');
    assert.equal(c.sqlite.prepare('select complete from publication_translations where publication_id=10').get().complete,0);
    assert.equal(c.sqlite.prepare('select count(*) as n from publication_categories').get().n,0);
    assert.deepEqual(c.sqlite.pragma('foreign_key_check'),[]);
    applyMigrations(c.db,c.sqlite);assert.equal(c.sqlite.prepare('select count(*) as n from recipe_translations').get().n,1);
  }finally{c.sqlite.close();await fs.rm(root,{recursive:true,force:true});}
});
