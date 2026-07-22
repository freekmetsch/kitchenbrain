import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import Database from 'better-sqlite3';

type RecipeRow = {
	slug: string;
	title: string;
	language: string;
	notes: string | null;
	source_url: string | null;
	servings: number | null;
	content_revision: number;
	ingredients: string;
	directions: string;
};

type ProbeOptions = {
	directory: string;
	databasePath: string;
	port: number;
};

function readArg(name: string): string {
	const prefix = `--${name}=`;
	const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
	if (!value) throw new Error(`Missing ${prefix}<path>`);
	return path.resolve(value);
}

async function waitForHealth(port: number): Promise<number> {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
			if (response.status === 200) return response.status;
		} catch {
			// The adapter has not started listening yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`Image on port ${port} did not become healthy`);
}

function startImage({ directory, databasePath, port }: ProbeOptions): ChildProcess {
	return spawn(process.execPath, ['build'], {
		cwd: directory,
		env: {
			...process.env,
			DATABASE_URL: databasePath,
			HOUSEHOLD_USERS: 'codex:probe',
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: `http://127.0.0.1:${port}`
		},
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true
	});
}

async function actionStatus(response: Response): Promise<number> {
	if (response.status === 303) return 303;
	if (response.status === 200) {
		const payload = (await response.clone().json()) as { type?: string; status?: number };
		if (payload.type === 'redirect' && payload.status === 303) return 303;
	}
	throw new Error(
		`Action returned ${response.status}; location=${response.headers.get('location')}; body=${(
			await response.text()
		).slice(0, 500)}`
	);
}

async function stopImage(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null) return;
	child.kill();
	await Promise.race([
		new Promise<void>((resolve) => child.once('exit', () => resolve())),
		new Promise<void>((resolve) => setTimeout(resolve, 2_000))
	]);
	if (child.exitCode === null) child.kill('SIGKILL');
}

function firstRecipe(databasePath: string): RecipeRow {
	const sqlite = new Database(databasePath, { readonly: true });
	try {
		return sqlite
			.prepare(
				`SELECT slug, title, language, notes, source_url, servings,
					content_revision, ingredients, directions
				 FROM recipes ORDER BY id LIMIT 1`
			)
			.get() as RecipeRow;
	} finally {
		sqlite.close();
	}
}

function recipeAfterSave(databasePath: string): Pick<RecipeRow, 'content_revision' | 'ingredients' | 'notes'> {
	const sqlite = new Database(databasePath, { readonly: true });
	try {
		return sqlite
			.prepare('SELECT content_revision, ingredients, notes FROM recipes ORDER BY id LIMIT 1')
			.get() as Pick<RecipeRow, 'content_revision' | 'ingredients' | 'notes'>;
	} finally {
		sqlite.close();
	}
}

async function proveReleaseAEdit(options: ProbeOptions) {
	const image = startImage(options);
	let stderr = '';
	image.stderr?.on('data', (chunk) => (stderr += String(chunk)));
	try {
		const healthStatus = await waitForHealth(options.port);
		const loginBody = new FormData();
		loginBody.set('username', 'codex');
		loginBody.set('password', 'probe');
		const login = await fetch(`http://127.0.0.1:${options.port}/login`, {
			method: 'POST',
			body: loginBody,
			headers: { origin: `http://127.0.0.1:${options.port}` },
			redirect: 'manual'
		});
		const loginStatus = await actionStatus(login);
		const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
		if (!cookie) throw new Error('Release A login did not set a session cookie');

		const recipe = firstRecipe(options.databasePath);
		const beforeIds = (JSON.parse(recipe.ingredients) as Array<{ id?: string }>).map((ingredient) => ingredient.id);
		const notes = `${recipe.notes?.replace(/\r?\nrollback probe$/, '') ?? ''}\nrollback probe`;
		const editBody = new FormData();
		editBody.set('title', recipe.title);
		editBody.set('language', recipe.language);
		editBody.set('notes', notes);
		editBody.set('sourceUrl', recipe.source_url ?? '');
		editBody.set('servings', recipe.servings === null ? '' : String(recipe.servings));
		editBody.set('contentRevision', String(recipe.content_revision));
		editBody.set('acceptStructureDraft', '0');
		editBody.set('ingredients', recipe.ingredients);
		editBody.set('directions', recipe.directions);
		const save = await fetch(`http://127.0.0.1:${options.port}/recipes/${recipe.slug}/edit`, {
			method: 'POST',
			body: editBody,
			headers: { cookie, origin: `http://127.0.0.1:${options.port}` },
			redirect: 'manual'
		});
		const saveStatus = await actionStatus(save);

		const after = recipeAfterSave(options.databasePath);
		const afterIds = (JSON.parse(after.ingredients) as Array<{ id?: string }>).map((ingredient) => ingredient.id);
		const normalizeNewlines = (value: string | null) => value?.replace(/\r\n/g, '\n') ?? null;
		return {
			healthStatus,
			loginStatus,
			saveStatus,
			recipeSlug: recipe.slug,
			revisionBefore: recipe.content_revision,
			revisionAfter: after.content_revision,
			ingredientCount: beforeIds.length,
			ingredientIdsPreserved: JSON.stringify(beforeIds) === JSON.stringify(afterIds),
			notesWritePreserved: normalizeNewlines(after.notes) === normalizeNewlines(notes)
		};
	} catch (error) {
		throw new Error(`${error instanceof Error ? error.message : String(error)}\n${stderr}`);
	} finally {
		await stopImage(image);
	}
}

async function provePreMigrationRestore(options: ProbeOptions) {
	const image = startImage(options);
	let stderr = '';
	image.stderr?.on('data', (chunk) => (stderr += String(chunk)));
	try {
		return { healthStatus: await waitForHealth(options.port) };
	} catch (error) {
		throw new Error(`${error instanceof Error ? error.message : String(error)}\n${stderr}`);
	} finally {
		await stopImage(image);
	}
}

const srd0Directory = readArg('srd0-dir');
const preSrd0Directory = readArg('pre-srd0-dir');
const migratedDatabase = readArg('migrated-db');
const restoredDatabase = readArg('restored-db');
const outputPath = readArg('out');

const evidence = {
	releaseAImage: {
		commit: '74b7f13',
		...(await proveReleaseAEdit({ directory: srd0Directory, databasePath: migratedDatabase, port: 5181 }))
	},
	preReleaseAImage: {
		commit: '907ba22',
		...(await provePreMigrationRestore({ directory: preSrd0Directory, databasePath: restoredDatabase, port: 5182 }))
	}
};

if (!evidence.releaseAImage.ingredientIdsPreserved || !evidence.releaseAImage.notesWritePreserved) {
	throw new Error('Release A write did not preserve the migrated recipe fields');
}
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence));
