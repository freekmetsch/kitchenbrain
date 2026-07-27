import type { StoredCookModeRecipe } from '$lib/types';
import { readCookModeFailure } from './cook_mode_recovery';
import { isCookModeEligibleForNewSession } from './staleness';

type GenerationContext = {
	viewLang: 'en' | 'nl';
	servings: number;
	sessionStarted: boolean;
	hasPlan: boolean;
};

type NetworkMessages = {
	loadFailed: () => string;
	budgetReached: () => string;
	noDirections: () => string;
	connectionFailed: () => string;
	cookFailed: () => string;
	swapSaved: () => string;
	swapSaveFailed: () => string;
};

export type CookModeNetworkControllerDependencies = {
	basePath: string;
	recipeSlug: string;
	recipeRevision: number;
	fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
	readGenerationContext: () => GenerationContext;
	adoptCookMode: (cookMode: StoredCookModeRecipe) => void;
	reload: () => void;
	clearProgress: () => void;
	onCooked: () => void;
	resetSession: () => void;
	notifySuccess: (message: string) => void;
	notifyError: (message: string) => void;
	messages: NetworkMessages;
	setTimer?: (callback: () => void, delay: number) => unknown;
	clearTimer?: (timer: unknown) => void;
};

export class CookModeNetworkController {
	loading = $state(false);
	loadError = $state('');
	loadErrorRetryable = $state(false);
	regenerating = $state(false);
	genElapsedSec = $state(0);
	cookedSubmitting = $state(false);
	cookedDone = $state(false);
	savingIngredientId = $state<string | null>(null);

	readonly #dependencies: CookModeNetworkControllerDependencies;
	#genStartedAt: number | null = null;
	#autoRetries = 0;
	#retryTimer: unknown | null = null;
	#cookedAckTimer: unknown | null = null;
	readonly #setTimer: (callback: () => void, delay: number) => unknown;
	readonly #clearTimer: (timer: unknown) => void;

	constructor(dependencies: CookModeNetworkControllerDependencies) {
		this.#dependencies = dependencies;
		this.#setTimer = dependencies.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
		this.#clearTimer =
			dependencies.clearTimer ??
			((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
	}

	async loadCookMode(force = false): Promise<void> {
		this.#clearRetry();
		this.loading = true;
		this.loadError = '';
		this.loadErrorRetryable = false;
		if (this.#genStartedAt == null) {
			this.#genStartedAt = Date.now();
			this.genElapsedSec = 0;
		}
		let delegatedRegeneration = false;

		try {
			const context = this.#dependencies.readGenerationContext();
			const params = new URLSearchParams({
				lang: context.viewLang,
				servings: String(context.servings)
			});
			if (force) params.set('force', 'true');
			const response = await this.#dependencies.fetcher(
				`${this.#dependencies.basePath}/api/recipes/${this.#dependencies.recipeSlug}/cook-mode?${params}`,
				{ method: 'POST' }
			);
			const body = (await response.json()) as {
				cookMode?: StoredCookModeRecipe;
				recipeRevision?: number;
				reason?: unknown;
			};

			if (response.ok && body.cookMode) {
				if (
					typeof body.recipeRevision === 'number' &&
					body.recipeRevision > this.#dependencies.recipeRevision &&
					!context.sessionStarted
				) {
					this.#dependencies.reload();
					return;
				}
				if (
					!isCookModeEligibleForNewSession(
						body.cookMode,
						context.viewLang,
						context.servings
					)
				) {
					if (!force) {
						this.regenerating = true;
						this.loading = false;
						delegatedRegeneration = true;
						await this.loadCookMode(true);
						return;
					}
					this.loadError = this.#dependencies.messages.loadFailed();
					this.loadErrorRetryable = true;
				} else {
					this.#autoRetries = 0;
					this.#dependencies.adoptCookMode(body.cookMode);
				}
			} else {
				const failure = readCookModeFailure(body);
				this.loadError =
					failure.reason === 'daily_cap_exceeded'
						? this.#dependencies.messages.budgetReached()
						: failure.reason === 'no_directions'
							? this.#dependencies.messages.noDirections()
							: this.#dependencies.messages.loadFailed();
				this.loadErrorRetryable = failure.retryable;
			}
		} catch {
			this.loadError = this.#dependencies.messages.connectionFailed();
			this.loadErrorRetryable = true;
		} finally {
			if (delegatedRegeneration) return;
			this.loading = false;
			this.regenerating = false;
			this.#genStartedAt = null;
			this.#scheduleRetry();
		}
	}

	updateElapsed(now = Date.now()): void {
		if (this.#genStartedAt != null) {
			this.genElapsedSec = Math.floor((now - this.#genStartedAt) / 1000);
		}
	}

	retryAfterVisibility(): Promise<void> {
		this.#autoRetries = 0;
		return this.loadCookMode(false);
	}

	async markCooked(planMealId: number | null): Promise<void> {
		this.cookedSubmitting = true;
		try {
			const response = await this.#dependencies.fetcher(
				planMealId
					? `${this.#dependencies.basePath}/api/meal-plan/${planMealId}`
					: `${this.#dependencies.basePath}/api/recipes/${this.#dependencies.recipeSlug}/cook`,
				{
					method: planMealId ? 'PUT' : 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(planMealId ? { status: 'cooked' } : {})
				}
			);
			if (!response.ok) {
				this.cookedSubmitting = false;
				this.#dependencies.notifyError(this.#dependencies.messages.cookFailed());
				return;
			}
			this.cookedDone = true;
			this.#dependencies.clearProgress();
			this.#dependencies.onCooked();
			this.#clearCookedAck();
			this.#cookedAckTimer = this.#setTimer(() => {
				this.#dependencies.resetSession();
				this.#cookedAckTimer = null;
			}, 1_200);
		} catch {
			this.cookedSubmitting = false;
			this.#dependencies.notifyError(this.#dependencies.messages.cookFailed());
		}
	}

	resetCooked(): void {
		this.cookedDone = false;
		this.cookedSubmitting = false;
	}

	async saveSwapDefault(ingredientId: string, substituteIndex: number): Promise<void> {
		this.savingIngredientId = ingredientId;
		try {
			const response = await this.#dependencies.fetcher(
				`${this.#dependencies.basePath}/api/recipes/${this.#dependencies.recipeSlug}/ingredient-swap`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						ingredientId,
						substituteIndex,
						expectedRecipeRevision: this.#dependencies.recipeRevision
					})
				}
			);
			if (!response.ok) throw new Error('ingredient swap request failed');
			this.#dependencies.notifySuccess(this.#dependencies.messages.swapSaved());
			this.#dependencies.reload();
		} catch {
			this.savingIngredientId = null;
			this.#dependencies.notifyError(this.#dependencies.messages.swapSaveFailed());
		}
	}

	destroy(): void {
		this.#clearRetry();
		this.#clearCookedAck();
	}

	#scheduleRetry(): void {
		if (!this.loadErrorRetryable || this.#autoRetries >= 2) return;
		this.#autoRetries += 1;
		this.#retryTimer = this.#setTimer(() => {
			this.#retryTimer = null;
			const context = this.#dependencies.readGenerationContext();
			if (
				!context.hasPlan &&
				!this.loading &&
				this.loadError &&
				this.loadErrorRetryable
			) {
				void this.loadCookMode(false);
			}
		}, this.#autoRetries * 5_000);
	}

	#clearRetry(): void {
		if (this.#retryTimer == null) return;
		this.#clearTimer(this.#retryTimer);
		this.#retryTimer = null;
	}

	#clearCookedAck(): void {
		if (this.#cookedAckTimer == null) return;
		this.#clearTimer(this.#cookedAckTimer);
		this.#cookedAckTimer = null;
	}
}
