import type Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type CatalogProduct = {
	internalId: string;
	formCategory: string;
	name: string;
	packageSize: string;
	price: number;
};

type IngredientFixture = {
	id: string;
	name: string;
	amount: string;
	unit: string;
	optional?: boolean;
	category: string;
	queryPattern: RegExp;
	catalog: CatalogProduct[];
	order: number[];
	queryOrders?: Array<{ pattern: RegExp; order: number[] }>;
	minCandidates?: number;
};

type Scenario = {
	name: string;
	recipe: {
		id: number;
		slug: string;
		title: string;
		directions: string[];
		ingredients: IngredientFixture[];
	};
	prompt: string;
	expectedOutcome: 'proposal' | 'no_proposal';
};

type ScenarioReport = {
	name: string;
	expectedOutcome: Scenario['expectedOutcome'];
	actualOutcome: 'proposal' | 'no_proposal';
	status: 'passed' | 'failed';
	failureCode?: string;
	providerCalls: number;
	uniqueQueries: number;
	rejectedQueries: string[];
	proposalRejections: number;
	choiceGroups: number;
	candidateCounts: Array<{ ingredient: string; count: number }>;
	initialForms: Array<{ ingredient: string; forms: string[] }>;
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

type Evidence = {
	internalId: string;
	ingredientId: string;
	formCategory: string;
	productName: string;
};

const REPORT_PATH = join(process.cwd(), '.test-data', 'recipe-options-live-canary.json');
const MAX_PROVIDER_CALLS = 72;
const MAX_ITERATIONS_PER_SCENARIO = 8;
const MAX_UNIQUE_QUERIES_PER_SCENARIO = 15;
const MAX_TOTAL_TOKENS = 500_000;
const MAX_REPORTED_COST_USD = 1;
const MAX_OUTPUT_TOKENS_PER_CALL = 4_000;
const PROVIDER_TIMEOUT_MS = 60_000;

function product(
	internalId: string,
	formCategory: string,
	name: string,
	packageSize: string,
	price: number
): CatalogProduct {
	return { internalId, formCategory, name, packageSize, price };
}

const PARMESAN = [
	product('parmesan-block-200', 'block', 'AH Parmigiano Reggiano stuk', '200 g', 4.99),
	product('parmesan-block-150', 'block', 'AH Parmigiano Reggiano punt', '150 g', 4.29),
	product('parmesan-block-250', 'block', 'AH Parmezaanse kaas blok', '250 g', 5.79),
	product('parmesan-grated-100', 'fresh_grated', 'AH Parmigiano Reggiano vers geraspt', '100 g', 3.49),
	product('parmesan-powder-80', 'powder', 'AH Parmezaanse kaas strooipoeder', '80 g', 2.19),
	product('parmesan-flakes-90', 'flakes', 'AH Parmigiano Reggiano flakes', '90 g', 3.79)
];

const TOMATO = [
	product('tomato-fresh-500', 'fresh', 'AH Roma tomaten', '500 g', 2.49),
	product('tomato-whole-can', 'whole_canned', 'Mutti Gepelde tomaten', '400 g', 1.89),
	product('tomato-diced-can', 'diced_canned', 'AH Tomatenblokjes', '400 g', 0.89),
	product('tomato-passata', 'passata', 'Mutti Passata', '700 g', 2.39),
	product('tomato-paste', 'paste', 'AH Tomatenpuree', '140 g', 0.99)
];

const SPINACH = [
	product('spinach-frozen-chopped', 'frozen_chopped', 'AH Spinazie deelblokjes', '450 g', 1.49),
	product('spinach-frozen-leaf', 'frozen_leaf', 'Iglo Bladspinazie', '450 g', 2.79),
	product('spinach-fresh', 'fresh_leaf', 'AH Verse spinazie', '400 g', 2.29),
	product('spinach-creamed', 'creamed', 'Iglo Spinazie à la crème', '450 g', 2.59),
	product('spinach-baby', 'fresh_leaf', 'AH Babyspinazie', '200 g', 2.19)
];

const TOFU = [
	product('tofu-firm-a', 'firm', 'AH Terra Plantaardige tofu naturel', '375 g', 2.19),
	product('tofu-firm-b', 'firm', 'Taifun Tofu naturel', '400 g', 3.99),
	product('tofu-silken', 'silken', 'Mori-Nu Silken tofu', '349 g', 2.99),
	product('tofu-smoked', 'smoked', 'Vivera Gerookte tofu', '200 g', 2.79),
	product('tofu-marinated', 'marinated', 'AH Terra Gemarineerde tofu', '200 g', 2.49)
];

const CHILI = [
	product('chili-fresh', 'fresh', 'AH Rode peper', '2 stuks', 0.99),
	product('chili-flakes', 'flakes', 'Euroma Chilivlokken', '40 g', 3.19),
	product('chili-paste', 'paste', 'Conimex Sambal oelek', '200 g', 1.79),
	product('chili-dried', 'dried_whole', 'TRS Gedroogde chilipepers', '50 g', 2.49),
	product('chili-powder', 'powder', 'Verstegen Chilipoeder', '45 g', 2.69)
];

const PARSLEY = [
	product('parsley-fresh-a', 'fresh', 'AH Platte peterselie', '20 g', 1.19),
	product('parsley-fresh-b', 'fresh', 'AH Peterselie', '30 g', 1.09),
	product('parsley-frozen', 'frozen', 'Daregal Peterselie', '50 g', 2.29),
	product('parsley-dried', 'dried', 'Verstegen Peterselie', '15 g', 2.39),
	product('parsley-paste', 'paste', 'Gourmet Garden Peterselie', '80 g', 2.99)
];

const COCONUT_MILK = [
	product('coconut-full-a', 'full_fat', 'Fairtrade Original Kokosmelk', '400 ml', 1.79),
	product('coconut-full-b', 'full_fat', 'Go-Tan Kokosmelk', '400 ml', 2.19),
	product('coconut-light', 'light', 'Fairtrade Original Kokosmelk light', '400 ml', 1.89),
	product('coconut-cream', 'cream', 'Blue Elephant Coconut cream', '250 ml', 2.49),
	product('coconut-powder', 'powder', 'TRS Coconut milk powder', '300 g', 4.49)
];

const GARLIC_BULBS_ONLY = [
	product('garlic-bulb-1', 'bulb', 'AH Knoflook', '1 stuk', 0.69),
	product('garlic-bulb-2', 'bulb', 'AH Knoflook voordeel', '2 stuks', 1.19),
	product('garlic-bulb-3', 'bulb', 'AH Biologische knoflook', '2 stuks', 1.69),
	product('garlic-bulb-4', 'bulb', 'Souq Knoflook', '3 stuks', 1.79),
	product('garlic-bulb-5', 'bulb', 'AH Knoflook grootverpakking', '500 g', 3.99)
];

const TOFU_QUERY_ORDERS = [
	{ pattern: /(silken|zacht|zijde)/i, order: [2, 0, 1, 3, 4] },
	{ pattern: /(gerookt|smoked)/i, order: [3, 0, 1, 2, 4] },
	{ pattern: /(gemarineerd|marinated)/i, order: [4, 0, 1, 2, 3] },
	{ pattern: /(stevig|firm|naturel)/i, order: [0, 1, 2, 3, 4] }
];

const CHILI_QUERY_ORDERS = [
	{ pattern: /(sambal|pasta|paste)/i, order: [2, 0, 1, 3, 4] },
	{ pattern: /(vlokken|flakes)/i, order: [1, 0, 2, 3, 4] },
	{ pattern: /(poeder|powder)/i, order: [4, 1, 3, 0, 2] },
	{ pattern: /(gedroogd|dried)/i, order: [3, 1, 4, 0, 2] },
	{ pattern: /(vers|fresh)/i, order: [0, 1, 2, 3, 4] }
];

const PARSLEY_QUERY_ORDERS = [
	{ pattern: /(kruidenpasta|pasta|paste)/i, order: [4, 0, 1, 2, 3] },
	{
		pattern: /(diepvries|vriesverse|bevroren|frozen)/i,
		order: [2, 0, 1, 3, 4]
	},
	{ pattern: /(gedroogd|dried)/i, order: [3, 0, 1, 2, 4] },
	{ pattern: /(vers|fresh)/i, order: [0, 1, 2, 3, 4] }
];

const COCONUT_QUERY_ORDERS = [
	{ pattern: /(room|cream|santen)/i, order: [3, 0, 1, 2, 4] },
	{ pattern: /(light|mager)/i, order: [2, 0, 1, 3, 4] },
	{ pattern: /(poeder|powder)/i, order: [4, 0, 1, 2, 3] },
	{ pattern: /(vol|full)/i, order: [0, 1, 2, 3, 4] }
];

function ingredient(
	id: string,
	name: string,
	queryPattern: RegExp,
	catalog: CatalogProduct[],
	order: number[],
	options: Partial<
		Pick<IngredientFixture, 'amount' | 'unit' | 'optional' | 'category' | 'queryOrders' | 'minCandidates'>
	> = {}
): IngredientFixture {
	return {
		id,
		name,
		amount: options.amount ?? '1',
		unit: options.unit ?? 'stuk',
		optional: options.optional,
		category: options.category ?? 'Houdbaar',
		queryPattern,
		catalog,
		order,
		queryOrders: options.queryOrders,
		minCandidates: options.minCandidates
	};
}

const SCENARIOS: Scenario[] = [
	{
		name: 'parmesan-package-size-trap',
		recipe: {
			id: 71,
			slug: 'canary-parmesan-pasta',
			title: 'Canary Parmesan Pasta',
			directions: ['Kook de pasta.', 'Rasp de kaas en serveer.'],
			ingredients: [
				ingredient('ingredient-parmesan', 'Parmezaanse kaas', /(parmeza|parmigiano)/i, PARMESAN, [0, 1, 2, 3, 4], {
					amount: '50',
					unit: 'g',
					category: 'Kaas'
				})
			]
		},
		prompt:
			'Check the saved Canary Parmesan Pasta and stage three genuinely different AH forms for Parmezaanse kaas. Different weights of the same block do not count. Do not change the recipe.',
		expectedOutcome: 'proposal'
	},
	{
		name: 'tomato-hidden-pool',
		recipe: {
			id: 72,
			slug: 'canary-tomato-soup',
			title: 'Canary Tomato Soup',
			directions: ['Kook de tomaten.', 'Pureer de soep.'],
			ingredients: [
				ingredient('ingredient-tomato', 'tomaten', /tomat|passata/i, TOMATO, [1, 2, 3, 0, 4], {
					amount: '800',
					unit: 'g',
					category: 'Groente',
					minCandidates: 5
				})
			]
		},
		prompt:
			'Open Canary Tomato Soup. Stage five useful AH tomato forms in one review group so the first three are distinct and two remain behind Show more. Do not edit ingredients or directions.',
		expectedOutcome: 'proposal'
	},
	{
		name: 'spinach-dutch-frozen-first',
		recipe: {
			id: 73,
			slug: 'canary-spinazie-pasta',
			title: 'Canary Spinazie Pasta',
			directions: ['Bak de spinazie.', 'Meng met pasta.'],
			ingredients: [
				ingredient('ingredient-spinach', 'spinazie', /spinaz/i, SPINACH, [0, 1, 3, 2, 4], {
					amount: '400',
					unit: 'g',
					category: 'Groente',
					queryOrders: [
						{
							pattern: /(à la crème|a la creme|cr[eè]me|room)/i,
							order: [3, 0, 1, 2, 4]
						},
						{ pattern: /(vers|baby)/i, order: [2, 4, 0, 1, 3] },
						{
							pattern: /(diepvries|bevroren|deelblok|bladspinazie)/i,
							order: [0, 1, 3, 2, 4]
						}
					]
				})
			]
		},
		prompt:
			'Controleer Canary Spinazie Pasta. Geef in de reviewkaart drie echt verschillende AH-vormen van spinazie, niet alleen meerdere diepvriesmerken. Wijzig het recept niet.',
		expectedOutcome: 'proposal'
	},
	{
		name: 'tofu-mixed-language',
		recipe: {
			id: 74,
			slug: 'canary-tofu-bowl',
			title: 'Canary Tofu Bowl',
			directions: ['Bak de tofu krokant.', 'Serveer met rijst.'],
			ingredients: [
				ingredient('ingredient-tofu', 'tofu', /\b(tofu|tofoe|tahoe)\b|silken/i, TOFU, [0, 1, 2, 3, 4], {
					amount: '300',
					unit: 'g',
					category: 'Vleesvervangers',
					queryOrders: TOFU_QUERY_ORDERS
				})
			]
		},
		prompt:
			'Voor de opgeslagen Canary Tofu Bowl, offer three meaningfully different tofu types from AH. Package size or brand alone is not a type. Stage choices only.',
		expectedOutcome: 'proposal'
	},
	{
		name: 'chili-powder-first',
		recipe: {
			id: 75,
			slug: 'canary-chili-noodles',
			title: 'Canary Chili Noodles',
			directions: ['Maak de saus.', 'Meng met noedels.'],
			ingredients: [
				ingredient('ingredient-chili', 'rode peper', /(\bpeper\b|chili|sambal)/i, CHILI, [4, 1, 3, 0, 2], {
					amount: '1',
					unit: 'stuk',
					category: 'Kruiden',
					queryOrders: CHILI_QUERY_ORDERS
				})
			]
		},
		prompt:
			'Review Canary Chili Noodles and offer three distinct ways to buy the rode peper heat at AH, such as fresh, flakes, or paste. Do not simply pick the first powders and do not edit the recipe.',
		expectedOutcome: 'proposal'
	},
	{
		name: 'optional-parsley',
		recipe: {
			id: 76,
			slug: 'canary-herb-potatoes',
			title: 'Canary Herb Potatoes',
			directions: ['Rooster de aardappelen.', 'Werk af met peterselie.'],
			ingredients: [
				ingredient(
					'ingredient-parsley',
					'peterselie',
					/(peterselie|(?:verse|vriesverse|diepvries|bevroren|gedroogde)\s+kruiden|kruidenpasta)/i,
					PARSLEY,
					[0, 1, 2, 3, 4],
					{
						amount: '15',
						unit: 'g',
						optional: true,
						category: 'Kruiden',
						queryOrders: PARSLEY_QUERY_ORDERS
					}
				)
			]
		},
		prompt:
			'For optional peterselie in Canary Herb Potatoes, stage three distinct AH product forms without making the ingredient required and without changing the recipe.',
		expectedOutcome: 'proposal'
	},
	{
		name: 'two-ingredient-curry',
		recipe: {
			id: 77,
			slug: 'canary-coconut-curry',
			title: 'Canary Coconut Curry',
			directions: ['Kook de saus.', 'Breng op smaak met peper.'],
			ingredients: [
				ingredient(
					'ingredient-coconut',
					'kokosmelk',
					/kokos(melk|room)|coconut|santen/i,
					COCONUT_MILK,
					[0, 1, 2, 3, 4],
					{ amount: '400', unit: 'ml', queryOrders: COCONUT_QUERY_ORDERS }
				),
				ingredient('ingredient-curry-chili', 'rode peper', /(\bpeper\b|chili|sambal)/i, CHILI, [2, 1, 0, 3, 4], {
					amount: '1',
					unit: 'stuk',
					category: 'Kruiden',
					queryOrders: CHILI_QUERY_ORDERS
				})
			]
		},
		prompt:
			'Open Canary Coconut Curry and create separate review groups with three distinct AH forms for both kokosmelk and rode peper. Keep both groups unselected and leave the recipe untouched.',
		expectedOutcome: 'proposal'
	},
	{
		name: 'tomato-card-not-prose',
		recipe: {
			id: 78,
			slug: 'canary-tomato-pasta',
			title: 'Canary Tomato Pasta',
			directions: ['Maak de saus.', 'Meng met pasta.'],
			ingredients: [
				ingredient('ingredient-tomato-short', 'tomaten', /tomat|passata/i, TOMATO, [4, 3, 2, 1, 0], {
					amount: '500',
					unit: 'g',
					category: 'Groente'
				})
			]
		},
		prompt:
			'Stage three different AH tomato forms for Canary Tomato Pasta. Put the comparison in the card and keep the final reply to one short sentence without product names.',
		expectedOutcome: 'proposal'
	},
	{
		name: 'insufficient-garlic-diversity',
		recipe: {
			id: 79,
			slug: 'canary-garlic-soup',
			title: 'Canary Garlic Soup',
			directions: ['Rooster de knoflook.', 'Pureer de soep.'],
			ingredients: [
				ingredient('ingredient-garlic', 'knoflook', /knoflook|garlic/i, GARLIC_BULBS_ONLY, [0, 1, 2, 3, 4], {
					amount: '2',
					unit: 'bollen',
					category: 'Groente'
				})
			]
		},
		prompt:
			'Try to find three meaningfully different AH forms for knoflook in Canary Garlic Soup. If current results only contain brands or package sizes of whole bulbs, do not invent distinctions and do not stage a proposal; briefly say no suitable trio was found.',
		expectedOutcome: 'no_proposal'
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
	if (SCENARIOS.length !== 9) fail('STATIC_SCENARIO_COUNT');
	if (new Set(SCENARIOS.map((scenario) => scenario.recipe.slug)).size !== SCENARIOS.length) {
		fail('STATIC_RECIPE_SLUGS');
	}
	for (const scenario of SCENARIOS) {
		if (scenario.recipe.ingredients.length < 1) fail('STATIC_INGREDIENT_COUNT');
		for (const fixture of scenario.recipe.ingredients) {
			if (
				fixture.order.length !== 5 ||
				new Set(fixture.order).size !== fixture.order.length ||
				fixture.order.some((index) => !fixture.catalog[index])
			) {
				fail('STATIC_CATALOG_ORDER');
			}
			for (const queryOrder of fixture.queryOrders ?? []) {
				if (
					queryOrder.order.length !== 5 ||
					new Set(queryOrder.order).size !== queryOrder.order.length ||
					queryOrder.order.some((index) => !fixture.catalog[index])
				) {
					fail('STATIC_QUERY_CATALOG_ORDER');
				}
			}
			const formCount = new Set(fixture.order.map((index) => fixture.catalog[index].formCategory)).size;
			if (scenario.expectedOutcome === 'proposal' && formCount < 3) {
				fail('STATIC_FORM_DIVERSITY');
			}
			if (scenario.expectedOutcome === 'no_proposal' && formCount >= 3) {
				fail('STATIC_NEGATIVE_FIXTURE');
			}
			const minCandidates = fixture.minCandidates ?? 3;
			if (minCandidates < 3 || minCandidates > fixture.order.length) {
				fail('STATIC_CANDIDATE_BOUND');
			}
		}
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

function validateQueries(
	raw: unknown,
	scenario: Scenario,
	rejectedQueries: string[]
): Array<{ normalized: string; ingredient: IngredientFixture }> {
	if (!raw || typeof raw !== 'object') fail('SEARCH_INPUT_INVALID');
	const queries = (raw as { queries?: unknown }).queries;
	if (!Array.isArray(queries) || queries.length < 1 || queries.length > 5) {
		fail('SEARCH_QUERY_CALL_BOUND');
	}
	const validated = queries.map((query) => {
		if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 100) {
			fail('SEARCH_QUERY_INVALID');
		}
		const normalized = normalize(query);
		const matches = scenario.recipe.ingredients.filter((fixture) => fixture.queryPattern.test(normalized));
		if (matches.length !== 1) {
			rejectedQueries.push(normalized);
			fail('SEARCH_QUERY_NOT_DUTCH_INGREDIENT');
		}
		return { normalized, ingredient: matches[0] };
	});
	return [...new Map(validated.map((query) => [query.normalized, query] as const)).values()];
}

function containsForbiddenProductField(value: unknown): boolean {
	if (!value || typeof value !== 'object') return false;
	if (Array.isArray(value)) return value.some(containsForbiddenProductField);
	return Object.entries(value as Record<string, unknown>).some(
		([key, child]) =>
			/^product_?id$/i.test(key) || /^ah_?product_?id$/i.test(key) || containsForbiddenProductField(child)
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
	const selectedToolNames = new Set(['get_recipe', 'search_ah_products', 'propose_recipe_patch']);
	const selectedTools = tools.filter((tool) => selectedToolNames.has(tool.name));
	if (selectedTools.length !== selectedToolNames.size) fail('TOOL_SUBSET_INVALID');
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
		const evidenceLedger = new Map<string, Evidence>();
		const queryCache = new Map<string, unknown>();
		const uniqueQueries = new Set<string>();
		const rejectedQueries: string[] = [];
		const toolOrder: string[] = [];
		const initialForms = new Map<string, Set<string>>();
		const candidateCounts = new Map<string, number>();
		const messages: Anthropic.MessageParam[] = [{ role: 'user', content: scenario.prompt }];
		const iterationText = new FinalIterationText();
		let mintedSearches = 0;
		let finalText = '';
		let modelFinalText = '';
		let proposed = false;
		let proposalRejections = 0;
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

				totalTokens += countTokens(turn.usage);
				if (totalTokens > MAX_TOTAL_TOKENS) fail('TOTAL_TOKEN_BOUND');
				if (typeof turn.costUsd === 'number' && Number.isFinite(turn.costUsd)) {
					reportedCostUsd += turn.costUsd;
					if (reportedCostUsd > MAX_REPORTED_COST_USD) fail('REPORTED_COST_BOUND');
				} else {
					allCostsReported = false;
				}
				if (turn.finishReason === 'length' && turn.droppedToolCalls > 0) {
					fail('MODEL_OUTPUT_TRUNCATED');
				}

				const completed = iterationText.complete(turn.toolCalls.length);
				if (completed.done) {
					modelFinalText = completed.text.trim();
					finalText = modelFinalText;
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
							recipeInput.slug === scenario.recipe.slug ||
							(typeof recipeInput.name === 'string' &&
								normalize(recipeInput.name) === normalize(scenario.recipe.title));
						if (!targetsRecipe) fail('RECIPE_READ_TARGET');
						result = {
							found: true,
							recipe: {
								id: scenario.recipe.id,
								slug: scenario.recipe.slug,
								revision: 7,
								title: scenario.recipe.title,
								servings: 4,
								ingredients: [
									...scenario.recipe.ingredients.map((fixture) => ({
										id: fixture.id,
										name: fixture.name,
										amount: fixture.amount,
										unit: fixture.unit,
										...(fixture.optional ? { optional: true } : {})
									})),
									{
										id: `base-${scenario.recipe.id}`,
										name: 'water',
										amount: '250',
										unit: 'ml'
									}
								],
								directions: scenario.recipe.directions,
								notes: null
							}
						};
					} else if (toolCall.name === 'search_ah_products') {
						if (!toolOrder.includes('get_recipe')) fail('SEARCH_BEFORE_RECIPE_READ');
						const queries = validateQueries(toolCall.input, scenario, rejectedQueries);
						for (const query of queries) uniqueQueries.add(query.normalized);
						if (uniqueQueries.size > MAX_UNIQUE_QUERIES_PER_SCENARIO) {
							fail('UNIQUE_QUERY_BOUND');
						}
						const searches = queries.map(({ normalized: query, ingredient: fixture }) => {
							const cached = queryCache.get(query);
							if (cached) return cached;
							mintedSearches++;
							const productOrder =
								fixture.queryOrders?.find(({ pattern }) => pattern.test(query))?.order ?? fixture.order;
							const products = productOrder.map((catalogIndex, productIndex) => {
								const catalogProduct = fixture.catalog[catalogIndex];
								const evidenceKey = `ev-${scenarioIndex + 1}-${mintedSearches}-${productIndex + 1}`;
								evidenceLedger.set(evidenceKey, {
									internalId: catalogProduct.internalId,
									ingredientId: fixture.id,
									formCategory: catalogProduct.formCategory,
									productName: catalogProduct.name
								});
								return {
									evidence_key: evidenceKey,
									name: catalogProduct.name,
									package_size: catalogProduct.packageSize,
									price: catalogProduct.price,
									unit_price: null,
									bonus: false,
									previously_bought: false,
									category: fixture.category
								};
							});
							const search = { query, available: true, products };
							queryCache.set(query, search);
							return search;
						});
						result = {
							ok: true,
							count: searches.reduce((total, search) => total + (search as { products: unknown[] }).products.length, 0),
							searches
						};
					} else if (toolCall.name === 'propose_recipe_patch') {
						if (scenario.expectedOutcome === 'no_proposal') fail('UNEXPECTED_PROPOSAL');
						if (proposed) fail('DUPLICATE_PROPOSAL');
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
						if (input.slug !== scenario.recipe.slug) fail('PROPOSAL_RECIPE_TARGET');
						if (!Array.isArray(input.operations) || input.operations.length !== 0) {
							fail('PREFERENCE_ONLY_OPERATIONS');
						}
						for (const operation of input.operations) {
							RecipePatchOperationInputSchema.parse(operation);
						}
						if (!Array.isArray(input.product_choices)) fail('PRODUCT_CHOICES_MISSING');
						const choices = input.product_choices.map((choice) => RecipeProductChoiceInputSchema.parse(choice));
						if (choices.length !== scenario.recipe.ingredients.length) {
							fail('PRODUCT_CHOICE_GROUP_COUNT');
						}
						if (new Set(choices.map((choice) => choice.ingredient_id)).size !== choices.length) {
							fail('PRODUCT_CHOICE_DUPLICATE_INGREDIENT');
						}
						let rejectedDuplicateLabel = false;
						for (const fixture of scenario.recipe.ingredients) {
							const choice = choices.find((candidate) => candidate.ingredient_id === fixture.id);
							if (!choice) fail('PRODUCT_CHOICE_INGREDIENT');
							if (choice.candidates.length < (fixture.minCandidates ?? 3)) {
								fail('PRODUCT_CHOICE_CANDIDATE_COUNT');
							}
							const evidenceKeys = choice.candidates.map((candidate) => candidate.evidence_key);
							if (new Set(evidenceKeys).size !== evidenceKeys.length) {
								fail('PRODUCT_CHOICE_DUPLICATE_EVIDENCE');
							}
							const labels = choice.candidates.map((candidate) => normalize(candidate.form_label));
							if (new Set(labels).size !== labels.length) {
								proposalRejections++;
								rejectedDuplicateLabel = true;
								break;
							}
							const selectedProducts = new Set<string>();
							const fixtureInitialForms = new Set<string>();
							for (const [candidateIndex, evidenceKey] of evidenceKeys.entries()) {
								const evidence = evidenceLedger.get(evidenceKey);
								if (!evidence) fail('PRODUCT_CHOICE_UNKNOWN_EVIDENCE');
								if (evidence.ingredientId !== fixture.id) {
									fail('PRODUCT_CHOICE_CROSS_INGREDIENT_EVIDENCE');
								}
								selectedProducts.add(evidence.internalId);
								if (candidateIndex < 3) {
									fixtureInitialForms.add(evidence.formCategory);
								}
							}
							if (selectedProducts.size !== evidenceKeys.length) {
								fail('PRODUCT_CHOICE_DUPLICATE_PRODUCT');
							}
							initialForms.set(fixture.id, fixtureInitialForms);
							candidateCounts.set(fixture.id, choice.candidates.length);
							if (fixtureInitialForms.size !== 3) {
								fail('PRODUCT_CHOICE_INITIAL_FORM_DIVERSITY');
							}
						}
						if (rejectedDuplicateLabel) {
							for (const fixture of scenario.recipe.ingredients) {
								initialForms.delete(fixture.id);
								candidateCounts.delete(fixture.id);
							}
							toolResults.push({
								type: 'tool_result',
								tool_use_id: toolCall.id,
								content: JSON.stringify({
									ok: false,
									error: 'Product choices must have unique products and form labels'
								})
							});
							continue;
						}
						if (Object.keys(toolCall.input as Record<string, unknown>).some((key) => /selected|default/i.test(key))) {
							fail('PRODUCT_CHOICE_DEFAULTED');
						}
						proposed = true;
						result = {
							ok: true,
							kind: 'recipe_patch',
							status: 'active',
							operation_count: 0,
							product_choice_groups: choices.length,
							candidate_count: choices.reduce((total, choice) => total + choice.candidates.length, 0)
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

			if (scenario.expectedOutcome === 'proposal') {
				if (!proposed) fail('PROPOSAL_NOT_STAGED');
				finalText = finalizeProposalText(modelFinalText, 'The review is ready above.');
				if (finalText.length > 180 || finalText.split(/\r?\n/).length > 1) {
					fail('PROPOSAL_FINAL_TEXT_TOO_LONG');
				}
			} else {
				if (proposed) fail('UNEXPECTED_PROPOSAL');
				if (!toolOrder.includes('search_ah_products')) fail('NEGATIVE_SEARCH_MISSING');
				if (finalText.length > 300 || finalText.split(/\r?\n/).length > 2) {
					fail('NEGATIVE_FINAL_TEXT_TOO_LONG');
				}
			}
			if (!finalText) fail('FINAL_TEXT_MISSING');
			if (/[*`#|]/.test(finalText)) fail('FINAL_TEXT_MARKDOWN');
			if (
				scenario.recipe.ingredients.some((fixture) =>
					fixture.catalog.some((catalogProduct) => normalize(finalText).includes(normalize(catalogProduct.name)))
				)
			) {
				fail('FINAL_TEXT_REPEATS_PRODUCTS');
			}
		} catch (error) {
			scenarioFailure = safeFailureCode(error);
		}

		scenarioReports.push({
			name: scenario.name,
			expectedOutcome: scenario.expectedOutcome,
			actualOutcome: proposed ? 'proposal' : 'no_proposal',
			status: scenarioFailure ? 'failed' : 'passed',
			...(scenarioFailure ? { failureCode: scenarioFailure } : {}),
			providerCalls: totalProviderCalls - startProviderCalls,
			uniqueQueries: uniqueQueries.size,
			rejectedQueries,
			proposalRejections,
			choiceGroups: candidateCounts.size,
			candidateCounts: scenario.recipe.ingredients
				.filter((fixture) => candidateCounts.has(fixture.id))
				.map((fixture) => ({
					ingredient: fixture.name,
					count: candidateCounts.get(fixture.id)!
				})),
			initialForms: scenario.recipe.ingredients
				.filter((fixture) => initialForms.has(fixture.id))
				.map((fixture) => ({
					ingredient: fixture.name,
					forms: [...initialForms.get(fixture.id)!].sort()
				})),
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
