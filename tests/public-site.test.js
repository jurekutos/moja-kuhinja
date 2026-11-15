import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { openDatabase } from '../src/db/index.js';
import * as t from '../src/db/schema.js';
import { createApp } from '../src/app.js';

test('anonymous cookbook exposes only approved language snapshots and safe canonical SEO', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'moja-public-'));
  const c=openDatabase(path.join(root,'test.sqlite'),true);
  let app;
  try {
    c.db.insert(t.households).values({id:1,name:'PRIVATE HOUSEHOLD'}).run();
    c.db.insert(t.users).values({id:1,name:'Author',email:'private@example.test',passwordHash:'unused'}).run();
    const snapshot=JSON.stringify({title:'Public soup',description:'Safe </script><script>alert(1)</script>',author:'Author',ingredients:[{name:'Water',quantity:'1.25',unit:'l'}],steps:['Boil water.'],images:[],notes:'PRIVATE NOTES'});
    const id=c.db.insert(t.publications).values({householdId:1,submittedBy:1,status:'approved',snapshot,createdAt:'2026-11-15T10:00:00Z'}).returning().get().id;
    c.db.insert(t.publicationTranslations).values([
      {publicationId:id,language:'sl',status:'approved',complete:true,snapshot,feedback:'PRIVATE FEEDBACK',createdAt:'2026-11-15T10:00:00Z'},
      {publicationId:id,language:'en',status:'pending',complete:true,snapshot,createdAt:'2026-11-15T10:00:00Z'},
    ]).onConflictDoUpdate({target:[t.publicationTranslations.publicationId,t.publicationTranslations.language],set:{snapshot,status:'approved',complete:true,feedback:'PRIVATE FEEDBACK'}}).run();
    app=createApp({...c,config:{secret:'synthetic-public-secret-'.repeat(4),production:false,trustProxy:false,siteUrl:'https://recipes.example.test',uploadDir:path.join(root,'uploads')}});
    const directory=await request(app).get('/sl/community').expect(200);
    assert.match(directory.text,/Public soup/);
    assert.equal(directory.headers['set-cookie'],undefined);
    for(const language of ['en','de']) {
      const page=await request(app).get('/'+language+'/community').expect(200);
      assert.ok(!page.text.includes('Public soup'));
      await request(app).get('/'+language+'/community/'+id).expect(404);
      await request(app).get('/'+language+'/community/'+id+'/images/0').expect(404);
    }
    const redirect=await request(app).get('/sl/community/'+id).expect(301);
    assert.equal(redirect.headers.location,'/sl/community/'+id+'-public-soup');
    const detail=await request(app).get(redirect.headers.location).set('Host','hostile.example').expect(200);
    const structured=detail.text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(structured);
    const data=JSON.parse(structured[1]);
    assert.equal(data.name,'Public soup');
    assert.equal(data.url,'https://recipes.example.test'+redirect.headers.location);
    assert.equal(data.aggregateRating,undefined);
    assert.equal(data.prepTime,undefined);
    assert.ok(!structured[1].includes('</script>'));
    for(const secret of ['PRIVATE NOTES','PRIVATE HOUSEHOLD','PRIVATE FEEDBACK','private@example.test','hostile.example'])assert.ok(!detail.text.includes(secret),secret);
    const filtered=await request(app).get('/sl/community?q=absent').expect(200);
    assert.equal(filtered.headers['x-robots-tag'],'noindex, follow');
    assert.ok(!filtered.text.includes('Public soup'));
    const sitemap=await request(app).get('/sitemap.xml').expect(200);
    assert.ok(sitemap.text.includes('https://recipes.example.test'+redirect.headers.location));
    assert.ok(!sitemap.text.includes('/en/community/'+id));
    assert.ok(!sitemap.text.includes('/settings'));
    const robots=await request(app).get('/robots.txt').expect(200);
    assert.match(robots.text,/Disallow: \/sl\/recipes/);
    await request(app).get('/sl/settings').expect(302);
    await request(app).get('/sl/recipes/1').expect(302);
    await request(app).get('/sl/community/'+id+'?reviewLanguage=en').expect(301);
    c.db.update(t.publicationTranslations).set({status:'rejected'}).where(eq(t.publicationTranslations.publicationId,id)).run();
    await request(app).get(redirect.headers.location).expect(404);
    const withdrawn=await request(app).get('/sitemap.xml').expect(200);
    assert.ok(!withdrawn.text.includes(redirect.headers.location));
  } finally {
    app?.locals.sessionStore.close();c.sqlite.close();await fs.rm(root,{recursive:true,force:true});
  }
});
