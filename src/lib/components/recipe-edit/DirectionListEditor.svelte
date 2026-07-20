<script lang="ts">
	import { tick } from 'svelte';
	import Icon from '$lib/components/ui/icons/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { createRecipeEditId, type DirectionDraft } from '$lib/recipe_edit';

	let { directions = $bindable<DirectionDraft[]>() }: { directions: DirectionDraft[] } = $props();
	let addButton: HTMLButtonElement | null = $state(null);

	async function focusSelector(selector: string) {
		await tick();
		const control = document.querySelector<HTMLElement>(selector);
		control?.scrollIntoView({ block: 'center' });
		control?.focus();
	}

	function addDirection() {
		const clientId = createRecipeEditId('direction');
		directions = [...directions, { clientId, text: '' }];
		void focusSelector(`[data-direction-id="${clientId}"] textarea`);
	}

	function removeDirection(index: number) {
		const focusId = directions[index + 1]?.clientId ?? directions[index - 1]?.clientId;
		directions = directions.filter((_, itemIndex) => itemIndex !== index);
		if (focusId) void focusSelector(`[data-direction-id="${focusId}"] textarea`);
		else void tick().then(() => addButton?.focus());
	}

	function moveDirection(index: number, delta: number) {
		const targetIndex = index + delta;
		if (targetIndex < 0 || targetIndex >= directions.length) return;
		const clientId = directions[index].clientId;
		const next = [...directions];
		[next[index], next[targetIndex]] = [next[targetIndex], next[index]];
		directions = next;
		void focusSelector(`[data-direction-id="${clientId}"] [data-move-direction="${delta}"]`);
	}
</script>

<section class="ui-form-card !p-3" aria-labelledby="directions-heading">
	<div class="mb-2 flex flex-wrap items-baseline gap-2">
		<h2 id="directions-heading" class="ui-section-label">{m.recipes_edit_directions_label()}</h2>
		<span class="text-[11px] text-base-content/50">{m.recipes_edit_directions_hint()}</span>
		<button
			bind:this={addButton}
			type="button"
			class="btn btn-xs btn-ghost ml-auto min-h-9 border border-base-300"
			onclick={addDirection}>{m.recipes_edit_add_step_button()}</button
		>
	</div>
	<ol class="space-y-2.5">
		{#each directions as direction, index (direction.clientId)}
			<li class="min-w-0" data-direction-id={direction.clientId}>
				<div class="mb-1 flex items-center gap-1">
					<span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-content">
						{index + 1}
					</span>
					<div class="ml-auto flex gap-1">
						<button
							type="button"
							data-move-direction="-1"
							class="btn btn-sm btn-ghost h-9 min-h-9 min-w-9 px-2"
							aria-label={m.recipes_edit_move_up_aria()}
							disabled={index === 0}
							onclick={() => moveDirection(index, -1)}>↑</button
						>
						<button
							type="button"
							data-move-direction="1"
							class="btn btn-sm btn-ghost h-9 min-h-9 min-w-9 px-2"
							aria-label={m.recipes_edit_move_down_aria()}
							disabled={index === directions.length - 1}
							onclick={() => moveDirection(index, 1)}>↓</button
						>
						<button
							type="button"
							class="btn btn-sm btn-ghost h-9 min-h-9 min-w-9 px-2 text-error"
							aria-label={m.recipes_edit_remove_direction_aria()}
							onclick={() => removeDirection(index)}><Icon name="x" class="h-4 w-4" /></button
						>
					</div>
				</div>
					<textarea
						bind:value={direction.text}
						rows="2"
						aria-label={m.recipes_edit_direction_aria({ number: index + 1 })}
						class="textarea textarea-bordered textarea-sm w-full min-w-0 leading-snug"
						placeholder={m.recipes_edit_direction_placeholder()}
					></textarea>
			</li>
		{/each}
	</ol>
</section>
