import { and, eq, asc } from 'drizzle-orm';
import { comments, recipes, users } from '../db/schema.js';
import { parseComment } from '../validators/comment.js';

export function commentService(db) {
  function requireRecipe(recipeId, user) {
    const recipe = db.select({ id: recipes.id }).from(recipes).where(and(eq(recipes.id, recipeId), eq(recipes.householdId, user.householdId))).get();
    if (!recipe) throw Object.assign(new Error('Recept ne obstaja ali do njega nimate dostopa.'), { status: 404 });
  }
  return {
    list(recipeId, user) {
      requireRecipe(recipeId, user);
      return db.select({ id: comments.id, userId: comments.userId, author: users.name, body: comments.body, createdAt: comments.createdAt }).from(comments).innerJoin(users, eq(users.id, comments.userId)).where(eq(comments.recipeId, recipeId)).orderBy(asc(comments.createdAt), asc(comments.id)).all();
    },
    add(recipeId, user, body) {
      requireRecipe(recipeId, user);
      const parsed = parseComment(body);
      if (!parsed.success) throw Object.assign(new Error(parsed.error), { status: 422 });
      return db.insert(comments).values({ recipeId, userId: user.id, body: parsed.data, createdAt: new Date().toISOString() }).returning({ id: comments.id }).get().id;
    },
    remove(recipeId, commentId, user) {
      requireRecipe(recipeId, user);
      const deleted = db.delete(comments).where(and(eq(comments.id, commentId), eq(comments.recipeId, recipeId), eq(comments.userId, user.id))).returning({ id: comments.id }).get();
      if (!deleted) throw Object.assign(new Error('Komentar ne obstaja ali ga ne morete izbrisati.'), { status: 404 });
    },
  };
}
