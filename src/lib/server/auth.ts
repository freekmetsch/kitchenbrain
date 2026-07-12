import { db } from './db/index';
import { users, sessions } from './db/schema';
import { eq, and, gt } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function validateCredentials(username: string, password: string) {
	const user = db.select().from(users).where(eq(users.username, username)).get();
	if (!user) return null;
	const valid = await bcrypt.compare(password, user.passwordHash);
	if (!valid) return null;
	return { id: user.id, username: user.username };
}

export function createSession(userId: number): string {
	const id = crypto.randomBytes(32).toString('hex');
	const now = new Date();
	const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
	db.insert(sessions).values({ id, userId, expiresAt, createdAt: now }).run();
	return id;
}

export function validateSession(sessionId: string): { id: number; username: string } | null {
	return (
		db
			.select({ id: users.id, username: users.username })
			.from(sessions)
			.innerJoin(users, eq(users.id, sessions.userId))
			.where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
			.get() ?? null
	);
}

export function deleteSession(sessionId: string): void {
	db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}
