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
				...clause.namedBindings.elements.map((element) => element.propertyName?.text ?? element.name.text)
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

		return [{ module: statement.moduleSpecifier.text, importedNames, hasRuntimeBinding }];
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

const APPROVED_CORE_ROUTE_BYPASSES = [
	'routes/api/meal-plan/[id]/+server.ts',
	'routes/api/meal-plan/+server.ts',
	'routes/api/meals/[slug]/+server.ts',
	'routes/api/meals/+server.ts',
	'routes/api/recipes/[slug]/+server.ts',
	'routes/api/recipes/[slug]/consume/+server.ts',
	'routes/api/recipes/[slug]/cook/+server.ts',
	'routes/api/recipes/[slug]/enhance/+server.ts',
	'routes/api/recipes/[slug]/freeze/+server.ts',
	'routes/api/recipes/[slug]/image/+server.ts',
	'routes/api/recipes/[slug]/ingredient-swap/+server.ts',
	'routes/api/recipes/scrape/+server.ts',
	'routes/api/shopping/+server.ts',
	'routes/api/shopping/ah-favorite/+server.ts',
	'routes/api/shopping/ah-preview/+server.ts',
	'routes/api/shopping/ah-push/+server.ts',
	'routes/api/shopping/recipe-choice/+server.ts',
	'routes/meal-plan/+page.server.ts',
	'routes/recipes/[slug]/+page.server.ts',
	'routes/recipes/[slug]/edit/+page.server.ts',
	'routes/recipes/+page.server.ts',
	'routes/shopping/+page.server.ts'
] as const;

const APPROVED_AI_EXECUTOR_BYPASSES = [
	'lib/server/ai/executors/meal_plan.ts',
	'lib/server/ai/executors/recipes.ts',
	'lib/server/ai/executors/shopping.ts'
] as const;

describe('server architecture boundaries', () => {
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

		expect(current).toEqual([...APPROVED_CORE_ROUTE_BYPASSES].sort());
	});

	it('inventories the approved AI-executor database bypasses', () => {
		const current = productionSourceFiles(path.join(serverRoot, 'ai', 'executors'))
			.filter(importsDirectDatabaseModule)
			.map(toRepoPath);

		expect(current).toEqual([...APPROVED_AI_EXECUTOR_BYPASSES].sort());
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
});
