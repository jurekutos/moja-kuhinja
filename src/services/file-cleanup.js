import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { images,publications,fileDeletions } from '../db/schema.js';
export function referencedFiles(db) {
  const used=new Set(db.select().from(images).all().flatMap(row=>[row.filename,row.thumbnail]));
  for(const row of db.select({snapshot:publications.snapshot}).from(publications).all()) for(const image of JSON.parse(row.snapshot).images) {used.add(image.filename);used.add(image.thumbnail);}
  return used;
}
export async function drainFileDeletions(db,directory) {
  const used=referencedFiles(db);let pending=0;
  for(const item of db.select().from(fileDeletions).all()) {
    if(!/^[a-f0-9-]{36}(-small)?\.webp$/.test(item.filename)) {pending++;continue;}
    try {if(!used.has(item.filename))await fs.unlink(path.join(directory,item.filename));}
    catch(error) {if(error.code!=='ENOENT'){pending++;continue;}}
    db.delete(fileDeletions).where(eq(fileDeletions.filename,item.filename)).run();
  }
  return pending;
}
