import { sql } from 'drizzle-orm';
import * as t from '../db/schema.js';
import { normalized } from './recipes.js';

export function recipeCatalog(db, recipes) {
  return {
    list(user, query = {}, { publishedOnly = false } = {}) {
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
      const publicFilters = [sql`${t.publications.status} = 'approved'`];
      if (term) {
        privateFilters.push(sql`instr(normalize_sl(${t.recipes.title}), ${term}) > 0`);
        publicFilters.push(sql`instr(normalize_sl(json_extract(${t.publications.snapshot}, '$.title')), ${term}) > 0`);
      }
      if (ingredient) {
        privateFilters.push(sql`exists (select 1 from ${t.recipeIngredients} where ${t.recipeIngredients.recipeId} = ${t.recipes.id} and instr(normalize_sl(${t.recipeIngredients.name}), ${ingredient}) > 0)`);
        publicFilters.push(sql`exists (select 1 from json_each(${t.publications.snapshot}, '$.ingredients') i where instr(normalize_sl(json_extract(i.value, '$.name')), ${ingredient}) > 0)`);
      }
      if (categoryName) {
        privateFilters.push(sql`exists (select 1 from ${t.recipeCategories} inner join ${t.categories} on ${t.categories.id} = ${t.recipeCategories.categoryId} where ${t.recipeCategories.recipeId} = ${t.recipes.id} and ${t.categories.normalizedName} = ${categoryName})`);
        publicFilters.push(sql`exists (select 1 from json_each(${t.publications.snapshot}, '$.categories') c where normalize_sl(c.value) = ${categoryName})`);
      }
      if (query.favorite === '1') {
        privateFilters.push(sql`exists (select 1 from ${t.favorites} where ${t.favorites.recipeId} = ${t.recipes.id} and ${t.favorites.userId} = ${user.id})`);
        publicFilters.push(sql`exists (select 1 from ${t.communityFavorites} where ${t.communityFavorites.publicationId} = ${t.publications.id} and ${t.communityFavorites.userId} = ${user.id})`);
      }
      const privateRows = sql`select 'workspace' as kind, ${t.recipes.id} as id, ${t.recipes.title} as title, ${t.recipes.createdAt} as created from ${t.recipes} where ${sql.join(privateFilters, sql` and `)}`;
      const publicRows = sql`select 'public' as kind, ${t.publications.id} as id, json_extract(${t.publications.snapshot}, '$.title') as title, ${t.publications.createdAt} as created from ${t.publications} where ${sql.join(publicFilters, sql` and `)}`;
      const union = view === 'all' ? sql`${privateRows} union all ${publicRows}` : view === 'public' ? publicRows : privateRows;
      const count = db.get(sql`select count(*) as count from (${union})`).count;
      const pages = Math.max(1, Math.ceil(count / 24));
      const page = Math.max(1, Math.min(pages, Number.parseInt(query.page) || 1));
      const order = query.sort === 'alpha' ? sql`normalize_sl(title) asc, kind asc, id desc` : sql`created desc, kind asc, id desc`;
      const rows = db.all(sql`select * from (${union}) order by ${order} limit 24 offset ${(page - 1) * 24}`);
      const items = rows.map(row => {
        if (row.kind === 'workspace') return recipes.get(row.id, user.householdId, user.id);
        const publication = db.get(sql`select ${t.publications.snapshot} as snapshot from ${t.publications} where ${t.publications.id} = ${row.id} and ${t.publications.status} = 'approved'`);
        const favorite = !!db.get(sql`select 1 from ${t.communityFavorites} where ${t.communityFavorites.publicationId} = ${row.id} and ${t.communityFavorites.userId} = ${user.id}`);
        return { ...JSON.parse(publication.snapshot), id: row.id, communityId: row.id, status: 'approved', favorite };
      });
      const privateCategories = sql`select ${t.categories.name} as name from ${t.categories} where ${t.categories.householdId} = ${user.householdId}`;
      const publicCategories = sql`select c.value as name from ${t.publications}, json_each(${t.publications.snapshot}, '$.categories') c where ${t.publications.status} = 'approved'`;
      const categoryUnion = view === 'all' ? sql`${privateCategories} union all ${publicCategories}` : view === 'public' ? publicCategories : privateCategories;
      const categories = db.all(sql`select min(name) as name, normalize_sl(name) as key from (${categoryUnion}) group by normalize_sl(name) order by normalize_sl(name)`).map(c => ({ id: `name:${c.key}`, name: c.name }));
      return { recipes: items, count, pages, page, categories, view, query: { ...query, category: categoryName ? `name:${categoryName}` : '', view } };
    },
  };
}
