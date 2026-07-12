import { describe, it, expect } from 'vitest';
import {
	computeCostEur,
	categoryForModel,
	capForCategory,
	CHAT_DAILY_EUR_CAP,
	type SpendCategory
} from './pricing';

const SONNET = 'claude-sonnet-4-6';
const HAIKU = 'claude-haiku-4-5-20251001';

// Default USD→EUR unless the env overrides it; tests assert on the model *ratio*
// where possible so they don't hard-code the FX rate.
const usd2eur = parseFloat(process.env.USD_TO_EUR ?? '0.92');

describe('computeCostEur', () => {
	it('prices a Sonnet row at $3/M in + $15/M out', () => {
		const eur = computeCostEur(SONNET, { input_tokens: 1_000_000, output_tokens: 1_000_000 });
		expect(eur).toBeCloseTo((3 + 15) * usd2eur, 6);
	});

	it('prices a Haiku row at $1/M in + $5/M out — 3× cheaper than Sonnet', () => {
		const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
		const haiku = computeCostEur(HAIKU, usage);
		const sonnet = computeCostEur(SONNET, usage);
		expect(haiku).toBeCloseTo((1 + 5) * usd2eur, 6);
		// Regression guard: before Phase 2, Haiku was billed at Sonnet prices.
		expect(haiku).toBeLessThan(sonnet);
		expect(sonnet / haiku).toBeCloseTo(3, 5);
	});

	it('bills cache reads at 0.1× and cache writes at 1.25× base input (Sonnet)', () => {
		const eur = computeCostEur(SONNET, {
			input_tokens: 0,
			output_tokens: 0,
			cache_read_input_tokens: 1_000_000,
			cache_creation_input_tokens: 1_000_000
		});
		expect(eur).toBeCloseTo((0.3 + 3.75) * usd2eur, 6);
	});

	it('prices an unknown model as Sonnet (never under-bills)', () => {
		const usage = { input_tokens: 1_000_000, output_tokens: 0 };
		expect(computeCostEur('some-future-model', usage)).toBeCloseTo(
			computeCostEur(SONNET, usage),
			6
		);
	});
});

describe('categoryForModel', () => {
	it('routes Sonnet to chat and Haiku to background', () => {
		expect(categoryForModel(SONNET)).toBe('chat');
		expect(categoryForModel(HAIKU)).toBe('background');
	});

	it('defaults an unknown model to the chat (foreground) cap', () => {
		expect(categoryForModel('some-future-model')).toBe('chat');
	});
});

describe('cap split — chat spend ignores background rows and vice versa', () => {
	// Mirrors checkDailyCap's filter+reduce over a day's rows without needing a db.
	type Row = { model: string; costEur: number };
	const capExceeded = (rows: Row[], category: SpendCategory) => {
		const total = rows
			.filter((r) => categoryForModel(r.model) === category)
			.reduce((acc, r) => acc + r.costEur, 0);
		return { total, exceeded: total >= capForCategory(category) };
	};

	it('does not pause chat when only background (Haiku) spend is over cap', () => {
		const rows: Row[] = [
			{ model: HAIKU, costEur: CHAT_DAILY_EUR_CAP + 1 },
			{ model: SONNET, costEur: 0.01 }
		];
		expect(capExceeded(rows, 'chat').total).toBeCloseTo(0.01, 6);
		expect(capExceeded(rows, 'chat').exceeded).toBe(false);
		// ...while the background line itself does register as exceeded.
		expect(capExceeded(rows, 'background').exceeded).toBe(true);
	});

	it('pauses chat only on foreground (Sonnet) spend crossing the cap', () => {
		const rows: Row[] = [{ model: SONNET, costEur: CHAT_DAILY_EUR_CAP }];
		expect(capExceeded(rows, 'chat').exceeded).toBe(true);
	});
});
