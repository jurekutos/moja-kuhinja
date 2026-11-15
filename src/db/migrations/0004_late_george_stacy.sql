-- Add the preference in place, preserving every household and its dependent records.
ALTER TABLE `households` ADD COLUMN `planner_meals` text NOT NULL DEFAULT 'both'
  CONSTRAINT `household_planner_meals_valid` CHECK (`planner_meals` in ('both', 'lunch', 'dinner'));
