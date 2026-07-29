import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

type StaticImport = {
	module: string;
	importedNames: string[];
	hasRuntimeBinding: boolean;
};

const srcRoot = path.resolve('src');
const serverRoot = path.join(srcRoot, 'lib', 'server');
const routesRoot = path.join(srcRoot, 'routes');

function toRepoPath(file: string): string {
	return path.relative(srcRoot, file).replaceAll(path.sep, '/');
}

function productionSourceFiles(root: string): string[] {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.[cm]?[jt]s$/.test(entry.name))
		.map((entry) => path.join(entry.parentPath, entry.name))
		.filter((file) => !/\.(?:test|spec)\.[cm]?[jt]s$|\.d\.[cm]?ts$/.test(file))
		.sort();
}

function parseSource(file: string): ts.SourceFile {
	const scriptKind = /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
	return ts.createSourceFile(
		file,
		readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		scriptKind
	);
}

function staticImports(file: string): StaticImport[] {
	return parseSource(file).statements.flatMap((statement) => {
		if (ts.isImportEqualsDeclaration(statement)) {
			const reference = statement.moduleReference;
			if (
				!ts.isExternalModuleReference(reference) ||
				!reference.expression ||
				!ts.isStringLiteral(reference.expression)
			) {
				return [];
			}
			return [
				{
					module: reference.expression.text,
					importedNames: ['*'],
					hasRuntimeBinding: !statement.isTypeOnly
				}
			];
		}

		if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
			if (!ts.isStringLiteral(statement.moduleSpecifier)) return [];
			const importedNames =
				statement.exportClause && ts.isNamedExports(statement.exportClause)
					? statement.exportClause.elements.map(
							(element) => element.propertyName?.text ?? element.name.text
						)
					: ['*'];
			const hasRuntimeBinding =
				!statement.isTypeOnly &&
				(!statement.exportClause ||
					ts.isNamespaceExport(statement.exportClause) ||
					statement.exportClause.elements.some((element) => !element.isTypeOnly));
			return [
				{
					module: statement.moduleSpecifier.text,
					importedNames,
					hasRuntimeBinding
				}
			];
		}

		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
			return [];
		}

		const clause = statement.importClause;
		const importedNames: string[] = [];
		if (clause?.name) importedNames.push('default');
		if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
			importedNames.push('*');
		}
		if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
			importedNames.push(
				...clause.namedBindings.elements.map(
					(element) => element.propertyName?.text ?? element.name.text
				)
			);
		}

		const hasRuntimeBinding =
			!clause ||
			(!clause.isTypeOnly &&
				(Boolean(clause.name) ||
					(clause.namedBindings
						? ts.isNamespaceImport(clause.namedBindings) ||
							clause.namedBindings.elements.some((element) => !element.isTypeOnly)
						: false)));

		return [
			{
				module: statement.moduleSpecifier.text,
				importedNames,
				hasRuntimeBinding
			}
		];
	});
}

function moduleReferences(file: string): string[] {
	const modules = new Set(staticImports(file).map(({ module }) => module));
	function visit(node: ts.Node): void {
		if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
			node.arguments.length >= 1 &&
			ts.isStringLiteral(node.arguments[0])
		) {
			modules.add(node.arguments[0].text);
		}
		ts.forEachChild(node, visit);
	}
	visit(parseSource(file));
	return [...modules];
}

function importsDirectDatabaseModule(file: string): boolean {
	return moduleReferences(file).some((module) =>
		/(?:^|\/)db\/(?:index|schema)(?:\.[cm]?[jt]s)?$/.test(module)
	);
}

function importsDatabaseSchema(file: string): boolean {
	return moduleReferences(file).some((module) =>
		/(?:^|\/)db\/schema(?:\.[cm]?[jt]s)?$/.test(module)
	);
}

function runtimeModuleImports(file: string): string[] {
	const modules = new Set(
		staticImports(file)
			.filter(({ hasRuntimeBinding }) => hasRuntimeBinding)
			.map(({ module }) => module)
	);
	function visit(node: ts.Node): void {
		if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
			node.arguments.length >= 1 &&
			ts.isStringLiteral(node.arguments[0])
		) {
			modules.add(node.arguments[0].text);
		}
		ts.forEachChild(node, visit);
	}
	visit(parseSource(file));
	return [...modules];
}

describe('server architecture boundaries', () => {
	it('keeps Assistant home loading request-driven with no Butler candidate service', () => {
		const pageServer = readFileSync(path.join(routesRoot, '+page.server.ts'), 'utf8');
		const pageView = readFileSync(path.join(routesRoot, '+page.svelte'), 'utf8');
		const butlerModules = productionSourceFiles(serverRoot)
			.map(toRepoPath)
			.filter((file) => file.startsWith('lib/server/butler/'));

		expect(pageServer).not.toMatch(/Butler|butler|household snapshot/i);
		expect(pageView).not.toMatch(/ButlerBrief|data\.brief|data-butler/);
		expect(butlerModules).toEqual([]);
	});

	it('centralizes the Drizzle database and transaction types', () => {
		const filesWithDatabaseType = productionSourceFiles(serverRoot)
			.filter((file) =>
				staticImports(file).some(
					(entry) =>
						entry.module === 'drizzle-orm/better-sqlite3' &&
						entry.importedNames.includes('BetterSQLite3Database')
				)
			)
			.map(toRepoPath);
		const filesDefiningDbOrTx = productionSourceFiles(serverRoot)
			.filter((file) =>
				parseSource(file).statements.some(
					(statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'DbOrTx'
				)
			)
			.map(toRepoPath);

		expect(filesWithDatabaseType).toEqual(['lib/server/db/types.ts']);
		expect(filesDefiningDbOrTx).toEqual(['lib/server/db/types.ts']);
	});

	it('inventories the approved core-route database bypasses', () => {
		const current = productionSourceFiles(routesRoot)
			.filter((file) =>
				/^(?:api\/)?(?:inventory|recipes|meal-plan|meals|shopping)(?:\/|$)/.test(
					path.relative(routesRoot, file).replaceAll(path.sep, '/')
				)
			)
			.filter(importsDirectDatabaseModule)
			.map(toRepoPath);

		expect(current).toEqual([]);
	});

	it('inventories the approved AI-executor database bypasses', () => {
		const current = productionSourceFiles(path.join(serverRoot, 'ai', 'executors'))
			.filter(importsDirectDatabaseModule)
			.map(toRepoPath);

		expect(current).toEqual([]);
	});

	it('keeps the recipe enhancement AI adapter persistence-free', () => {
		const adapter = path.join(serverRoot, 'ai', 'recipe_enhancement.ts');

		expect(importsDirectDatabaseModule(adapter)).toBe(false);
	});

	it('keeps core page-composition workflows on domain read models', () => {
		const workflowRoot = path.join(serverRoot, 'workflows');
		const current = ['inventory-page.ts', 'meal-plan-page.ts', 'recipe-pages.ts']
			.map((file) => path.join(workflowRoot, file))
			.filter(importsDatabaseSchema)
			.map(toRepoPath);

		expect(current).toEqual([]);
	});

	it('keeps migrated write workflows on domain persistence APIs', () => {
		const workflowRoot = path.join(serverRoot, 'workflows');
		const current = [
			'choose-shopping-source.ts',
			'meal-plan.ts',
			'push-shopping-to-ah.ts',
			'reconcile-shopping.ts'
		]
			.map((file) => path.join(workflowRoot, file))
			.filter(importsDatabaseSchema)
			.map(toRepoPath);

		expect(current).toEqual([]);
	});

	it('keeps domain modules independent from sibling domains', () => {
		const domainRoot = path.join(serverRoot, 'domains');
		const violations = productionSourceFiles(domainRoot).flatMap((file) => {
			const owner = path.relative(domainRoot, file).split(path.sep)[0];
			return moduleReferences(file)
				.map((module) => ({
					module,
					target:
						module.match(/^\$lib\/server\/domains\/([^/]+)/)?.[1] ??
						(module.startsWith('.')
							? path
									.relative(domainRoot, path.resolve(path.dirname(file), module))
									.split(path.sep)[0]
							: undefined)
				}))
				.filter(({ target }) => target != null && target !== '..' && target !== owner)
				.map(({ module }) => `${toRepoPath(file)} -> ${module}`);
		});

		expect(violations).toEqual([]);
	});

	it('keeps direct recipe ingredient updates behind the canonical recipe command', () => {
		const violations = productionSourceFiles(serverRoot).flatMap((file) => {
			let writesIngredients = false;
			function visit(node: ts.Node): void {
				if (
					ts.isCallExpression(node) &&
					ts.isPropertyAccessExpression(node.expression) &&
					node.expression.name.text === 'set' &&
					node.arguments.some(
						(argument) =>
							ts.isObjectLiteralExpression(argument) &&
							argument.properties.some(
								(property) =>
									(ts.isPropertyAssignment(property) ||
										ts.isShorthandPropertyAssignment(property)) &&
									property.name?.getText() === 'ingredients'
							)
					)
				) {
					writesIngredients = true;
				}
				ts.forEachChild(node, visit);
			}
			visit(parseSource(file));
			return writesIngredients ? [toRepoPath(file)] : [];
		});

		expect(violations).toEqual([]);
	});

	it('keeps runtime LLM SDK imports behind the AI client seam', () => {
		const runtimeSdkImporters = productionSourceFiles(serverRoot)
			.filter((file) =>
				runtimeModuleImports(file).some((module) =>
					/^(?:@anthropic-ai\/sdk$|openai(?:$|\/)|ai(?:$|\/)|@ai-sdk\/|@openrouter\/)/.test(module)
				)
			)
			.map(toRepoPath);

		expect(runtimeSdkImporters).toEqual(['lib/server/ai/client.ts']);
	});

	it('keeps English recipe display fields out of the AH lookup and write boundary', () => {
		const ahClientFunctions = new Set([
			'addFreetextItems',
			'addProductItems',
			'addProductsToOrder',
			'getActiveOrder',
			'getProductsByIds',
			'searchProducts'
		]);
		const allSourceFiles = [
			...productionSourceFiles(serverRoot),
			...productionSourceFiles(routesRoot)
		];
		const boundaryFiles = allSourceFiles.filter(
			(file) =>
				toRepoPath(file) === 'lib/server/ah/client.ts' ||
				staticImports(file).some(
					(entry) =>
						entry.module === '$lib/server/ah/client' &&
						entry.importedNames.some((name) => ahClientFunctions.has(name))
				)
		);
		const forbiddenFields = new Set([
			'categoryEn',
			'cuisineEn',
			'directionsEn',
			'ingredientsEn',
			'notesEn',
			'titleEn'
		]);
		const violations = boundaryFiles.flatMap((file) => {
			const found = new Set<string>();
			function visit(node: ts.Node): void {
				if (ts.isIdentifier(node) && forbiddenFields.has(node.text)) found.add(node.text);
				ts.forEachChild(node, visit);
			}
			visit(parseSource(file));
			return [...found].map((field) => `${toRepoPath(file)}: ${field}`);
		});

		expect(violations).toEqual([]);
	});

	it('keeps AH basket transport calls behind the shopping push workflow', () => {
		const basketFunctions = new Set([
			'addFreetextItems',
			'addProductItems',
			'addProductsToOrder',
			'getActiveOrder',
			'getProductsByIds'
		]);
		const importers = [...productionSourceFiles(serverRoot), ...productionSourceFiles(routesRoot)]
			.filter((file) =>
				staticImports(file).some(
					(entry) =>
						entry.module === '$lib/server/ah/client' &&
						entry.importedNames.some((name) => basketFunctions.has(name))
				)
			)
			.map(toRepoPath);

		expect(importers).toEqual(['lib/server/workflows/push-shopping-to-ah.ts']);
	});

	it('allows AH product search only through the basket workflow and read-only agent executor', () => {
		const importers = [...productionSourceFiles(serverRoot), ...productionSourceFiles(routesRoot)]
			.filter((file) =>
				staticImports(file).some(
					(entry) =>
						entry.module === '$lib/server/ah/client' &&
						entry.importedNames.includes('searchProducts')
				)
			)
			.map(toRepoPath)
			.sort();

		expect(importers).toEqual([
			'lib/server/ai/executors/ah.ts',
			'lib/server/workflows/push-shopping-to-ah.ts'
		]);
	});
});
