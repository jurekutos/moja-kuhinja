import { and,eq } from 'drizzle-orm';
import * as t from '../db/schema.js';
import { languages,tr } from '../i18n/index.js';

export function translationComplete(recipe, translation, ingredientTexts, stepTexts) {
  return Boolean(translation && translation.title.trim() && (!recipe.description.trim() || translation.description?.trim()) && translation.revision===recipe.contentRevision
    && recipe.ingredients.length && recipe.stepRows.length
    && ingredientTexts.length===recipe.ingredients.length && stepTexts.length===recipe.stepRows.length
    && recipe.ingredients.every(i=>ingredientTexts.some(v=>v.ingredientId===i.id && v.name.trim() && (!i.note.trim() || v.note.trim())))
    && recipe.stepRows.every(s=>stepTexts.some(v=>v.stepId===s.id && v.body.trim())));
}
export function translatedRecipe(db,recipe,language,explicit=false) {
  const translations=db.select().from(t.recipeTranslations).where(eq(t.recipeTranslations.recipeId,recipe.id)).all();
  const versions=translations.map(v=>{
    const ingredientTexts=db.select().from(t.translatedIngredients).where(eq(t.translatedIngredients.translationId,v.id)).all();
    const stepTexts=db.select().from(t.translatedSteps).where(eq(t.translatedSteps.translationId,v.id)).all();
    return {...v,ingredientTexts,stepTexts,complete:translationComplete(recipe,v,ingredientTexts,stepTexts)};
  });
  const selected=versions.find(v=>v.language===language && v.complete && (v.reviewed || explicit));
  if (!selected || language===recipe.originalLanguage) return {...recipe,language:recipe.originalLanguage,translations:versions.map(({language,reviewed,complete})=>({language,reviewed,complete})),fallback:language!==recipe.originalLanguage};
  return {...recipe,title:selected.title,description:selected.description,language:selected.language,fallback:false,
    ingredients:recipe.ingredients.map(i=>{const text=selected.ingredientTexts.find(v=>v.ingredientId===i.id);return {...i,name:text.name,note:text.note};}),
    steps:recipe.stepRows.map(s=>selected.stepTexts.find(v=>v.stepId===s.id).body),
    translations:versions.map(({language,reviewed,complete})=>({language,reviewed,complete}))};
}
export function recipeTranslationService(db,recipes) {
  return {
    form(user,id,language) {
      const recipe=recipes.requireAuthor(id,user);
      if(!languages.includes(language) || language===recipe.originalLanguage)throw Object.assign(new Error(tr('common:invalidLanguage')),{status:422});
      const version=db.select().from(t.recipeTranslations).where(and(eq(t.recipeTranslations.recipeId,id),eq(t.recipeTranslations.language,language))).get();
      const ingredientTexts=version?db.select().from(t.translatedIngredients).where(eq(t.translatedIngredients.translationId,version.id)).all():recipe.ingredients.map(i=>({ingredientId:i.id,name:i.canonicalIngredientId?db.select().from(t.globalIngredientNames).where(and(eq(t.globalIngredientNames.ingredientId,i.canonicalIngredientId),eq(t.globalIngredientNames.language,language))).get()?.name || '':'',note:''}));
      const stepTexts=version?db.select().from(t.translatedSteps).where(eq(t.translatedSteps.translationId,version.id)).all():[];
      return {recipe,translationLanguage:language,version:version||{title:'',description:'',reviewed:false},ingredientTexts,stepTexts};
    },
    save(user,id,language,input) {
      const {recipe}=this.form(user,id,language);
      if(String(recipe.contentRevision)!==String(input.revision))throw Object.assign(new Error(tr('common:translationConflict')),{status:409});
      let ingredients,steps;
      try {ingredients=JSON.parse(input.ingredientsJson);steps=JSON.parse(input.stepsJson);}catch{throw Object.assign(new Error(tr('common:invalidTranslation')),{status:422});}
      const validText=(value,max)=>typeof value==='string' && value.length<=max;
      if(!validText(input.title,160) || !input.title.trim() || !validText(input.description,3000)
        || !Array.isArray(ingredients) || !Array.isArray(steps) || ingredients.length!==recipe.ingredients.length || steps.length!==recipe.stepRows.length
        || new Set(ingredients.map(v=>v?.ingredientId)).size!==ingredients.length || new Set(steps.map(v=>v?.stepId)).size!==steps.length
        || ingredients.some(v=>!v || !recipe.ingredients.some(i=>i.id===v.ingredientId) || !validText(v.name,150) || !validText(v.note,250))
        || steps.some(v=>!v || !recipe.stepRows.some(s=>s.id===v.stepId) || !validText(v.body,3000)))throw Object.assign(new Error(tr('common:invalidTranslation')),{status:422});
      const reviewed=input.reviewed==='1';
      if(reviewed && !translationComplete(recipe,{title:input.title,description:input.description,revision:recipe.contentRevision},ingredients,steps))throw Object.assign(new Error(tr('common:incomplete')),{status:422});
      return db.transaction(tx=>{
        // Re-check authorization and revision inside the write transaction.
        recipes.requireAuthor(id,user);
        const current=tx.select().from(t.recipes).where(eq(t.recipes.id,id)).get();
        if(current.contentRevision!==recipe.contentRevision)throw Object.assign(new Error(tr('common:translationConflict')),{status:409});
        const values={title:input.title.trim(),description:input.description.trim(),revision:recipe.contentRevision,reviewed,updatedAt:new Date().toISOString()};
        const version=tx.insert(t.recipeTranslations).values({...values,recipeId:id,language}).onConflictDoUpdate({target:[t.recipeTranslations.recipeId,t.recipeTranslations.language],set:values}).returning().get();
        tx.delete(t.translatedIngredients).where(eq(t.translatedIngredients.translationId,version.id)).run();
        tx.delete(t.translatedSteps).where(eq(t.translatedSteps.translationId,version.id)).run();
        ingredients.forEach(v=>tx.insert(t.translatedIngredients).values({translationId:version.id,ingredientId:v.ingredientId,name:v.name.trim(),note:v.note.trim()}).run());
        steps.forEach(v=>tx.insert(t.translatedSteps).values({translationId:version.id,stepId:v.stepId,body:v.body.trim()}).run());
      });
    },
  };
}
