<script lang="ts">
	import { base } from '$app/paths';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { RecipePatchDisplay } from '$lib/tool_display';
	import { onMount, untrack } from 'svelte';

	type SelectionSnapshot = {
		operationIds: string[];
		productSelections: Record<string, string>;
	};
	type Props = {
		proposal: RecipePatchDisplay;
		onApplied?: () => void | Promise<void>;
		isLatest?: boolean;
		verifyStatus?: boolean;
		initialSelection?: SelectionSnapshot;
		onSelectionChange?: (selection: SelectionSnapshot) => void;
		onFindDifferent?: (input: {
			token: string;
			groupId: string;
			ingredientLabel: string;
		}) => void | Promise<void>;
	};

	let {
		proposal,
		onApplied,
		isLatest = true,
		verifyStatus = true,
		initialSelection,
		onSelectionChange,
		onFindDifferent
	}: Props = $props();
	const productChoices = $derived(proposal.productChoices ?? []);
	let selected = $state<Record<string, boolean>>(
		untrack(() =>
			Object.fromEntries(
				proposal.operations.map((operation) => [
					operation.id,
					initialSelection?.operationIds.includes(operation.id) ?? false
				])
			)
		)
	);
	let selectedProducts = $state<Record<string, string>>(
		untrack(() =>
			Object.fromEntries(
				(proposal.productChoices ?? []).flatMap((group) => {
					const candidateId = initialSelection?.productSelections[group.id];
					return candidateId && group.candidates.some((candidate) => candidate.id === candidateId)
						? [[group.id, candidateId]]
						: [];
				})
			)
		)
	);
	let visibleCounts = $state<Record<string, number>>(
		untrack(() => Object.fromEntries((proposal.productChoices ?? []).map((group) => [group.id, 3])))
	);
	let activeProductGroup = $state<string | null>(
		untrack(() => proposal.productChoices?.[0]?.id ?? null)
	);
	let applyState = $state<'ready' | 'applying' | 'done' | 'error' | 'stale'>('ready');
	let serverStatus = $state<
		'checking' | 'active' | 'applying' | 'superseded' | 'applied' | 'expired'
	>(untrack(() => (proposal.status && proposal.status !== 'active' ? proposal.status : 'checking')));
	let findingGroup = $state<string | null>(null);
	let statusEl: HTMLParagraphElement | undefined = $state();
	let effectiveStatus = $derived(isLatest ? serverStatus : 'superseded');
	let selectedCount = $derived(
		Object.values(selected).filter(Boolean).length + Object.keys(selectedProducts).length
	);

	onMount(() => {
		let cancelled = false;
		if (!isLatest) {
			serverStatus = 'superseded';
			return;
		}
		if (!verifyStatus) {
			serverStatus = 'active';
			return;
		}
		void (async () => {
			try {
				const response = await fetch(
					`${base}/api/recipes/${proposal.recipeSlug}/enhance?token=${encodeURIComponent(proposal.token)}`
				);
				const data = response.ok ? await response.json() : null;
				if (
					!cancelled &&
					(data?.status === 'active' ||
						data?.status === 'applying' ||
						data?.status === 'superseded' ||
						data?.status === 'applied' ||
						data?.status === 'expired')
				) {
					serverStatus = data.status;
				} else if (!cancelled) {
					serverStatus = 'expired';
				}
			} catch {
				if (!cancelled) serverStatus = 'expired';
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	function selectionSnapshot(): SelectionSnapshot {
		return {
			operationIds: proposal.operations
				.filter((operation) => selected[operation.id])
				.map((operation) => operation.id),
			productSelections: { ...selectedProducts }
		};
	}

	function notifySelection() {
		onSelectionChange?.(selectionSnapshot());
	}

	function setOperation(id: string, checked: boolean) {
		selected[id] = checked;
		notifySelection();
	}

	function setProduct(groupId: string, candidateId: string) {
		selectedProducts[groupId] = candidateId;
		notifySelection();
	}

	function clearProduct(groupId: string) {
		delete selectedProducts[groupId];
		notifySelection();
	}

	async function findDifferent(groupId: string, ingredientLabel: string) {
		if (!onFindDifferent || findingGroup) return;
		findingGroup = groupId;
		try {
			await onFindDifferent({
				token: proposal.token,
				groupId,
				ingredientLabel
			});
		} finally {
			findingGroup = null;
		}
	}

	async function apply() {
		if (selectedCount === 0 || effectiveStatus !== 'active') return;
		applyState = 'applying';
		serverStatus = 'applying';
		try {
			const snapshot = selectionSnapshot();
			const response = await fetch(`${base}/api/recipes/${proposal.recipeSlug}/enhance`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'apply',
					token: proposal.token,
					operationIds: snapshot.operationIds,
					productSelections: Object.entries(snapshot.productSelections).map(
						([groupId, candidateId]) => ({ groupId, candidateId })
					)
				})
			});
			applyState = response.ok ? 'done' : response.status === 409 ? 'stale' : 'error';
			serverStatus = response.ok ? 'applied' : response.status === 409 ? 'superseded' : 'active';
			if (response.ok) {
				onSelectionChange?.({ operationIds: [], productSelections: {} });
				await onApplied?.();
			}
		} catch {
			applyState = 'error';
			serverStatus = 'active';
		} finally {
			queueMicrotask(() => statusEl?.focus());
		}
	}

	function inactiveCopy() {
		if (effectiveStatus === 'checking' || effectiveStatus === 'applying') {
			return m.recipe_product_status_checking();
		}
		if (effectiveStatus === 'superseded') return m.recipe_product_status_superseded();
		if (effectiveStatus === 'applied') return m.recipe_product_status_applied();
		return m.recipe_product_status_expired();
	}
</script>

<section class="min-w-0" aria-label={m.recipe_enhance_title()}>
	{#if effectiveStatus !== 'active'}
		<p class="rounded-lg bg-base-100/55 px-2.5 py-2 text-xs text-base-content/60" aria-live="polite">
			{inactiveCopy()}
		</p>
	{:else}
		{#if applyState !== 'ready' && applyState !== 'applying'}
			<p
				bind:this={statusEl}
				tabindex="-1"
				class:text-success={applyState === 'done'}
				class:text-warning={applyState === 'stale'}
				class:text-error={applyState === 'error'}
				class="mb-2 text-xs outline-none"
				aria-live="polite"
			>
				{applyState === 'done'
					? m.recipe_enhance_applied()
					: applyState === 'stale'
						? m.recipe_enhance_stale()
						: m.recipe_enhance_failed()}
			</p>
		{/if}

		{#if proposal.operations.length}
			<div class="divide-y divide-base-300/60 border-y border-base-300/60">
				{#each proposal.operations as operation (operation.id)}
					<label class="grid min-h-11 min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-2 py-2 md:grid-cols-[auto_minmax(8rem,0.7fr)_minmax(0,1.4fr)] md:items-start">
						<input
							type="checkbox"
							class="checkbox checkbox-sm mt-0.5 shrink-0"
							checked={selected[operation.id]}
							onchange={(event) => setOperation(operation.id, event.currentTarget.checked)}
						/>
						<span class="min-w-0 text-xs font-medium md:pt-0.5">{operation.label}</span>
						<span class="col-start-2 min-w-0 text-xs md:col-start-3">
							<span class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2">
								<span class="opacity-55">{m.recipe_patch_before()}</span>
								<span class="break-words line-through opacity-60">{operation.before ?? '—'}</span>
								<span class="opacity-55">{m.recipe_patch_after()}</span>
								<span class="break-words">{operation.after}</span>
							</span>
							<details class="mt-1 text-base-content/60">
								<summary class="min-h-6 cursor-pointer">{m.recipe_product_details()}</summary>
								<p class="pt-1">{operation.reason}</p>
								{#if operation.evidence}
									<p class="pt-1 text-success/80">
										{m.recipe_patch_ah_evidence({
											product: operation.evidence.productName,
											size: operation.evidence.packageSize ?? m.recipe_patch_size_unknown()
										})}
									</p>
								{:else if operation.kind === 'add_ingredient' || operation.kind === 'update_ingredient'}
									<p class="pt-1 text-warning/80">{m.recipe_patch_unverified()}</p>
								{/if}
							</details>
						</span>
					</label>
				{/each}
			</div>
		{/if}

		{#if productChoices.length}
			<h3 class="mt-3 text-xs font-semibold uppercase tracking-wide text-base-content/55">
				{m.recipe_product_choices_heading()}
			</h3>
			<div class="mt-1 divide-y divide-base-300/60 border-y border-base-300/60">
				{#each productChoices as group (group.id)}
					<fieldset class="min-w-0 py-3">
						<legend class="text-sm font-semibold">{group.label}</legend>
						<div class="flex min-w-0 items-start justify-between gap-2">
							<p class="mt-0.5 min-w-0 text-xs text-base-content/60">{group.reason}</p>
							<button
								type="button"
								class="min-h-11 shrink-0 text-xs font-medium text-primary md:hidden"
								aria-expanded={activeProductGroup === group.id}
								onclick={() =>
									(activeProductGroup =
										activeProductGroup === group.id ? null : group.id)}
							>
								{activeProductGroup === group.id
									? m.recipe_product_hide_options()
									: m.recipe_product_show_options()}
							</button>
						</div>
						<div
							class="mt-2 min-w-0 gap-2 md:grid-cols-3 {activeProductGroup === group.id
								? 'grid'
								: 'hidden md:grid'}"
						>
							{#each group.candidates.slice(0, visibleCounts[group.id] ?? 3) as candidate (candidate.id)}
								<label
									class="flex min-h-11 min-w-0 cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-left {selectedProducts[group.id] === candidate.id
										? 'border-primary bg-primary/8'
										: 'border-base-300/70 bg-base-100/45'}"
								>
									<input
										type="radio"
										class="radio radio-sm mt-0.5 shrink-0"
										name={`recipe-product-${group.id}`}
										value={candidate.id}
										checked={selectedProducts[group.id] === candidate.id}
										onchange={() => setProduct(group.id, candidate.id)}
									/>
									<span class="min-w-0 text-xs">
										<span class="block font-semibold">{candidate.formLabel}</span>
										<span class="mt-0.5 block break-words">{candidate.productName}</span>
										<span class="mt-0.5 block text-base-content/55">
											{candidate.packageSize ?? m.recipe_patch_size_unknown()}
											{#if candidate.price != null} · €{candidate.price.toFixed(2)}{/if}
										</span>
										{#if candidate.distinction}
											<span class="mt-1 block text-base-content/60">{candidate.distinction}</span>
										{/if}
									</span>
								</label>
							{/each}
						</div>
						<div
							class="mt-1 flex-wrap items-center gap-2 {activeProductGroup === group.id
								? 'flex'
								: 'hidden md:flex'}"
						>
							{#if (visibleCounts[group.id] ?? 3) < group.candidates.length}
								<button
									type="button"
									class="min-h-11 text-xs font-medium text-primary"
									onclick={() =>
										(visibleCounts[group.id] = Math.min(
											group.candidates.length,
											(visibleCounts[group.id] ?? 3) + 3
										))}
								>
									{m.recipe_product_show_more()}
								</button>
							{:else if onFindDifferent}
								<button
									type="button"
									class="min-h-11 text-xs font-medium text-primary"
									disabled={findingGroup !== null}
									onclick={() => findDifferent(group.id, group.label)}
								>
									{#if findingGroup === group.id}<Spinner size="xs" />{/if}
									{m.recipe_product_find_different()}
								</button>
							{/if}
							{#if selectedProducts[group.id]}
								<button
									type="button"
									class="min-h-11 text-xs text-base-content/60"
									onclick={() => clearProduct(group.id)}
								>
									{m.recipe_product_clear_choice()}
								</button>
							{/if}
						</div>
					</fieldset>
				{/each}
			</div>
		{/if}

		<footer class="mt-3 flex items-center justify-between gap-3">
			<span class="text-xs text-base-content/55">
				{m.recipe_product_selected_summary({ count: selectedCount })}
			</span>
			<button
				type="button"
				class="btn btn-primary btn-sm min-h-11"
				disabled={applyState === 'applying' || selectedCount === 0}
				onclick={apply}
			>
				{#if applyState === 'applying'}<Spinner size="xs" />{/if}
				{m.recipe_enhance_apply()}
			</button>
		</footer>
	{/if}
</section>
