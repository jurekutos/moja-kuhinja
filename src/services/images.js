import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { eq, and, sql } from 'drizzle-orm';
import { images, recipes } from '../db/schema.js';
export const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
export async function validateImage(file) {
  if (!file || file.size > MAX_IMAGE_SIZE || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) throw Object.assign(new Error('Dovoljene so slike JPEG, PNG in WebP do 8 MB.'), { status: 422 });
  try {
    const metadata = await sharp(file.buffer, { limitInputPixels: 40000000, animated: false }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error();
  } catch { throw Object.assign(new Error('Datoteka ni veljavna nepremična slika JPEG, PNG ali WebP (največ 40 milijonov pik).'), { status: 422 }); }
}
export function imageService(db, directory) {
  async function unlinkRows(rows) { for (const row of rows) for (const name of [row.filename, row.thumbnail]) { try { await fs.unlink(path.join(directory, name)); } catch(e) { if (e.code !== 'ENOENT') console.error('Image cleanup failed:', e.code); } } }
  return {
    unlinkRows,
    async add(recipeId, files) {
      const count = db.select({ count: sql`count(*)` }).from(images).where(eq(images.recipeId, recipeId)).get().count;
      if (count + files.length > 10) throw Object.assign(new Error('Recept ima lahko največ 10 slik. Najprej odstranite odvečne slike.'), { status: 422 });
      for (const file of files) await validateImage(file);
      await fs.mkdir(directory, { recursive: true });
      const rows = [];
      try {
        for (const [i, file] of files.entries()) {
          const id = randomUUID(); const row = { recipeId, filename: `${id}.webp`, thumbnail: `${id}-small.webp`, position: count + i };
          rows.push(row);
          await sharp(file.buffer, { limitInputPixels: 40000000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(directory, row.filename));
          await sharp(file.buffer, { limitInputPixels: 40000000 }).rotate().resize({ width: 600, height: 450, fit: 'cover', withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(directory, row.thumbnail));
        }
        db.transaction(tx => {
          const current = tx.select({ count: sql`count(*)` }).from(images).where(eq(images.recipeId, recipeId)).get().count;
          if (current + rows.length > 10) throw Object.assign(new Error('Recept ima lahko največ 10 slik.'), { status: 422 });
          const max = tx.select({ position: sql`coalesce(max(${images.position}), -1)` }).from(images).where(eq(images.recipeId, recipeId)).get().position;
          rows.forEach((row, i) => tx.insert(images).values({ ...row, position: max + i + 1 }).run());
        });
      } catch(e) { await unlinkRows(rows); throw e; }
    },
    get(id, householdId) { const row = db.select({ image: images }).from(images).innerJoin(recipes, eq(recipes.id, images.recipeId)).where(and(eq(images.id, id), eq(recipes.householdId, householdId))).get(); if (!row) throw Object.assign(new Error('Slika ni na voljo.'), { status: 404 }); return row.image; },
    async remove(id, householdId) { const row = this.get(id, householdId); db.delete(images).where(eq(images.id, id)).run(); await unlinkRows([row]); return row.recipeId; },
    cover(id, householdId) { const row = this.get(id, householdId); db.transaction(tx => { tx.update(images).set({ position: sql`${images.position} + 1` }).where(eq(images.recipeId, row.recipeId)).run(); tx.update(images).set({ position: 0 }).where(eq(images.id, id)).run(); }); return row.recipeId; },
  };
}
