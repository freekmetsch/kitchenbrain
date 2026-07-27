import type { Db } from '$lib/server/db/types';
import type { WritePrecondition } from '$lib/server/domains/inventory/commands';

export type { Db as DB } from '$lib/server/db/types';

// The optional precondition is only supplied by the approval path (P5.3);
// the add/remove executors forward it to the inventory boundary, which
// revalidates it in-transaction. Read/meal/recipe executors ignore it.
export type ExecutorFn = (
	raw: unknown,
	db: Db,
	userId: number,
	precondition?: WritePrecondition
) => Promise<unknown>;
