// Actor vocabulary shared by client and server: the reserved machine actors
// for inventory_ops_log attribution (any other actor value is a username from
// the users table) and the username display derivation.
export const MACHINE_ACTORS = ['ai', 'pipeline'] as const;
export type MachineActor = (typeof MACHINE_ACTORS)[number];

/** Username → display label ("alice" → "Alice"). */
export function displayName(username: string): string {
	return username.charAt(0).toUpperCase() + username.slice(1);
}
