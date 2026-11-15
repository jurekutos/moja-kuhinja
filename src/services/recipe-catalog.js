import { tr } from '../i18n/index.js';
import { publicVersion, publicSnapshot, privateVersion } from './content-visibility.js';
import { sql } from 'drizzle-orm';
import * as t from '../db/schema.js';
import { normalized } from './recipes.js';

export function recipeCatalog(db, recipes) {
  return {
    list(user, query = {}, { publishedOnly = false } = {}) {
      const language=user.language || 'sl';
      const localizedTitle=sql`coalesce((select title from recipe_translations where id=(${privateVersion(t.recipes.id,language)})), ${t.recipes.title})`;
      const snapshot=sql`(${publicSnapshot(t.publications.id,language)})`;
      const view = ['all', 'public'].includes(query.view) ? query.view : 'workspace';
      const term = typeof query.q === 'string' ? normalized(query.q).slice(0, 160) : '';
      const ingredient = typeof query.ingredient === 'string' ? normalized(query.ingredient).slice(0, 150) : '';
      let category = typeof query.category === 'string' ? query.category : '';
      // Preserve existing category-ID bookmarks without accepting another workspace's catalog IDs.
      if (/^\d+$/.test(category)) {
        const match = db.get(sql`select ${t.categories.normalizedName} as name from ${t.categories} where ${t.categories.id} = ${category} and ${t.categories.householdId} = ${user.householdId}`);
        category = match ? `name:${match.name}` : 'name:__unavailable_category__';
      }
      const categoryName = normalized(category.startsWith('name:') ? category.slice(5) : category);
      const privateFilters = [sql`${t.recipes.householdId} = ${user.householdId}`];
      if (publishedOnly) privateFilters.push(sql`${t.recipes.status} = 'published'`);
      const publicFilters = [sql`exists(${publicVersion(t.publications.id,language)})`];
      const author = typeof query.author === 'string' && /^[1-9]\d*$/.test(query.author) && Number.isSafeInteger(Number(query.author)) ? Number(query.author) : null;
      let authorName = '';
      if (author) {
        privateFilters.push(sql`${t.recipes.createdBy} = ${author}`);
        publicFilters.push(sql`${t.publications.submittedBy} = ${author}`);
        const match = db.get(sql`select name from ${t.users} where id=${author} and (
          exists(select 1 from ${t.recipes} where created_by=${author} and household_id=${user.householdId})
          or exists(select 1 from ${t.publications} where submitted_by=${author} and exists(${publicVersion(t.publications.id,language)})))`);
        authorName = match?.name || tr("recipes:s2d2c82bee952");
      }
      if (term) {
        privateFilters.push(sql`instr(normalize_sl(${localizedTitle}), ${term}) > 0`);
        publicFilters.push(sql`instr(normalize_sl(json_extract(${snapshot}, '$.title')), ${term}) > 0`);
      }
      if (ingredient) {
        privateFilters.push(sql`exists (select 1 from ${t.recipeIngredients} where ${t.recipeIngredients.recipeId} = ${t.recipes.id} and instr(normalize_sl(coalesce((select name from translated_ingredients where ingredient_id=${t.recipeIngredients.id} and translation_id=(${privateVersion(t.recipes.id,language)})),${t.recipeIngredients.name})), ${ingredient}) > 0)`);
        publicFilters.push(sql`exists (select 1 from json_each(${snapshot}, '$.ingredients') i where instr(normalize_sl(json_extract(i.value, '$.name')), ${ingredient}) > 0)`);
      }
      if (categoryName) {
        privateFilters.push(sql`exists (select 1 from ${t.recipeCategories} inner join ${t.categories} on ${t.categories.id} = ${t.recipeCategories.categoryId} where ${t.recipeCategories.recipeId} = ${t.recipes.id} and ${t.categories.normalizedName} = ${categoryName})`);
        publicFilters.push(sql`exists(select 1 from publication_categories pc join global_category_names gn on gn.category_id=pc.category_id join global_categories gc on gc.id=pc.category_id where pc.publication_id=${t.publications.id} and gn.language=${language} and gc.active=1 and normalize_sl(gn.name)=${categoryName})`);
      }
      if (query.favorite === '1') {
        privateFilters.push(sql`exists (select 1 from ${t.favorites} where ${t.favorites.recipeId} = ${t.recipes.id} and ${t.favorites.userId} = ${user.id})`);
        publicFilters.push(sql`exists (select 1 from ${t.communityFavorites} where ${t.communityFavorites.publicationId} = ${t.publications.id} and ${t.communityFavorites.userId} = ${user.id})`);
      }
      const privateRows = sql`select 'workspace' as kind, ${t.recipes.id} as id, ${localizedTitle} as title, ${t.recipes.createdAt} as created from ${t.recipes} where ${sql.join(privateFilters, sql` and `)}`;
      // Prefer the matching workspace original in the combined collection. Apply
      // this before counting/pagination; public-only browsing remains independent.
      if (view === 'all') publicFilters.push(sql`not exists (select 1 from (${privateRows}) workspace_original where workspace_original.id=${t.publications.recipeId})`);
      const publicRows = sql`select 'public' as kind, ${t.publications.id} as id, json_extract(${snapshot}, '$.title') as title, ${t.publications.createdAt} as created from ${t.publications} where ${sql.join(publicFilters, sql` and `)}`;
      const union = view === 'all' ? sql`${privateRows} union all ${publicRows}` : view === 'public' ? publicRows : privateRows;
      const count = db.get(sql`select count(*) as count from (${union})`).count;
      const pages = Math.max(1, Math.ceil(count / 24));
      const page = Math.max(1, Math.min(pages, Number.parseInt(query.page) || 1));
      const order = query.sort === 'alpha' ? sql`normalize_sl(title) asc, kind asc, id desc` : sql`created desc, kind asc, id desc`;
      const rows = db.all(sql`select * from (${union}) order by ${order} limit 24 offset ${(page - 1) * 24}`);
      const items = rows.map(row => {
        if (row.kind === 'workspace') {
          const recipe=recipes.get(row.id, user.householdId, user.id,language);
          const publication=view==='all' ? db.get(sql`select p.id from recipe_publications p where p.recipe_id=${row.id} and exists(${publicVersion(sql`p.id`,language)}) order by p.created_at desc,p.id desc limit 1`) : null;
          return {...recipe,publicPublicationId:publication?.id || null};
        }
        const publication = db.get(sql`select ${snapshot} as snapshot from ${t.publications} where ${t.publications.id} = ${row.id} and exists(${publicVersion(t.publications.id,language)})`);
        const favorite = !!db.get(sql`select 1 from ${t.communityFavorites} where ${t.communityFavorites.publicationId} = ${row.id} and ${t.communityFavorites.userId} = ${user.id}`);
        return { ...JSON.parse(publication.snapshot), id: row.id, communityId: row.id, status: 'approved', favorite };
      });
      const privateCategories = sql`select ${t.categories.name} as name from ${t.categories} where ${t.categories.householdId} = ${user.householdId}`;
      const publicCategories = sql`select gn.name from global_category_names gn join global_categories gc on gc.id=gn.category_id join publication_categories pc on pc.category_id=gc.id join recipe_publications p on p.id=pc.publication_id where gc.active=1 and gn.language=${language} and exists(${publicVersion(sql`p.id`,language)})`;
      const categoryUnion = view === 'all' ? sql`${privateCategories} union all ${publicCategories}` : view === 'public' ? publicCategories : privateCategories;
      const categories = db.all(sql`select min(name) as name, normalize_sl(name) as key from (${categoryUnion}) group by normalize_sl(name) order by normalize_sl(name)`).map(c => ({ id: `name:${c.key}`, name: c.name }));
      return { recipes: items, count, pages, page, categories, view, authorName, query: { ...query, author: author ? String(author) : '', category: categoryName ? `name:${categoryName}` : '', view } };
    },
  };
}
