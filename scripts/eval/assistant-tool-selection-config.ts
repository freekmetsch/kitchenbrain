import type { AssistantCapabilityEvalCase } from '../../src/lib/server/ai/assistant_capability_eval';

const DEFAULT_MAX_REPORTED_COST_USD = 0.25;

export function classifyAssistantEvalProviderFailure(error: unknown): string {
	const message = error instanceof Error ? error.message : '';
	const status = Number(/\bAI service error \((\d{3})\)/u.exec(message)?.[1]);
	if (!Number.isInteger(status)) return 'PROVIDER_CALL_FAILED';
	if (status === 401) return 'PROVIDER_AUTH_FAILED';
	if (status === 402) return 'PROVIDER_CREDIT_BLOCKED';
	if (status === 403 && /\b(?:limit|quota|credit)\b/iu.test(message)) {
		return 'PROVIDER_CREDIT_BLOCKED';
	}
	if (status === 403) return 'PROVIDER_FORBIDDEN';
	if (status === 404) return 'PROVIDER_ROUTE_UNAVAILABLE';
	if (status === 408) return 'PROVIDER_TIMEOUT';
	if (status === 429) return 'PROVIDER_RATE_LIMITED';
	if (status >= 500) return 'PROVIDER_SERVER_ERROR';
	return `PROVIDER_HTTP_${status}`;
}

export function selectAssistantEvalCases(
	rawCaseIds: string | undefined,
	scenarios: readonly AssistantCapabilityEvalCase[]
): readonly AssistantCapabilityEvalCase[] {
	if (rawCaseIds === undefined) return scenarios;

	const ids = rawCaseIds
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	if (ids.length === 0) throw new Error('Assistant eval case filter is empty');
	if (new Set(ids).size !== ids.length) {
		throw new Error('Assistant eval case filter contains duplicate ids');
	}

	const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
	return ids.map((id) => {
		const scenario = byId.get(id);
		if (!scenario) throw new Error(`Assistant eval case filter references unknown id "${id}"`);
		return scenario;
	});
}

export function resolveAssistantEvalCostBound(rawCostBound: string | undefined): number {
	if (rawCostBound === undefined) return DEFAULT_MAX_REPORTED_COST_USD;

	const value = Number(rawCostBound);
	if (!Number.isFinite(value)) {
		throw new Error('Assistant eval cost bound must be a number');
	}
	if (value <= 0) {
		throw new Error('Assistant eval cost bound must be positive');
	}
	if (value > DEFAULT_MAX_REPORTED_COST_USD) {
		throw new Error(
			`Assistant eval cost bound cannot exceed $${DEFAULT_MAX_REPORTED_COST_USD.toFixed(2)}`
		);
	}
	return value;
}
