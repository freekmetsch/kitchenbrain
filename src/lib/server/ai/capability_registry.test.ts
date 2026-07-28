import { describe, expect, it } from 'vitest';
import { tools } from './tools';
import {
	ASSISTANT_CAPABILITIES,
	assertCapabilityRegistryComplete,
	isPersistentCapability
} from './capability_registry';

describe('assistant capability registry', () => {
	it('registers every exposed tool exactly once with its consequence contract', () => {
		const names = tools.map((tool) => tool.name);
		const exposedCapabilities = Object.entries(ASSISTANT_CAPABILITIES)
			.filter(([, capability]) => capability.exposed !== false)
			.map(([name]) => name);

		expect(() => assertCapabilityRegistryComplete(names)).not.toThrow();
		expect(exposedCapabilities.sort()).toEqual([...names].sort());
		for (const capability of Object.values(ASSISTANT_CAPABILITIES)) {
			expect(capability).toMatchObject({
				domain: expect.any(String),
				access: expect.stringMatching(/^(read|write|proposal)$/),
				currentRead: expect.stringMatching(/^(none|target|conditional)$/),
				confirmation: expect.stringMatching(
					/^(none|risk-based|always-review|external-final)$/
				),
				undo: expect.stringMatching(/^(none|inventory-op|atomic-batch|compensating)$/),
				externalEffect: expect.stringMatching(/^(none|ah-read|ah-basket)$/),
				display: expect.stringMatching(/^(read|write|confirm|proposal|plan)$/)
			});
		}
	});

	it('makes persistence a registry fact instead of a second hand-maintained set', () => {
		expect(isPersistentCapability('get_inventory')).toBe(false);
		expect(isPersistentCapability('propose_recipe_patch')).toBe(false);
		expect(isPersistentCapability('plan_meal')).toBe(true);
		expect(isPersistentCapability('generate_shopping_list')).toBe(true);
		expect(tools.map((tool) => tool.name)).not.toContain('plan_meal');
		expect(tools.map((tool) => tool.name)).not.toContain('remove_meal');
	});

	it('fails closed when a tool is missing or an orphan registry row remains', () => {
		const names = tools.map((tool) => tool.name);
		expect(() => assertCapabilityRegistryComplete(names.slice(1))).toThrow(/registry mismatch/i);
		expect(() => assertCapabilityRegistryComplete([...names, 'unregistered_tool'])).toThrow(
			/registry mismatch/i
		);
	});
});
