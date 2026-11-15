import { eq,and,sql } from 'drizzle-orm';
import * as t from '../db/schema.js';
import { languages,tr } from '../i18n/index.js';
import { normalized } from './recipes.js';
const fail=()=>{throw Object.assign(new Error(tr('common:invalidTranslation')),{status:422});};
export function globalCatalogService(db) {
  function admin(user) {if(!db.select().from(t.users).where(and(eq(t.users.id,user.id),eq(t.users.isSuperAdmin,true))).get())throw Object.assign(new Error(tr("common:sbdabedf54319")),{status:403});}
  function list(kind,language='sl',active=false) {
    const table=kind==='categories'?t.globalCategories:t.globalIngredients;
    const names=kind==='categories'?t.globalCategoryNames:t.globalIngredientNames;
    const ref=kind==='categories'?names.categoryId:names.ingredientId;
    return db.select().from(table).all().filter(v=>!active||v.active).map(row=>({...row,names:Object.fromEntries(db.select().from(names).where(eq(ref,row.id)).all().map(v=>[v.language,v.name])),aliases:kind==='ingredients'?db.select().from(t.ingredientAliases).where(eq(t.ingredientAliases.ingredientId,row.id)).all():[]})).map(row=>({...row,name:row.names[language]||row.key}));
  }
  return {
    list,
    autocomplete(language,term='') {
      if(!languages.includes(language))fail();
      const needle=normalized(String(term).slice(0,150));
      return list('ingredients',language).filter(row=>row.names[language] && (normalized(row.names[language]).includes(needle)||row.aliases.some(a=>a.language===language&&a.normalizedName.includes(needle)))).slice(0,20).map(({id,key,name})=>({id,key,name}));
    },
    adminList(user,kind){admin(user);return list(kind);},
    save(user,kind,input) {
      admin(user);if(!['categories','ingredients'].includes(kind)||typeof input.key!=='string'||!/^[a-z][a-z0-9_]{1,79}$/.test(input.key))fail();
      const names={};for(const language of languages){if(typeof input[language]!=='string'||input[language].trim().length>150)fail();names[language]=input[language].trim();}
      const active=input.active==='1';
      if(kind==='categories'&&active&&languages.some(l=>!names[l]))fail();
      if(!names.sl||!names.en)fail();
      const table=kind==='categories'?t.globalCategories:t.globalIngredients;
      const nameTable=kind==='categories'?t.globalCategoryNames:t.globalIngredientNames;
      const reference=kind==='categories'?'categoryId':'ingredientId';
      let id=input.id?Number(input.id):null;
      if(input.id&&(!Number.isSafeInteger(id)||id<1||!db.select().from(table).where(eq(table.id,id)).get()))fail();
      if(id && db.select().from(table).where(eq(table.id,id)).get().key!==input.key)fail();
      if(db.select().from(table).where(eq(table.key,input.key)).all().some(row=>row.id!==id))fail();
      return db.transaction(tx=>{
        if(id)tx.update(table).set({key:input.key,...(kind==='categories'?{active}:{})}).where(eq(table.id,id)).run();
        else id=tx.insert(table).values({key:input.key,...(kind==='categories'?{active}:{})}).returning().get().id;
        for(const language of languages){const where=and(eq(nameTable[reference],id),eq(nameTable.language,language));tx.delete(nameTable).where(where).run();if(names[language])tx.insert(nameTable).values({[reference]:id,language,name:names[language]}).run();}
        if(kind==='ingredients') {
          tx.delete(t.ingredientAliases).where(eq(t.ingredientAliases.ingredientId,id)).run();
          for(const language of languages){const aliases=String(input[`aliases_${language}`]||'').split(',').map(v=>v.trim()).filter(Boolean);if(aliases.length>30||aliases.some(a=>a.length>150))fail();for(const name of aliases)tx.insert(t.ingredientAliases).values({ingredientId:id,language,name,normalizedName:normalized(name)}).onConflictDoNothing().run();}
        }
        return id;
      });
    },
    mapping(ids) {
      if(!Array.isArray(ids)||ids.length>10||new Set(ids).size!==ids.length)fail();
      const categories=list('categories','sl',true);
      return ids.map(id=>{const row=categories.find(c=>c.id===id);if(!row||languages.some(l=>!row.names[l]))fail();return row;});
    },
    duplicates(user,kind) {
      admin(user);const rows=list(kind);const result=[];
      for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(languages.some(l=>rows[i].names[l]&&rows[j].names[l]&&normalized(rows[i].names[l])===normalized(rows[j].names[l])))result.push([rows[i],rows[j]]);
      return result.slice(0,100);
    },
  };
}
