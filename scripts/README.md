# scripts/

`backfill_recipe_translations.ts` is the only script wired into `package.json` (`npm run recipes:backfill[:dry]`) — it's an ongoing tool, safe to run any time.

The rest are one-shot maintainer tools from past migrations. They're kept for their documentation value (each records a real historical migration's shape and rollback plan) and in case a similar backfill is ever needed again, but they are **not** part of the regular dev workflow — run them manually with `tsx` / `npx tsx` if you need them, not via an npm script:

- `audit_inventory.ts` — read-only audit for the V1→V2 unit-in-name migration (v2-ux-overhaul Phase 2).
- `audit_taxonomy.ts` — read-only audit for the kind/food_class taxonomy migration (inventory-intelligence P1.6).
- `backfill_inventory_units.ts` — the write-side of the unit-in-name migration (dry-run by default, snapshots before `--apply`).
- `backfill_cook_log.ts` — backfills `cook_log` rows for meals marked cooked before that table existed (dry-run by default).

Each file's header comment has full usage, flags, and rollback notes.
