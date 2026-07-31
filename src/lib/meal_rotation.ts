import { addDays, isoDateInAppTimeZone } from '$lib/week';

export const ROTATION_POLICIES = [
	'never',
	'weekly',
	'fortnightly',
	'monthly',
	'seasonal',
	'special'
] as const;

export const ROTATION_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

export type RotationPolicy = (typeof ROTATION_POLICIES)[number];
export type RotationSeason = (typeof ROTATION_SEASONS)[number];

export function normalizeRotationSettings(
	policy: unknown,
	seasons: unknown
): { policy: RotationPolicy | null; seasons: RotationSeason[] } {
	if (policy !== null && !ROTATION_POLICIES.includes(policy as RotationPolicy)) {
		throw new Error('Invalid rotation policy');
	}
	if (!Array.isArray(seasons) || seasons.some((season) => !ROTATION_SEASONS.includes(season))) {
		throw new Error('Invalid rotation seasons');
	}
	if (policy === 'never' || policy === 'special') {
		return { policy, seasons: [] };
	}
	const normalizedSeasons = ROTATION_SEASONS.filter((season) => seasons.includes(season));
	if (policy === 'seasonal' && normalizedSeasons.length === 0) {
		throw new Error('Seasonal rotation requires at least one season');
	}
	return { policy: policy as RotationPolicy | null, seasons: normalizedSeasons };
}

type EvaluateRotationInput = {
	policy: RotationPolicy | null;
	seasons: readonly RotationSeason[];
	lastCookedAt: Date | null;
	targetWeekStart: string;
	currentWeekStart: string;
	reservedWeekStarts: readonly string[];
	includeSpecial?: boolean;
};

export type RotationReason = {
	code:
		| 'cadence_due'
		| 'cadence_wait'
		| 'season_due'
		| 'season_complete'
		| 'season_inactive'
		| 'unconfigured'
		| 'never'
		| 'special_hidden'
		| 'special'
		| 'reserved'
		| 'past_week';
	dueDate?: string;
	season?: RotationSeason;
	seasonKey?: string;
	reservedWeekStart?: string;
};

export type RotationEvaluation = {
	status: 'due' | 'not_due' | 'excluded' | 'special' | 'reserved';
	reason: RotationReason;
};

function seasonInstance(date: string): {
	season: RotationSeason;
	seasonKey: string;
} {
	const [year, month] = date.split('-').map(Number);
	if (month >= 3 && month <= 5) return { season: 'spring', seasonKey: `spring:${year}` };
	if (month >= 6 && month <= 8) return { season: 'summer', seasonKey: `summer:${year}` };
	if (month >= 9 && month <= 11) return { season: 'autumn', seasonKey: `autumn:${year}` };
	const winterYear = month === 12 ? year : year - 1;
	return { season: 'winter', seasonKey: `winter:${winterYear}` };
}

function addMonthsClamped(date: string, months: number): string {
	const [year, month, day] = date.split('-').map(Number);
	const target = new Date(Date.UTC(year, month - 1 + months, 1));
	const lastDay = new Date(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
	).getUTCDate();
	return new Date(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay))
	)
		.toISOString()
		.slice(0, 10);
}

function calendarDayDistance(left: string, right: string): number {
	return Math.abs(
		(Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`)) /
			86_400_000
	);
}

function reservationMatches(
	policy: RotationPolicy,
	targetWeekStart: string,
	reservedWeekStart: string
): boolean {
	if (policy === 'weekly' || policy === 'fortnightly') {
		return calendarDayDistance(targetWeekStart, reservedWeekStart) <=
			(policy === 'weekly' ? 7 : 14);
	}
	if (policy === 'monthly') {
		return (
			targetWeekStart >= addMonthsClamped(reservedWeekStart, -1) &&
			targetWeekStart <= addMonthsClamped(reservedWeekStart, 1)
		);
	}
	if (policy === 'seasonal') {
		return seasonInstance(targetWeekStart).seasonKey === seasonInstance(reservedWeekStart).seasonKey;
	}
	return targetWeekStart === reservedWeekStart;
}

export function evaluateRotation(input: EvaluateRotationInput): RotationEvaluation {
	if (input.targetWeekStart < input.currentWeekStart) {
		return { status: 'excluded', reason: { code: 'past_week' } };
	}
	if (input.policy === null) {
		return { status: 'excluded', reason: { code: 'unconfigured' } };
	}
	if (input.policy === 'never') {
		return { status: 'excluded', reason: { code: 'never' } };
	}
	if (input.policy === 'special') {
		const reservation = input.reservedWeekStarts.find((week) => week === input.targetWeekStart);
		if (reservation) {
			return {
				status: 'reserved',
				reason: { code: 'reserved', reservedWeekStart: reservation }
			};
		}
		return input.includeSpecial
			? { status: 'special', reason: { code: 'special' } }
			: { status: 'excluded', reason: { code: 'special_hidden' } };
	}
	const reservation = input.reservedWeekStarts.find((week) =>
		reservationMatches(input.policy!, input.targetWeekStart, week)
	);
	if (reservation) {
		return {
			status: 'reserved',
			reason: { code: 'reserved', reservedWeekStart: reservation }
		};
	}
	const lastCookedDate = input.lastCookedAt
		? isoDateInAppTimeZone(input.lastCookedAt)
		: null;
	const targetSeason = seasonInstance(input.targetWeekStart);
	if (input.seasons.length > 0 && !input.seasons.includes(targetSeason.season)) {
		return {
			status: 'not_due',
			reason: { code: 'season_inactive', ...targetSeason }
		};
	}
	if (input.policy === 'seasonal') {
		if (
			lastCookedDate &&
			seasonInstance(lastCookedDate).seasonKey === targetSeason.seasonKey
		) {
			return {
				status: 'not_due',
				reason: { code: 'season_complete', ...targetSeason }
			};
		}
		return { status: 'due', reason: { code: 'season_due', ...targetSeason } };
	}
	const cadenceDays = input.policy === 'fortnightly' ? 14 : 7;
	const dueDate = lastCookedDate
		? input.policy === 'monthly'
			? addMonthsClamped(lastCookedDate, 1)
			: addDays(lastCookedDate, cadenceDays)
		: input.targetWeekStart;
	return addDays(input.targetWeekStart, 6) >= dueDate
		? { status: 'due', reason: { code: 'cadence_due', dueDate } }
		: { status: 'not_due', reason: { code: 'cadence_wait', dueDate } };
}
