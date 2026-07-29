import type Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REPORT_PATH = join(process.cwd(), '.test-data', 'assistant-tool-selection-live.json');
const MAX_PROVIDER_CALLS = 60;
const MAX_ITERATIONS_PER_CASE = 4;
const MAX_TOTAL_TOKENS = 600_000;
const MAX_REPORTED_COST_USD = 0.25;
const MAX_OUTPUT_TOKENS_PER_CALL = 1_200;
const PROVIDER_TIMEOUT_MS = 45_000;
const REVIEW_BOUNDARY_TOOLS = new Set([
	'remove_from_inventory',
	'bulk_update_inventory',
	'propose_meal_plan',
	'propose_recipe_patch'
]);

type CaseReport = {
	id: string;
	status: 'passed' | 'known_gap' | 'failed';
	toolOrder: string[];
	providerCalls: number;
	failureCode?: string;
};

type EvalReport = {
	status: 'passed' | 'failed';
	model: string;
	toolCount: number;
	serializedToolBytes: number;
	totalProviderCalls: number;
	totalTokens: number;
	reportedCostUsdCents: number | null;
	cases: CaseReport[];
	failureCode?: string;
};

class EvalFailure extends Error {
	constructor(readonly code: string) {
		super(code);
		this.name = 'EvalFailure';
	}
}

function fail(code: string): never {
	throw new EvalFailure(code);
}

function safeFailureCode(error: unknown): string {
	return error instanceof EvalFailure ? error.code : 'EVAL_INTERNAL_ERROR';
}

function writeReport(report: EvalReport): void {
	mkdirSync(dirname(REPORT_PATH), { recursive: true });
	writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
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

function syntheticToolResult(name: string, scenarioId: string, input: unknown): unknown {
	switch (name) {
		case 'get_inventory':
			return {
				ok: true,
				items: [
					{
						id: 101,
						name: 'coriander',
						quantity: 1,
						unit: 'bunch',
						section: 'pantry',
						added_date: '2026-07-20'
					},
					{
						id: 102,
						name: 'lentils',
						quantity: 2,
						unit: 'packs',
						section: 'pantry',
						added_date: '2026-06-10'
					},
					{
						id: 103,
						name: 'tomato soup',
						quantity: 3,
						unit: 'portions',
						section: 'freezer',
						added_date: '2026-05-01'
					}
				]
			};
		case 'get_inventory_history':
			return {
				ok: true,
				entries: [{ op_id: 81, actor: 'Synthetic Ylfa', action: 'updated', item: 'tomato soup' }]
			};
		case 'get_meal_plan':
			return {
				weeks: [
					{
						week_start: '2026-08-03',
						week_number: 32,
						meals: [
							{
								id: 201,
								weekStartDate: '2026-08-03',
								plannedDate: '2026-08-04',
								dinner: 'Synthetic Lentil Curry',
								recipeSlug: 'synthetic-lentil-curry',
								servings: 4,
								source: 'fresh',
								note: null,
								cooked: false
							}
						]
					}
				]
			};
		case 'suggest_meals':
			return {
				inventory: [],
				stale_inventory: [],
				recent_meals: [],
				requested_count: 3,
				repeat_cycle_days: 21,
				avoid_recipes_cooked_recently: [],
				target_week: '2026-08-03',
				recipes: [
					{
						slug: 'synthetic-lentil-curry',
						title: 'Synthetic Lentil Curry',
						category: 'vegan',
						ingredient_count: 2,
						inventory_overlap: 1,
						on_hand: ['lentils'],
						stale_on_hand: [],
						missing_items: ['kokosmelk'],
						frozen_portions_on_hand: 0,
						days_since_cooked: 40
					},
					{
						slug: 'synthetic-tomato-pasta',
						title: 'Synthetic Tomato Pasta',
						category: 'vegetarian',
						ingredient_count: 2,
						inventory_overlap: 1,
						on_hand: ['tomaten'],
						stale_on_hand: [],
						missing_items: ['pasta'],
						frozen_portions_on_hand: 0,
						days_since_cooked: 28
					},
					{
						slug: 'synthetic-soup',
						title: 'Synthetic Soup',
						category: 'soup',
						ingredient_count: 2,
						inventory_overlap: 0,
						on_hand: [],
						stale_on_hand: [],
						missing_items: ['wortel', 'bouillon'],
						frozen_portions_on_hand: 3,
						fresh_sides_if_from_freezer: [],
						days_since_cooked: 60
					}
				],
				recommendation: {
					why_now: 'Synthetic Soup has three freezer portions ready.',
					evidence: ['3 freezer portions are ready'],
					confidence: 'high',
					uncertainty: null,
					consequence: 'Uses one frozen portion.',
					default: {
						slug: 'synthetic-soup',
						title: 'Synthetic Soup',
						source: 'freezer'
					},
					alternatives: [
						{ slug: 'synthetic-lentil-curry', title: 'Synthetic Lentil Curry' },
						{ slug: 'synthetic-tomato-pasta', title: 'Synthetic Tomato Pasta' }
					]
				}
			};
		case 'search_recipes':
			if (scenarioId === 'recipe-ah-choice') {
				return {
					ok: true,
					recipes: [{ slug: 'synthetic-tomato-pasta', title: 'Synthetic Tomato Pasta' }]
				};
			}
			return {
				ok: true,
				recipes: [{ slug: 'synthetic-lentil-curry', title: 'Synthetic Lentil Curry' }]
			};
		case 'get_recipe': {
			const requested =
				input && typeof input === 'object'
					? String(
							(input as { slug?: unknown; name?: unknown }).slug ??
								(input as { name?: unknown }).name ??
								''
						)
					: '';
			const slug = requested.includes('tomato')
				? 'synthetic-tomato-pasta'
				: requested.includes('soup')
					? 'synthetic-soup'
					: 'synthetic-lentil-curry';
			const title =
				slug === 'synthetic-tomato-pasta'
					? 'Synthetic Tomato Pasta'
					: slug === 'synthetic-soup'
						? 'Synthetic Soup'
						: 'Synthetic Lentil Curry';
			return {
				recipe: {
					id: 301,
					slug,
					revision: 4,
					title,
					ingredients: [
						{ id: 'ingredient-coconut', name: 'kokosmelk', amount: '400', unit: 'ml' },
						{ id: 'ingredient-tomato', name: 'tomaten', amount: '500', unit: 'g' }
					],
					directions: ['Cook the synthetic ingredients.']
				}
			};
		}
		case 'search_ah_products':
			return {
				ok: true,
				searches: [
					{
						query: 'tomaten',
						products: [
							{ evidence_key: 'ev-1', name: 'Synthetic fresh tomatoes', package_size: '500 g' },
							{ evidence_key: 'ev-2', name: 'Synthetic canned tomatoes', package_size: '400 g' },
							{ evidence_key: 'ev-3', name: 'Synthetic passata', package_size: '700 ml' }
						]
					}
				]
			};
		case 'remove_from_inventory':
		case 'bulk_update_inventory':
			return { ok: false, requires_confirmation: true, confirmation_id: `synthetic-${name}` };
		case 'propose_meal_plan':
		case 'propose_recipe_patch':
			return { ok: true, status: 'active', token: `synthetic-${name}`, review_required: true };
		case 'add_to_inventory':
		case 'update_inventory_item':
		case 'generate_shopping_list':
		case 'add_recipe_from_url':
		case 'add_recipe':
		case 'edit_recipe':
		case 'create_meal_recipe':
		case 'log_meal':
		case 'mark_meal_cooked':
		case 'link_leftover_recipe':
		case 'set_staple':
		case 'set_freezer_staple':
		case 'set_review_flag':
		case 'undo_op':
			return { ok: true, synthetic: true };
		case 'get_freezer_staples':
			return { ok: true, staples: [] };
		default:
			return { ok: false, error: 'Synthetic evaluator has no result for this tool' };
	}
}

function isReviewBoundary(name: string): boolean {
	return REVIEW_BOUNDARY_TOOLS.has(name);
}

async function run(): Promise<EvalReport> {
	const sourceKey = process.env.HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY?.trim();
	if (!sourceKey) fail('PROVIDER_KEY_MISSING');
	process.env.OPENROUTER_API_KEY = sourceKey;
	delete process.env.HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY;
	process.env.DATABASE_URL = ':memory:';
	delete process.env.HOUSEHOLD_USERS;
	process.env.LITESTREAM_ENABLED = '0';

	const [
		{ streamAgentTurn, loadPrompt },
		{ getChatModel },
		{ tools },
		{
			ASSISTANT_CAPABILITY_EVAL_CASES,
			assertAssistantToolBudget,
			evaluateAssistantToolOrder,
			measureAssistantTools
		}
	] = await Promise.all([
		import('../../src/lib/server/ai/client.ts'),
		import('../../src/lib/server/ai/config.ts'),
		import('../../src/lib/server/ai/tools.ts'),
		import('../../src/lib/server/ai/assistant_capability_eval.ts')
	]);

	assertAssistantToolBudget(tools);
	const measurement = measureAssistantTools(tools);
	const toolNames = new Set(tools.map((tool) => tool.name));
	for (const scenario of ASSISTANT_CAPABILITY_EVAL_CASES) {
		for (const name of [
			...scenario.allowedFirstTools,
			...scenario.requiredTools,
			...scenario.forbiddenTools
		]) {
			if (!toolNames.has(name)) fail('STATIC_UNKNOWN_TOOL');
		}
	}

	const model = getChatModel().value;
	const system = loadPrompt('system')
		.replace('{{user}}', 'Synthetic evaluator')
		.replace('{{date}}', 'Wednesday 29 July 2026')
		.replace('{{language}}', 'English or Dutch, matching each request')
		.replace('{{household_profile}}', '(Synthetic household; no real household data.)');
	let totalProviderCalls = 0;
	let totalTokens = 0;
	let reportedCostUsd = 0;
	let allCostsReported = true;
	const caseReports: CaseReport[] = [];

	for (const scenario of ASSISTANT_CAPABILITY_EVAL_CASES) {
		const messages: Anthropic.MessageParam[] = [{ role: 'user', content: scenario.prompt }];
		const startProviderCalls = totalProviderCalls;
		const toolOrder: string[] = [];
		let failureCode: string | undefined;

		try {
			for (let iteration = 0; iteration < MAX_ITERATIONS_PER_CASE; iteration++) {
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
						tools,
						maxTokens: MAX_OUTPUT_TOKENS_PER_CALL,
						signal: controller.signal,
						onText: () => {}
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
				if (turn.toolCalls.length === 0) break;

				const toolResults: Anthropic.ToolResultBlockParam[] = [];
				let reachedReviewBoundary = false;
				for (const toolCall of turn.toolCalls) {
					toolOrder.push(toolCall.name);
					reachedReviewBoundary ||= isReviewBoundary(toolCall.name);
					toolResults.push({
						type: 'tool_result',
						tool_use_id: toolCall.id,
						content: JSON.stringify(
							syntheticToolResult(toolCall.name, scenario.id, toolCall.input)
						)
					});
				}
				messages.push({ role: 'assistant', content: turn.content });
				messages.push({ role: 'user', content: toolResults });
				if (reachedReviewBoundary) break;
			}

			const toolFailure = evaluateAssistantToolOrder(scenario, toolOrder);
			if (toolFailure) fail(toolFailure);
		} catch (error) {
			failureCode = safeFailureCode(error);
		}

		caseReports.push({
			id: scenario.id,
			status:
				failureCode && failureCode === scenario.knownBaselineFailure
					? 'known_gap'
					: failureCode
						? 'failed'
						: 'passed',
			toolOrder,
			providerCalls: totalProviderCalls - startProviderCalls,
			...(failureCode ? { failureCode } : {})
		});
	}

	const failed = caseReports.find((scenario) => scenario.status === 'failed');
	return {
		status: failed ? 'failed' : 'passed',
		model,
		toolCount: measurement.count,
		serializedToolBytes: measurement.serializedBytes,
		totalProviderCalls,
		totalTokens,
		reportedCostUsdCents: allCostsReported ? Math.round(reportedCostUsd * 100) : null,
		cases: caseReports,
		...(failed ? { failureCode: `${failed.id}:${failed.failureCode}` } : {})
	};
}

if (process.argv.includes('--validate-only')) {
	Promise.all([
		import('../../src/lib/server/ai/tools.ts'),
		import('../../src/lib/server/ai/assistant_capability_eval.ts')
	])
		.then(([{ tools }, { assertAssistantToolBudget }]) => {
			assertAssistantToolBudget(tools);
			process.stdout.write('ASSISTANT-TOOL-SELECTION-EVAL-VALID\n');
		})
		.catch(() => {
			process.exitCode = 1;
		});
} else {
	let report: EvalReport;
	try {
		report = await run();
	} catch (error) {
		report = {
			status: 'failed',
			model: 'unresolved',
			toolCount: 0,
			serializedToolBytes: 0,
			totalProviderCalls: 0,
			totalTokens: 0,
			reportedCostUsdCents: null,
			cases: [],
			failureCode: safeFailureCode(error)
		};
	}
	delete process.env.OPENROUTER_API_KEY;
	delete process.env.HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY;
	writeReport(report);
	if (report.status === 'passed') {
		const knownGaps = report.cases.filter((scenario) => scenario.status === 'known_gap').length;
		process.stdout.write(
			`ASSISTANT-TOOL-SELECTION-EVAL-PASSED cases=${report.cases.length} known_gaps=${knownGaps} calls=${report.totalProviderCalls} cost_cents=${report.reportedCostUsdCents ?? 'unknown'}\n`
		);
	} else {
		process.stdout.write(`ASSISTANT-TOOL-SELECTION-EVAL-FAILED code=${report.failureCode}\n`);
		process.exitCode = 1;
	}
}
