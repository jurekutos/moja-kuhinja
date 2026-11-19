import { eq } from 'drizzle-orm';
import * as t from '../db/schema.js';
import { publicLibraryService } from './public-library.js';
import { starterRecipes } from '../db/public-recipes.js';
import { normalized } from './recipes.js';

export function seedPublicLibrary(db,user,directory,{publish=false}={}) {
  const service=publicLibraryService(db,directory);
  let added=0,skipped=0;
  // One transaction covers all fixtures. Reruns never update existing content.
  db.transaction(tx=>{
    for(const recipe of starterRecipes){
      const key='starter-sl-v1-'+recipe.key;
      if(tx.select().from(t.publicSeedEntries).where(eq(t.publicSeedEntries.key,key)).get()){skipped++;continue;}
      const duplicate=tx.select().from(t.publicationTranslations).all().some(row=>row.language==='sl'&&normalized(JSON.parse(row.snapshot).title)===normalized(recipe.title));
      if(duplicate){skipped++;continue;}
      const categoryIds=tx.select().from(t.globalCategories).all().filter(c=>c.active&&recipe.categories.includes(c.key)).map(c=>c.id);
      const id=service.save(user,{...recipe,originalLanguage:'sl',categoryIds,ingredientsJson:JSON.stringify(recipe.ingredients),stepsJson:JSON.stringify(recipe.steps),intent:publish?'publish':'draft'});
      tx.insert(t.publicSeedEntries).values({key,publicationId:id}).run();added++;
    }
  });
  return {added,skipped};
}
