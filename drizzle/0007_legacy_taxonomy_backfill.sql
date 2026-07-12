-- Deterministic legacy taxonomy backfill (P1.6, ADR 0001).
-- Maps known legacy `category` values onto (kind, food_class); every statement
-- is guarded `WHERE kind IS NULL` so the migration is idempotent and never
-- overwrites a value written by the new boundary. Unknown categories stay
-- NULL for the Phase 3 AI pass. No AI here - pure deterministic table.
UPDATE inventory_items SET kind = 'ingredient', food_class = 'meat' WHERE kind IS NULL AND category = 'meat';--> statement-breakpoint
UPDATE inventory_items SET kind = 'ingredient', food_class = 'fish' WHERE kind IS NULL AND category = 'fish';--> statement-breakpoint
UPDATE inventory_items SET kind = 'ingredient', food_class = 'vegetarian' WHERE kind IS NULL AND category = 'vegetarian';--> statement-breakpoint
UPDATE inventory_items SET kind = 'ingredient', food_class = 'vegan' WHERE kind IS NULL AND category = 'vegan';--> statement-breakpoint
UPDATE inventory_items SET kind = 'ingredient', food_class = 'chicken' WHERE kind IS NULL AND category IN ('kip', 'chicken');--> statement-breakpoint
UPDATE inventory_items SET kind = 'ingredient', food_class = 'beef' WHERE kind IS NULL AND category IN ('rund', 'rundvlees', 'beef');--> statement-breakpoint
UPDATE inventory_items SET kind = 'ingredient', food_class = 'pork' WHERE kind IS NULL AND category IN ('varken', 'varkensvlees', 'pork');--> statement-breakpoint
UPDATE inventory_items SET kind = 'processed' WHERE kind IS NULL AND category IN ('kant en klaar', 'kant-en-klaar', 'ready meal', 'ready to eat');--> statement-breakpoint
UPDATE inventory_items SET kind = 'ingredient', food_class = 'other' WHERE kind IS NULL AND category IN ('brood', 'bread', 'other');--> statement-breakpoint
-- Ops-log history backfill: legacy rows get pipeline attribution, an item_id
-- where the stored snapshot resolves to a real item, and their single
-- item_snapshot mapped onto the before/after shape by op_type. Legacy
-- after-only update rows stay display-only (no before_snapshot -> not undoable).
UPDATE inventory_ops_log SET actor = 'pipeline' WHERE actor IS NULL;--> statement-breakpoint
UPDATE inventory_ops_log SET item_id = CAST(json_extract(item_snapshot, '$.item.id') AS INTEGER)
WHERE item_id IS NULL
  AND json_extract(item_snapshot, '$.item.id') IS NOT NULL
  AND EXISTS (SELECT 1 FROM inventory_items i WHERE i.id = CAST(json_extract(item_snapshot, '$.item.id') AS INTEGER));--> statement-breakpoint
UPDATE inventory_ops_log SET item_id = CAST(json_extract(item_snapshot, '$.id') AS INTEGER)
WHERE item_id IS NULL
  AND json_extract(item_snapshot, '$.id') IS NOT NULL
  AND EXISTS (SELECT 1 FROM inventory_items i WHERE i.id = CAST(json_extract(item_snapshot, '$.id') AS INTEGER));--> statement-breakpoint
UPDATE inventory_ops_log SET after_snapshot = COALESCE(json_extract(item_snapshot, '$.item'), item_snapshot)
WHERE after_snapshot IS NULL AND op_type IN ('add', 'update') AND item_snapshot IS NOT NULL;--> statement-breakpoint
UPDATE inventory_ops_log SET before_snapshot = COALESCE(json_extract(item_snapshot, '$.item'), item_snapshot)
WHERE before_snapshot IS NULL AND op_type = 'remove' AND item_snapshot IS NOT NULL;
