import { sql } from 'drizzle-orm';
import { snapshotComplete,publicVersion } from './content-visibility.js';
import { tr } from '../i18n/index.js';

export function publicRecipePath(id,title) {
  const slug=String(title).normalize('NFKD').replace(/\p{M}/gu,'').replace(/ß/g,'ss').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100).replace(/-$/,'') || 'recipe';
  return `/community/${id}-${slug}`;
}
export const validPublicationImage = image => image && /^[a-f0-9-]{36}\.webp$/.test(image.filename) && /^[a-f0-9-]{36}-small\.webp$/.test(image.thumbnail);
const unavailable=()=>{throw Object.assign(new Error(tr('common:unavailable')),{status:404});};

// This read-only projection never returns the private source, household, reader
// identities, review feedback, raw snapshot or filesystem names to public views.
export function publicCookbook(db) {
  const integer=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max?value:null;
  const where=(language)=>sql`v.language=${language} and exists(${publicVersion(sql`v.publication_id`,language)})`;
  function categories(id,language) {
    return db.all(sql`select c.id,c.key,n.name from publication_categories pc join global_categories c on c.id=pc.category_id join global_category_names n on n.category_id=c.id where pc.publication_id=${id} and c.active=1 and n.language=${language} order by n.name,c.id`);
  }
  function project(row,language,user=null) {
    const value=JSON.parse(row.snapshot);
    if(!snapshotComplete(value))return unavailable();
    return {id:row.id,language,title:value.title,description:String(value.description||''),prepMinutes:integer(value.prepMinutes,0,10080),cookMinutes:integer(value.cookMinutes,0,10080),servings:integer(value.servings,1,100),
      author:String(value.author||''),authorHref:user&&row.submitted_by?'/recipes?view=public&author='+row.submitted_by:null,sourceUrl:/^https?:\/\//i.test(value.sourceUrl||'')?value.sourceUrl:'',sourceDescription:String(value.sourceDescription||''),
      ingredients:value.ingredients.map(i=>({name:i.name,quantity:i.quantity??null,unit:String(i.unit||''),note:String(i.note||'')})),steps:value.steps.map(String),categories:categories(row.id,language),
      images:(value.images||[]).flatMap((image,index)=>validPublicationImage(image)?[{url:`/community/${row.id}/images/${index}`,thumbnail:`/community/${row.id}/images/${index}?size=small`}]:[]),
      href:publicRecipePath(row.id,value.title),updatedAt:row.reviewed_at||row.created_at,
      favorite:Boolean(user&&db.get(sql`select 1 from community_favorites f where f.publication_id=${row.id} and f.user_id=${user.id}`))};
  }
  return {
    featured(language,user=null) {
      const selected=db.all(sql`select publication_id from featured_recipes where language=${language} order by position`);
      return selected.flatMap(row=>{try{return [this.get(row.publication_id,language,user)];}catch(error){if(error.status===404)return [];throw error;}});
    },
    get(id,language,user=null) {
      if(!Number.isSafeInteger(id)||id<1)return unavailable();
      const row=db.get(sql`select p.id,p.submitted_by,v.snapshot,v.created_at,v.reviewed_at from recipe_publications p join publication_translations v on v.publication_id=p.id where p.id=${id} and ${where(language)}`);
      if(!row)return unavailable();return project(row,language,user);
    },
    list(language,query={},size=24,user=null) {
      const q=typeof query.q==='string'?query.q.trim().slice(0,160):'';
      const ingredient=typeof query.ingredient==='string'?query.ingredient.trim().slice(0,150):'';
      const maxTime=['15','30','60'].includes(query.maxTime)?query.maxTime:'';
      const category=typeof query.category==='string'?query.category.slice(0,80):'';
      const sort=query.sort==='alpha'?'alpha':'newest';
      const filters=[where(language)];
      const favorite=user&&query.favorite==='1'?'1':'';
      if(favorite)filters.push(sql`exists(select 1 from community_favorites f where f.publication_id=p.id and f.user_id=${user.id})`);
      if(q)filters.push(sql`instr(normalize_sl(json_extract(v.snapshot,'$.title')),normalize_sl(${q}))>0`);
      if(ingredient)filters.push(sql`exists(select 1 from json_each(v.snapshot,'$.ingredients') i where instr(normalize_sl(json_extract(i.value,'$.name')),normalize_sl(${ingredient}))>0)`);
      if(maxTime)filters.push(sql`json_type(v.snapshot,'$.prepMinutes') in ('integer','real') and json_type(v.snapshot,'$.cookMinutes') in ('integer','real') and json_extract(v.snapshot,'$.prepMinutes')+json_extract(v.snapshot,'$.cookMinutes')<=${Number(maxTime)}`);
      if(category)filters.push(sql`exists(select 1 from publication_categories pc join global_categories c on c.id=pc.category_id where pc.publication_id=p.id and c.active=1 and c.key=${category})`);
      const conditions=sql.join(filters,sql` and `);
      const count=db.get(sql`select count(*) as count from recipe_publications p join publication_translations v on v.publication_id=p.id where ${conditions}`).count;
      const pages=Math.max(1,Math.ceil(count/size)),page=Math.max(1,Math.min(pages,Number.parseInt(query.page)||1));
      const order=sort==='alpha'?sql`normalize_sl(json_extract(v.snapshot,'$.title')),p.id desc`:sql`coalesce(v.reviewed_at,v.created_at) desc,p.id desc`;
      const rows=db.all(sql`select p.id,v.snapshot,v.created_at,v.reviewed_at from recipe_publications p join publication_translations v on v.publication_id=p.id where ${conditions} order by ${order} limit ${size} offset ${(page-1)*size}`);
      const availableCategories=db.all(sql`select distinct c.id,c.key,n.name from global_categories c join global_category_names n on n.category_id=c.id join publication_categories pc on pc.category_id=c.id join publication_translations v on v.publication_id=pc.publication_id where c.active=1 and n.language=${language} and ${where(language)} order by n.name,c.id`);
      return {recipes:rows.map(row=>project(row,language,user)),count,pages,page,categories:availableCategories,query:{q,ingredient,maxTime,category,sort,favorite}};
    },
    versions(id) {
      return db.all(sql`select p.id,v.language,v.snapshot,v.reviewed_at,v.created_at from recipe_publications p join publication_translations v on v.publication_id=p.id where p.id=${id} and v.status='approved' and v.complete=1 order by v.language`).filter(row=>snapshotComplete(JSON.parse(row.snapshot))).map(row=>({language:row.language,href:publicRecipePath(row.id,JSON.parse(row.snapshot).title),updatedAt:row.reviewed_at||row.created_at}));
    },
    indexable() {
      return db.all(sql`select p.id,v.language,v.snapshot,v.reviewed_at,v.created_at from recipe_publications p join publication_translations v on v.publication_id=p.id where v.status='approved' and v.complete=1 order by p.id,v.language`).filter(row=>snapshotComplete(JSON.parse(row.snapshot))).map(row=>({id:row.id,language:row.language,href:publicRecipePath(row.id,JSON.parse(row.snapshot).title),updatedAt:row.reviewed_at||row.created_at}));
    },
    image(id,index,language,small=false) {
      if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(index)||index<0)return unavailable();
      const row=db.get(sql`select v.snapshot from publication_translations v where v.publication_id=${id} and ${where(language)}`);
      if(!row)return unavailable();const value=JSON.parse(row.snapshot);if(!snapshotComplete(value))return unavailable();
      const image=value.images?.[index];if(!validPublicationImage(image))return unavailable();return small?image.thumbnail:image.filename;
    },
    canReview(id,user) {
      if(!user)return false;
      return Boolean(db.get(sql`select 1 from recipe_publications p where p.id=${id} and (${Number(Boolean(user.isModerator||user.isSuperAdmin))}=1 or (p.submitted_by=${user.id} and json_extract(p.snapshot,'$.suggestion')=1) or (p.household_id=${user.householdId} and exists(select 1 from household_members m where m.household_id=p.household_id and m.user_id=${user.id})))`));
    },
  };
}
