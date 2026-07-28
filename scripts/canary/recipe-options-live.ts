import type Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type FormCategory = 'block' | 'fresh_grated' | 'powder' | 'flakes';

type CatalogProduct = {
	internalId: string;
	formCategory: FormCategory;
	name: string;
	packageSize: string;
	price: number;
};

type Scenario = {
	name: string;
	prompt: string;
	order: number[];
};

type ScenarioReport = {
	name: string;
	status: 'passed' | 'failed';
	failureCode?: string;
	providerCalls: number;
	uniqueQueries: number;
	initialFormCategories: FormCategory[];
	finalCharacters: number;
	modelFinalCharacters: number;
	fallbackApplied: boolean;
};

type CanaryReport = {
	status: 'passed' | 'failed';
	model: string;
	totalProviderCalls: number;
	totalTokens: number;
	reportedCostUsdCents: number | null;
	scenarios: ScenarioReport[];
	failureCode?: string;
};

const REPORT_PATH = join(process.cwd(), '.test-data', 'recipe-options-live-canary.json');
const MAX_PROVIDER_CALLS = 40;
const MAX_ITERATIONS_PER_SCENARIO = 8;
const MAX_UNIQUE_QUERIES_PER_SCENARIO = 15;
const MAX_TOTAL_TOKENS = 300_000;
const MAX_REPORTED_COST_USD = 1;
const MAX_OUTPUT_TOKENS_PER_CALL = 4_000;
const PROVIDER_TIMEOUT_MS = 60_000;
const RECIPE_SLUG = 'canary-parmesan-pasta';
const INGREDIENT_ID = 'ingredient-parmesan';

const CATALOG: CatalogProduct[] = [
	{
		internalId: 'whole-200',
		formCategory: 'block',
		name: 'AH Parmigiano Reggiano stuk',
		packageSize: '200 g',
		price: 4.99
	},
	{
		internalId: 'whole-150',
		formCategory: 'block',
		name: 'AH Parmigiano Reggiano punt',
		packageSize: '150 g',
		price: 4.29
	},
	{
		internalId: 'whole-250',
		formCategory: 'block',
		name: 'AH Parmezaanse kaas blok',
		packageSize: '250 g',
		price: 5.79
	},
	{
		internalId: 'grated-100',
		formCategory: 'fresh_grated',
		name: 'AH Parmigiano Reggiano vers geraspt',
		packageSize: '100 g',
		price: 3.49
	},
	{
		internalId: 'powder-80',
		formCategory: 'powder',
		name: 'AH Parmezaanse kaas strooipoeder',
		packageSize: '80 g',
		price: 2.19
	},
	{
		internalId: 'powder-100',
		formCategory: 'powder',
		name: 'AH Parmezaanse kaas fijn poeder',
		packageSize: '100 g',
		price: 2.59
	},
	{
		internalId: 'flakes-90',
		formCategory: 'flakes',
		name: 'AH Parmigiano Reggiano flakes',
		packageSize: '90 g',
		price: 3.79
	}
];

const SCENARIOS: Scenario[] = [
	{
		name: 'balanced',
		prompt:
			'Review the saved Canary Parmesan Pasta. I do not know which form of Parmezaanse kaas I prefer. Offer exactly three meaningfully different current AH product forms in the review card, and do not change the recipe.',
		order: [0, 3, 4, 6, 1]
	},
	{
		name: 'pack-size-trap',
		prompt:
			'Check the saved Canary Parmesan Pasta and give me three genuinely different AH forms for Parmezaanse kaas. Different weights of the same block do not count. Stage choices only.',
		order: [0, 1, 2, 3, 4]
	},
	{
		name: 'powder-first',
		prompt:
			'For the saved Canary Parmesan Pasta, compare three distinct AH purchase forms for Parmezaanse kaas because you cannot know my preference yet. Put them in the review card and leave recipe fields unchanged.',
		order: [4, 5, 3, 0, 6]
	},
	{
		name: 'mixed-language',
		prompt:
			'Controleer de opgeslagen Canary Parmesan Pasta. Offer three distinct product forms for Parmezaanse kaas, not three brands or package sizes. Gebruik alleen de reviewkaart en wijzig het recept niet.',
		order: [1, 0, 3, 5, 6]
	},
	{
		name: 'card-not-prose',
		prompt:
			'Open the saved Canary Parmesan Pasta and stage three different AH forms for Parmezaanse kaas. Keep the final reply to one short sentence and do not repeat the products in prose.',
		order: [6, 3, 0, 4, 1]
	}
];

class CanaryFailure extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'CanaryFailure';
	}
}

function fail(code: string): never {
	throw new CanaryFailure(code);
}

function normalize(value: string): string {
	return value.trim().toLocaleLowerCase('nl-NL');
}

function validateStaticFixtures(): void {
	if (SCENARIOS.length !== 5) fail('STATIC_SCENARIO_COUNT');
	for (const scenario of SCENARIOS) {
		if (scenario.order.length !== 5 || new Set(scenario.order).size !== scenario.order.length) {
			fail('STATIC_SCENARIO_ORDER');
		}
		const categories = new Set(
			scenario.order.map((index) => CATALOG[index]?.formCategory).filter(Boolean)
		);
		if (categories.size < 3) fail('STATIC_FORM_DIVERSITY');
	}
}

function writeReport(report: CanaryReport): void {
	mkdirSync(dirname(REPORT_PATH), { recursive: true });
	writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function safeFailureCode(error: unknown): string {
	return error instanceof CanaryFailure ? error.code : 'CANARY_INTERNAL_ERROR';
}

function countTokens(usage: {
	input_tokens: number;
	output_tokens: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
}): number {
	return (
		usage.input_tokens +
		usage.output_tokens +
		(usage.cache_read_input_tokens ?? 0) +
		(usage.cache_creation_input_tokens ?? 0)
	);
}

function validateQueries(raw: unknown): string[] {
	if (!raw || typeof raw !== 'object') fail('SEARCH_INPUT_INVALID');
	const queries = (raw as { queries?: unknown }).queries;
	if (!Array.isArray(queries) || queries.length < 1 || queries.length > 5) {
		fail('SEARCH_QUERY_CALL_BOUND');
	}
	const normalized = queries.map((query) => {
		if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 100) {
			fail('SEARCH_QUERY_INVALID');
		}
		const value = normalize(query);
		if (!/(parmeza|parmigiano)/i.test(value)) fail('SEARCH_QUERY_NOT_DUTCH_INGREDIENT');
		return value;
	});
	return [...new Set(normalized)];
}

function containsForbiddenProductField(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	if (Array.isArray(value)) return value.some(containsForbiddenProductField);
	return Object.entries(value as Record<string, unknown>).some(
		([key, child]) =>
			/^product_?id$/i.test(key) ||
			/^ah_?product_?id$/i.test(key) ||
			containsForbiddenProductField(child)
	);
}

async function run(): Promise<CanaryReport> {
	validateStaticFixtures();
	const sourceKey = process.env.HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY?.trim();
	if (!sourceKey) fail('PROVIDER_KEY_MISSING');
	process.env.OPENROUTER_API_KEY = sourceKey;
	delete process.env.HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY;
	process.env.DATABASE_URL = ':memory:';
	delete process.env.HOUSEHOLD_USERS;
	process.env.LITESTREAM_ENABLED = '0';

	const [
		{ streamAgentTurn, loadPrompt, stripInlineMarkdown },
		{ tools },
		{ RecipePatchOperationInputSchema, RecipeProductChoiceInputSchema },
		{ FinalIterationText, finalizeProposalText },
		{ getChatModel }
	] = await Promise.all([
		import('../../src/lib/server/ai/client.ts'),
		import('../../src/lib/server/ai/tools.ts'),
		import('../../src/lib/server/ai/recipe_patch.ts'),
		import('../../src/lib/server/ai/final_iteration_text.ts'),
		import('../../src/lib/server/ai/config.ts')
	]);

	const model = getChatModel().value;
	const selectedTools = tools.filter((tool) =>
		new Set(['get_recipe', 'search_ah_products', 'propose_recipe_patch']).has(tool.name)
	);
	if (selectedTools.length !== 3) fail('TOOL_SUBSET_INVALID');
	const system = loadPrompt('system')
		.replace('{{user}}', 'Canary')
		.replace('{{date}}', 'Tuesday 28 July 2026')
		.replace('{{language}}', 'English')
		.replace('{{household_profile}}', '(Synthetic canary household.)');

	let totalProviderCalls = 0;
	let totalTokens = 0;
	let reportedCostUsd = 0;
	let allCostsReported = true;
	const scenarioReports: ScenarioReport[] = [];

	for (let scenarioIndex = 0; scenarioIndex < SCENARIOS.length; scenarioIndex++) {
		const scenario = SCENARIOS[scenarioIndex];
		const startProviderCalls = totalProviderCalls;
		const evidenceLedger = new Map<
			string,
			{ internalId: string; formCategory: FormCategory; productName: string }
		>();
		const queryCache = new Map<string, unknown>();
		const uniqueQueries = new Set<string>();
		const toolOrder: string[] = [];
		const initialFormCategories = new Set<FormCategory>();
		const messages: Anthropic.MessageParam[] = [{ role: 'user', content: scenario.prompt }];
		const iterationText = new FinalIterationText();
		let mintedSearches = 0;
		let finalText = '';
		let modelFinalText = '';
		let proposed = false;
		let scenarioFailure: string | undefined;

		try {
			for (let iteration = 0; iteration < MAX_ITERATIONS_PER_SCENARIO; iteration++) {
				totalProviderCalls++;
				if (totalProviderCalls > MAX_PROVIDER_CALLS) fail('TOTAL_PROVIDER_CALL_BOUND');
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
				let turn;
				try {
					turn = await streamAgentTurn({
						model,
						system,
						messages,
						tools: selectedTools,
						maxTokens: MAX_OUTPUT_TOKENS_PER_CALL,
						signal: controller.signal,
						onText: (delta) => iterationText.append(stripInlineMarkdown(delta))
					});
				} catch {
					fail(controller.signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_CALL_FAILED');
				} finally {
					clearTimeout(timeout);
				}

				const tokens = countTokens(turn.usage);
				totalTokens += tokens;
				if (totalTokens > MAX_TOTAL_TOKENS) fail('TOTAL_TOKEN_BOUND');
				if (typeof turn.costUsd === 'number' && Number.isFinite(turn.costUsd)) {
					reportedCostUsd += turn.costUsd;
					if (reportedCostUsd > MAX_REPORTED_COST_USD) fail('REPORTED_COST_BOUND');
				} else {
					allCostsReported = false;
				}
				if (turn.finishReason === 'length' || turn.droppedToolCalls > 0) {
					fail('MODEL_OUTPUT_TRUNCATED');
				}

				const completed = iterationText.complete(turn.toolCalls.length);
				if (completed.done) {
					modelFinalText = completed.text.trim();
					finalText = finalizeProposalText(
						modelFinalText,
						'The review is ready above.'
					);
					break;
				}

				const toolResults: Anthropic.ToolResultBlockParam[] = [];
				for (const toolCall of turn.toolCalls) {
					toolOrder.push(toolCall.name);
					let result: unknown;
					if (toolCall.name === 'get_recipe') {
						const recipeInput =
							toolCall.input && typeof toolCall.input === 'object'
								? (toolCall.input as { slug?: unknown; name?: unknown })
								: {};
						const targetsRecipe =
							recipeInput.slug === RECIPE_SLUG ||
							(typeof recipeInput.name === 'string' &&
								normalize(recipeInput.name) === normalize('Canary Parmesan Pasta'));
						if (!targetsRecipe) {
							fail('RECIPE_READ_TARGET');
						}
						result = {
							found: true,
							recipe: {
								id: 71,
								slug: RECIPE_SLUG,
								revision: 7,
								title: 'Canary Parmesan Pasta',
								servings: 4,
								ingredients: [
									{
										id: INGREDIENT_ID,
										name: 'Parmezaanse kaas',
										amount: '50',
										unit: 'g'
									},
									{ id: 'ingredient-pasta', name: 'pasta', amount: '400', unit: 'g' }
								],
								directions: ['Kook de pasta.', 'Rasp de kaas en serveer.'],
								notes: null
							}
						};
					} else if (toolCall.name === 'search_ah_products') {
						if (!toolOrder.includes('get_recipe')) fail('SEARCH_BEFORE_RECIPE_READ');
						const queries = validateQueries(toolCall.input);
						for (const query of queries) uniqueQueries.add(query);
						if (uniqueQueries.size > MAX_UNIQUE_QUERIES_PER_SCENARIO) {
							fail('UNIQUE_QUERY_BOUND');
						}
						const searches = queries.map((query) => {
							const cached = queryCache.get(query);
							if (cached) return cached;
							mintedSearches++;
							const products = scenario.order.map((catalogIndex, productIndex) => {
								const product = CATALOG[catalogIndex];
								const evidenceKey = `ev-${scenarioIndex + 1}-${mintedSearches}-${productIndex + 1}`;
								evidenceLedger.set(evidenceKey, {
									internalId: product.internalId,
									formCategory: product.formCategory,
									productName: product.name
								});
								return {
									evidence_key: evidenceKey,
									name: product.name,
									package_size: product.packageSize,
									price: product.price,
									unit_price: null,
									bonus: false,
									previously_bought: false,
									category: 'Kaas'
								};
							});
							const search = { query, available: true, products };
							queryCache.set(query, search);
							return search;
						});
						result = {
							ok: true,
							count: searches.reduce(
								(total, search) =>
									total + (search as { products: unknown[] }).products.length,
								0
							),
							searches
						};
					} else if (toolCall.name === 'propose_recipe_patch') {
						if (!toolOrder.includes('get_recipe')) fail('PROPOSE_BEFORE_RECIPE_READ');
						if (!toolOrder.includes('search_ah_products')) fail('PROPOSE_BEFORE_AH_SEARCH');
						if (containsForbiddenProductField(toolCall.input)) fail('MODEL_SENT_PRODUCT_ID');
						if (!toolCall.input || typeof toolCall.input !== 'object') {
							fail('PROPOSAL_INPUT_INVALID');
						}
						const input = toolCall.input as {
							slug?: unknown;
							operations?: unknown;
							product_choices?: unknown;
						};
						if (input.slug !== RECIPE_SLUG) fail('PROPOSAL_RECIPE_TARGET');
						if (!Array.isArray(input.operations) || input.operations.length !== 0) {
							fail('PREFERENCE_ONLY_OPERATIONS');
						}
						for (const operation of input.operations) {
							RecipePatchOperationInputSchema.parse(operation);
						}
						if (!Array.isArray(input.product_choices)) fail('PRODUCT_CHOICES_MISSING');
						const choices = input.product_choices.map((choice) =>
							RecipeProductChoiceInputSchema.parse(choice)
						);
						if (choices.length !== 1) fail('PRODUCT_CHOICE_GROUP_COUNT');
						const choice = choices[0];
						if (choice.ingredient_id !== INGREDIENT_ID) fail('PRODUCT_CHOICE_INGREDIENT');
						const evidenceKeys = choice.candidates.map((candidate) => candidate.evidence_key);
						if (new Set(evidenceKeys).size !== evidenceKeys.length) {
							fail('PRODUCT_CHOICE_DUPLICATE_EVIDENCE');
						}
						const labels = choice.candidates.map((candidate) => normalize(candidate.form_label));
						if (new Set(labels).size !== labels.length) fail('PRODUCT_CHOICE_DUPLICATE_LABEL');
						const selectedProducts = new Set<string>();
						for (const [candidateIndex, evidenceKey] of evidenceKeys.entries()) {
							const evidence = evidenceLedger.get(evidenceKey);
							if (!evidence) fail('PRODUCT_CHOICE_UNKNOWN_EVIDENCE');
							selectedProducts.add(evidence.internalId);
							if (candidateIndex < 3) initialFormCategories.add(evidence.formCategory);
						}
						if (selectedProducts.size !== evidenceKeys.length) {
							fail('PRODUCT_CHOICE_DUPLICATE_PRODUCT');
						}
						if (initialFormCategories.size !== 3) fail('PRODUCT_CHOICE_INITIAL_FORM_DIVERSITY');
						if (
							Object.keys(toolCall.input as Record<string, unknown>).some((key) =>
								/selected|default/i.test(key)
							)
						) {
							fail('PRODUCT_CHOICE_DEFAULTED');
						}
						proposed = true;
						result = {
							ok: true,
							kind: 'recipe_patch',
							status: 'active',
							operation_count: 0,
							product_choice_groups: 1,
							candidate_count: choice.candidates.length
						};
					} else {
						fail('UNEXPECTED_TOOL');
					}

					toolResults.push({
						type: 'tool_result',
						tool_use_id: toolCall.id,
						content: JSON.stringify(result)
					});
				}
				messages.push({ role: 'assistant', content: turn.content });
				messages.push({ role: 'user', content: toolResults });
			}

			if (!proposed) fail('PROPOSAL_NOT_STAGED');
			if (!finalText) fail('FINAL_TEXT_MISSING');
			if (finalText.length > 300 || finalText.split(/\r?\n/).length > 2) {
				fail('FINAL_TEXT_TOO_LONG');
			}
			if (/[*`#|]/.test(finalText)) fail('FINAL_TEXT_MARKDOWN');
			if (
				CATALOG.some((product) =>
					normalize(finalText).includes(normalize(product.name))
				)
			) {
				fail('FINAL_TEXT_REPEATS_PRODUCTS');
			}
		} catch (error) {
			scenarioFailure = safeFailureCode(error);
		}

		scenarioReports.push({
			name: scenario.name,
			status: scenarioFailure ? 'failed' : 'passed',
			...(scenarioFailure ? { failureCode: scenarioFailure } : {}),
			providerCalls: totalProviderCalls - startProviderCalls,
			uniqueQueries: uniqueQueries.size,
			initialFormCategories: [...initialFormCategories].sort(),
			finalCharacters: finalText.length,
			modelFinalCharacters: modelFinalText.length,
			fallbackApplied: modelFinalText.length > 0 && finalText !== modelFinalText
		});
		if (scenarioFailure) {
			return {
				status: 'failed',
				model,
				totalProviderCalls,
				totalTokens,
				reportedCostUsdCents: allCostsReported ? Math.round(reportedCostUsd * 100) : null,
				scenarios: scenarioReports,
				failureCode: scenarioFailure
			};
		}
	}

	return {
		status: 'passed',
		model,
		totalProviderCalls,
		totalTokens,
		reportedCostUsdCents: allCostsReported ? Math.round(reportedCostUsd * 100) : null,
		scenarios: scenarioReports
	};
}

if (process.argv.includes('--validate-only')) {
	try {
		validateStaticFixtures();
		process.stdout.write('RECIPE-OPTIONS-LIVE-CANARY-VALID\n');
	} catch {
		process.exitCode = 1;
	}
} else {
	let report: CanaryReport;
	try {
		report = await run();
	} catch (error) {
		report = {
			status: 'failed',
			model: 'unresolved',
			totalProviderCalls: 0,
			totalTokens: 0,
			reportedCostUsdCents: null,
			scenarios: [],
			failureCode: safeFailureCode(error)
		};
	}
	delete process.env.OPENROUTER_API_KEY;
	delete process.env.HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY;
	writeReport(report);
	if (report.status !== 'passed') process.exitCode = 1;
}
