import { and,eq,sql } from 'drizzle-orm';
import { createHash,randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import * as t from '../db/schema.js';
import { parseRecipe } from '../validators/recipe.js';
import { globalCatalogService } from './global-catalog.js';
import { validateImage } from './images.js';
import { drainFileDeletions } from './file-cleanup.js';
import { tr,languages } from '../i18n/index.js';
import { snapshotComplete } from './content-visibility.js';

const fail=(key,status=422)=>{throw Object.assign(new Error(tr('library:'+key)),{status});};
export const versionToken=row=>createHash('sha256').update(JSON.stringify([row.snapshot,row.status,row.reviewedAt])).digest('hex');
export function publicLibraryService(db,directory) {
  const admin=user=>{if(!db.select().from(t.users).where(and(eq(t.users.id,user?.id||0),eq(t.users.isSuperAdmin,true))).get())fail('forbidden',403);};
  const version=(id,language)=>{const row=db.select().from(t.publicationTranslations).where(and(eq(t.publicationTranslations.publicationId,id),eq(t.publicationTranslations.language,language))).get();if(!row)fail('missing',404);return row;};
  function syncOriginal(tx,id,language,snapshot) {
    const publication=tx.select().from(t.publications).where(eq(t.publications.id,id)).get();
    if((JSON.parse(publication.snapshot).language||'sl')===language)tx.update(t.publications).set({snapshot}).where(eq(t.publications.id,id)).run();
  }
  function validated(body) {
    const result=parseRecipe({...body,notes:'',status:'published',categories:'',sourceType:body.sourceType||'manual',sourceUrl:body.sourceUrl||'',sourceDescription:body.sourceDescription||''});
    if(!result.success)throw Object.assign(new Error(result.errors.join('\n')),{status:422});
    if(!languages.includes(body.originalLanguage))fail('invalid');
    const categories=globalCatalogService(db).mapping([body.categoryIds||[]].flat().filter(Boolean).map(Number));
    return {...result.data,language:body.originalLanguage,categories:categories.map(c=>c.names[body.originalLanguage]),globalCategoryIds:categories.map(c=>c.id)};
  }
  function write(user,body,id=null) {
    if(id||body.adminCreate)admin(user);
    const value=validated(body),language=value.language,now=new Date().toISOString();
    const status=body.adminCreate&&body.intent==='publish'?'approved':body.adminCreate&&body.intent==='draft'?'draft':'pending';
    return db.transaction(tx=>{
      const previous=id?version(id,language):null;
      if(previous&&body.version!==versionToken(previous))fail('conflict',409);
      const snapshot=JSON.stringify({...value,notes:undefined,suggestion:previous?JSON.parse(previous.snapshot).suggestion:!body.adminCreate,author:previous?JSON.parse(previous.snapshot).author:user.name,images:previous?JSON.parse(previous.snapshot).images||[]:[]});
      if(!id)id=tx.insert(t.publications).values({submittedBy:user.id,householdId:null,status:status==='approved'?'approved':'pending',snapshot,createdAt:now}).returning().get().id;
      // The compatibility trigger creates the original-language version. Upsert
      // it explicitly so drafts and language selection share the same rules.
      const publication=tx.select().from(t.publications).where(eq(t.publications.id,id)).get();
      if((JSON.parse(publication.snapshot).language||'sl')===language)tx.update(t.publications).set({snapshot,status:status==='draft'?'pending':status}).where(eq(t.publications.id,id)).run();
      tx.insert(t.publicationTranslations).values({publicationId:id,language,status,complete:true,snapshot,createdAt:now,reviewedAt:status==='approved'?now:null,reviewedBy:status==='approved'?user.id:null}).onConflictDoUpdate({target:[t.publicationTranslations.publicationId,t.publicationTranslations.language],set:{snapshot,status,complete:true,feedback:'',reviewedAt:status==='approved'?now:null,reviewedBy:status==='approved'?user.id:null}}).run();
      tx.delete(t.publicationCategories).where(eq(t.publicationCategories.publicationId,id)).run();
      value.globalCategoryIds.forEach(categoryId=>tx.insert(t.publicationCategories).values({publicationId:id,categoryId}).run());
      if(previous&&status!=='approved')tx.delete(t.featuredRecipes).where(and(eq(t.featuredRecipes.publicationId,id),eq(t.featuredRecipes.language,language))).run();
      return id;
    });
  }
  return {
    version,
    suggest(user,body){if(!user?.id)fail('forbidden',403);return write(user,{...body,intent:'suggest',adminCreate:false});},
    save(user,body,id=null){admin(user);return write(user,{...body,adminCreate:true},id);},
    list(user,language){admin(user);return db.all(sql`select p.id,v.language,v.status,json_extract(v.snapshot,'$.title') title from recipe_publications p join publication_translations v on v.publication_id=p.id where v.language=${language} order by case v.status when 'pending' then 0 else 1 end,p.id desc`);},
    moderate(user,id,language,decision,feedback,token){
      admin(user);const row=version(id,language);
      if(token!==versionToken(row))fail('conflict',409);
      if(!['approved','rejected','draft'].includes(decision)||typeof feedback!=='string'||feedback.length>2000||decision==='rejected'&&!feedback.trim())fail('invalid');
      if(decision==='approved'&&(!row.complete||!snapshotComplete(JSON.parse(row.snapshot))))fail('invalid');
      db.transaction(tx=>{tx.update(t.publicationTranslations).set({status:decision,feedback:feedback.trim(),reviewedBy:user.id,reviewedAt:new Date().toISOString()}).where(eq(t.publicationTranslations.id,row.id)).run();if(decision!=='approved')tx.delete(t.featuredRecipes).where(and(eq(t.featuredRecipes.publicationId,id),eq(t.featuredRecipes.language,language))).run();});
    },
    feature(user,language,ids){
      admin(user);if(!languages.includes(language)||!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3||ids.some(id=>!Number.isSafeInteger(id)||id<1))fail('three');
      db.transaction(tx=>{for(const id of ids){const row=version(id,language);if(row.status!=='approved'||!row.complete||!snapshotComplete(JSON.parse(row.snapshot)))fail('three');}tx.delete(t.featuredRecipes).where(eq(t.featuredRecipes.language,language)).run();ids.forEach((publicationId,i)=>tx.insert(t.featuredRecipes).values({language,position:i+1,publicationId}).run());});
    },
    featured(language){return db.select().from(t.featuredRecipes).where(eq(t.featuredRecipes.language,language)).orderBy(t.featuredRecipes.position).all();},
    async upload(user,id,language,files,token){
      admin(user);const before=version(id,language);if(token!==versionToken(before))fail('conflict',409);
      const value=JSON.parse(before.snapshot);if(!files.length||value.images.length+files.length>10)fail('invalid');
      for(const file of files)await validateImage(file);
      const rows=[];await fs.mkdir(directory,{recursive:true});
      try {
        for(const file of files){const key=randomUUID(),row={filename:key+'.webp',thumbnail:key+'-small.webp'};rows.push(row);await sharp(file.buffer,{limitInputPixels:40000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(path.join(directory,row.filename));await sharp(file.buffer,{limitInputPixels:40000000}).rotate().resize(600,450,{fit:'cover'}).webp({quality:78}).toFile(path.join(directory,row.thumbnail));}
        db.transaction(tx=>{if(versionToken(version(id,language))!==token)fail('conflict',409);value.images.push(...rows);tx.update(t.publicationTranslations).set({snapshot:JSON.stringify(value)}).where(eq(t.publicationTranslations.id,before.id)).run();syncOriginal(tx,id,language,JSON.stringify(value));});
      }catch(error){for(const row of rows)for(const name of [row.filename,row.thumbnail])await fs.unlink(path.join(directory,name)).catch(()=>{});throw error;}
    },
    async removeImage(user,id,language,index,token){
      admin(user);const row=version(id,language);if(token!==versionToken(row))fail('conflict',409);const value=JSON.parse(row.snapshot);if(!Number.isSafeInteger(index)||index<0||!value.images[index])fail('missing',404);
      const [image]=value.images.splice(index,1);
      db.transaction(tx=>{tx.update(t.publicationTranslations).set({snapshot:JSON.stringify(value)}).where(eq(t.publicationTranslations.id,row.id)).run();syncOriginal(tx,id,language,JSON.stringify(value));for(const filename of [image.filename,image.thumbnail])tx.insert(t.fileDeletions).values({filename,createdAt:new Date().toISOString()}).onConflictDoNothing().run();});
      // Cleanup checks every snapshot reference before deleting shared files.
      await drainFileDeletions(db,directory);
    },
  };
}
