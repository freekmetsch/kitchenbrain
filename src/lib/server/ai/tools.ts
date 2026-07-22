import type Anthropic from '@anthropic-ai/sdk';

export const tools: Anthropic.Tool[] = [
	{
		name: 'get_inventory',
		description:
			'Query inventory items. Filter by section (freezer/pantry), canonical category/type, expiring soon, or older entry date.',
		input_schema: {
			type: 'object',
			properties: {
				section: { type: 'string', enum: ['freezer', 'pantry'], description: 'Filter by storage section' },
				category: {
					type: 'string',
					description: 'Canonical food category/type, e.g. meat, fish, vegetarian, vegan, other'
				},
				expiring_within_days: { type: 'number', description: 'Only items expiring within N days' },
				added_before_days: {
					type: 'number',
					description: 'Only items entered into the system at least N days ago'
				},
				sort: {
					type: 'string',
					enum: ['name', 'oldest_added', 'newest_added'],
					description: 'Optional sort order'
				}
			},
			required: []
		}
	},
	{
		name: 'add_to_inventory',
		description: 'Add an item to the freezer or pantry.',
		input_schema: {
			type: 'object',
			properties: {
				name: { type: 'string' },
				section: { type: 'string', enum: ['freezer', 'pantry'] },
				qty_text: { type: 'string', description: 'Human-readable qty e.g. "3 stuks", "500g"' },
				qty_num: { type: 'number', description: 'Numeric quantity' },
				unit: { type: 'string', description: 'g, stuks, blik, pak, etc.' },
				category: {
					type: 'string',
					description: 'Canonical food category/type; always set when inferable: meat, fish, vegetarian, vegan, other'
				},
				kind: {
					type: 'string',
					enum: ['ingredient', 'leftover', 'processed'],
					description:
						'What the item is: ingredient (raw, goes into cooking), leftover (frozen portion of a cooked dish), processed (ready-made product)'
				},
				food_class: {
					type: 'string',
					description:
						'Specific food class, e.g. chicken, beef, pork, fish, vegetarian, vegan, or a broader meat/fish/vegetarian/other; used for the inventory shelves + filters'
				},
				made_from_recipe_id: {
					type: 'number',
					description:
						'For a leftover: the id of the recipe it was cooked from. Sets the link (kind becomes leftover, unit becomes portion). Use qty_num for the portion count.'
				},
				is_staple: {
					type: 'boolean',
					description:
						'Pantry staple — always kept on hand, excluded from generated shopping lists by default'
				},
				expiry_date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
				created_at: {
					type: 'string',
					description: 'Entry date in the system, ISO date YYYY-MM-DD. Defaults to today.'
				}
			},
			required: ['name', 'section']
		}
	},
	{
		name: 'remove_from_inventory',
		description: 'Remove an item from inventory by id or fuzzy name match.',
		input_schema: {
			type: 'object',
			properties: {
				id: { type: 'number', description: 'Item id (preferred if known)' },
				name: { type: 'string', description: 'Name match when id unknown' },
				section: { type: 'string', enum: ['freezer', 'pantry'], description: 'Narrows name search' }
			},
			required: []
		}
	},
	{
		name: 'update_inventory_item',
		description:
			'Update qty, entry date, expiry date, canonical category/type, or storage section (move between freezer/pantry) on an existing item.',
		input_schema: {
			type: 'object',
			properties: {
				id: { type: 'number' },
				qty_text: { type: 'string' },
				qty_num: { type: 'number' },
				unit: { type: 'string' },
				section: {
					type: 'string',
					enum: ['freezer', 'pantry'],
					description: 'Move the item to this section'
				},
				expiry_date: { type: 'string', description: 'ISO date, null to clear' },
				created_at: { type: 'string', description: 'Entry date in the system, ISO date YYYY-MM-DD' },
				category: {
					type: 'string',
					description: 'Canonical food category/type; use meat, fish, vegetarian, vegan, other for stock'
				},
				kind: {
					type: 'string',
					enum: ['ingredient', 'leftover', 'processed'],
					description:
						'What the item is: ingredient (raw, goes into cooking), leftover (frozen portion of a cooked dish), processed (ready-made product)'
				},
				food_class: {
					type: 'string',
					description:
						'Specific food class, e.g. chicken, beef, pork, fish, vegetarian, vegan, or a broader meat/fish/vegetarian/other; used for the inventory shelves + filters'
				}
			},
			required: ['id']
		}
	},
	{
		name: 'bulk_update_inventory',
		description:
			'Update MANY inventory items in one call — use this instead of many update_inventory_item calls when reclassifying or fixing several items at once (e.g. cleaning up the whole freezer). Each entry needs an id plus the fields to change; every item is updated and undoable individually. Prefer this for any change touching 3+ items.',
		input_schema: {
			type: 'object',
			properties: {
				updates: {
					type: 'array',
					minItems: 1,
					maxItems: 100,
					description: 'One entry per item to change. Only the fields you set are updated.',
					items: {
						type: 'object',
						properties: {
							id: { type: 'number', description: 'Inventory item id (required)' },
							qty_text: { type: 'string' },
							qty_num: { type: 'number' },
							unit: { type: 'string', description: 'g, stuks, blik, pak, portie, etc.' },
							section: {
								type: 'string',
								enum: ['freezer', 'pantry'],
								description: 'Move the item to this section'
							},
							expiry_date: { type: 'string', description: 'ISO date YYYY-MM-DD, null to clear' },
							created_at: { type: 'string', description: 'Entry date, ISO date YYYY-MM-DD' },
							category: {
								type: 'string',
								description: 'Canonical food category/type: meat, fish, vegetarian, vegan, other'
							},
							kind: {
								type: 'string',
								enum: ['ingredient', 'leftover', 'processed'],
								description: 'ingredient (raw), leftover (frozen cooked portion), processed (ready-made)'
							},
							food_class: {
								type: 'string',
								description: 'Specific food class, e.g. chicken, beef, pork, fish, vegetarian, vegan'
							},
							is_staple: { type: 'boolean', description: 'Pantry staple flag' }
						},
						required: ['id']
					}
				}
			},
			required: ['updates']
		}
	},
	{
		name: 'get_meal_plan',
		description: 'Get planned meals. Returns current and upcoming weeks by default.',
		input_schema: {
			type: 'object',
			properties: {
				weeks: { type: 'number', description: 'Number of upcoming weeks to return (default 2)' },
				week_start_date: { type: 'string', description: 'ISO date inside the planning week to fetch' }
			},
			required: []
		}
	},
	{
		name: 'plan_meal',
		description:
			'Add a dinner to a specific week in the meal plan. When frozen portions of the recipe are on hand and the user wants to use them, set source to freezer — the shopping list then only includes the recipe\'s serve_fresh sides for that meal.',
		input_schema: {
			type: 'object',
			properties: {
				week_start_date: { type: 'string', description: 'ISO date inside the target planning week' },
				dinner: { type: 'string' },
				recipe_slug: { type: 'string', description: 'Optional: link to a recipe by slug' },
				servings: {
					type: 'number',
					description: 'Portions for this occasion. Defaults to the linked recipe yield when omitted.'
				},
				source: {
					type: 'string',
					enum: ['fresh', 'freezer'],
					description:
						'fresh (default) = cook the recipe that week; freezer = serve stocked frozen portions (requires recipe_slug; only serve_fresh sides get shopped)'
				},
				note: { type: 'string' }
			},
			required: ['week_start_date', 'dinner']
		}
	},
	{
		name: 'remove_meal',
		description: 'Remove a planned dinner from the meal plan.',
		input_schema: {
			type: 'object',
			properties: {
				id: { type: 'number' }
			},
			required: ['id']
		}
	},
	{
		name: 'mark_meal_cooked',
		description:
			'Mark a planned meal as cooked and record the date. For a meal planned with source=freezer the result reminds you to deduct the eaten portions from the linked freezer leftover (use update_inventory_item / remove_from_inventory after confirming how many portions were eaten).',
		input_schema: {
			type: 'object',
			properties: {
				id: { type: 'number' },
				cooked_date: { type: 'string', description: 'ISO date, defaults to today' }
			},
			required: ['id']
		}
	},
	{
		name: 'suggest_meals',
		description: 'Returns inventory, recent meal history, and recipe catalog to support meal suggestions.',
		input_schema: {
			type: 'object',
			properties: {
				week_start_date: { type: 'string', description: 'ISO date inside the target planning week' },
				count: { type: 'number', description: 'Number of suggestions desired (default 5)' }
			},
			required: []
		}
	},
	{
		name: 'get_recipe',
		description: 'Look up a recipe by slug or name.',
		input_schema: {
			type: 'object',
			properties: {
				slug: { type: 'string' },
				name: { type: 'string', description: 'Partial name match if slug unknown' }
			},
			required: []
		}
	},
	{
		name: 'search_recipes',
		description: 'Search recipes by free text, ingredient, or canonical category/type.',
		input_schema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Free text search on recipe title' },
				category: {
					type: 'string',
					description:
						'Canonical recipe category/type, e.g. meat, fish, vegetarian, vegan, soup, salad, pasta, pizza, dessert, breakfast, side, sauce, snack, other'
				},
				ingredient: { type: 'string', description: 'Ingredient name (partial match)' }
			},
			required: []
		}
	},
	{
		name: 'create_meal_recipe',
		description:
			'Combine 2+ existing recipes into a Meal Recipe (e.g. taco night = guacamole + salsa + taco meat). The meal becomes a normal recipe that can be planned, cooked, and shopped; the sub-recipes stay standalone and their edits keep propagating. Use slugs from search_recipes or get_recipe.',
		input_schema: {
			type: 'object',
			properties: {
				title: { type: 'string', description: 'Meal name, e.g. "Taco night"' },
				sub_recipe_slugs: {
					type: 'array',
					items: { type: 'string' },
					description: 'Slugs of 2 or more existing recipes to combine'
				}
			},
			required: ['title', 'sub_recipe_slugs']
		}
	},
	{
		name: 'generate_shopping_list',
		description:
			'Generate a shopping list: planned meal ingredients minus current inventory. Freezer-planned meals contribute only their serve_fresh sides; freezer meals whose recipe lacks ingredient roles are reported so you can offer to set them.',
		input_schema: {
			type: 'object',
			properties: {
				week_start_date: { type: 'string', description: 'ISO date inside the target planning week. Defaults to the current planning week.' }
			},
			required: []
		}
	},
	{
		name: 'add_recipe',
		description: 'Save a new recipe to the catalog.',
		input_schema: {
			type: 'object',
			properties: {
				title: { type: 'string' },
				slug: { type: 'string', description: 'URL-safe unique identifier' },
				category: {
					type: 'string',
					description:
						'Canonical recipe category/type; always set when inferable: meat, fish, vegetarian, vegan, soup, salad, pasta, pizza, dessert, breakfast, side, sauce, snack, other'
				},
				servings: { type: 'number' },
				total_time_min: { type: 'number' },
				ingredients: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							name: { type: 'string' },
							amount: { type: 'string' },
							unit: { type: 'string' },
							preparation: { type: 'string', description: 'Preparation detail, kept separate from the Dutch product name' },
							optional: { type: 'boolean', description: 'True only when the ingredient is not required' },
							component: { type: 'string', description: 'Optional recipe section such as sauce or garnish' },
							purchaseForm: { type: 'string', enum: ['fresh', 'preserved', 'frozen', 'dried', 'any'] },
							scale: { type: 'string', enum: ['linear', 'whole', 'fixed'] },
							origin: {
								type: 'string',
								enum: ['source', 'ai_suggested'],
								description: 'AI-suggested sides must use ai_suggested and optional=true'
							},
							substitutes: {
								type: 'array',
								description:
									'Optional practical alternatives for this ingredient. Names stay Dutch. Suggest only plausible swaps and include a short caution/use note when cooking behavior changes.',
								items: {
									type: 'object',
									properties: {
										name: { type: 'string' },
										kind: { type: 'string', enum: ['protein', 'spice', 'vegetable', 'other'] },
										note: { type: 'string' }
									},
									required: ['name']
								}
							},
							role: {
								type: 'string',
								enum: ['cook_in', 'serve_fresh'],
								description:
									'cook_in = ends up in the frozen leftover; serve_fresh = bought fresh the week it is eaten'
							}
						},
							required: ['name', 'amount', 'role', 'optional', 'purchaseForm', 'scale', 'origin']
					}
				},
				directions: { type: 'array', items: { type: 'string' } },
				notes: { type: 'string' },
				source_url: { type: 'string' },
				needs_review: {
					type: 'boolean',
					description:
						'Flag the recipe for review when structuring from low-confidence input (pasted/dictated text with unclear quantities, uncertain servings, or missing steps). Prefer flagging over silently guessing.'
				},
				review_reason: {
					type: 'string',
					description: 'Short note on what to double-check, used only when needs_review is true'
				}
			},
			required: ['title', 'slug', 'ingredients', 'directions']
		}
	},
	{
		name: 'edit_recipe',
		description:
			'Edit a recipe: add/remove ingredients, update steps, change servings, set ingredient roles, or save practical ingredient substitutes.',
		input_schema: {
			type: 'object',
			properties: {
				slug: { type: 'string' },
				servings: { type: 'number' },
				add_ingredients: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							name: { type: 'string' },
							amount: { type: 'string' },
							unit: { type: 'string' },
							preparation: { type: 'string', description: 'Preparation detail, kept separate from the Dutch product name' },
							optional: { type: 'boolean', description: 'True only when the ingredient is not required' },
							component: { type: 'string', description: 'Optional recipe section such as sauce or garnish' },
							purchaseForm: { type: 'string', enum: ['fresh', 'preserved', 'frozen', 'dried', 'any'] },
							scale: { type: 'string', enum: ['linear', 'whole', 'fixed'] },
							origin: {
								type: 'string',
								enum: ['source', 'ai_suggested'],
								description: 'AI-suggested sides must use ai_suggested and optional=true'
							},
							substitutes: {
								type: 'array',
								description: 'Optional Dutch-named ingredient alternatives.',
								items: {
									type: 'object',
									properties: {
										name: { type: 'string' },
										kind: { type: 'string', enum: ['protein', 'spice', 'vegetable', 'other'] },
										note: { type: 'string' }
									},
									required: ['name']
								}
							},
							role: {
								type: 'string',
								enum: ['cook_in', 'serve_fresh'],
								description:
									'cook_in = ends up in the frozen leftover; serve_fresh = bought fresh the week it is eaten'
							}
						},
							required: ['name', 'amount', 'role', 'optional', 'purchaseForm', 'scale', 'origin']
					}
				},
				remove_ingredient_names: { type: 'array', items: { type: 'string' } },
				set_ingredient_roles: {
					type: 'array',
					description:
						"Set the cook_in / serve_fresh role on existing ingredients. Reference each ingredient by its stored (Dutch) name. If a name matches more than one ingredient the recipe is flagged for review instead of guessing.",
					items: {
						type: 'object',
						properties: {
							name: { type: 'string', description: "Ingredient name as stored on the recipe (Dutch)" },
							role: {
								type: 'string',
								enum: ['cook_in', 'serve_fresh'],
								description: 'cook_in = ends up in the frozen leftover; serve_fresh = bought fresh the week it is eaten'
							}
						},
						required: ['name', 'role']
					}
				},
				set_ingredient_substitutes: {
					type: 'array',
					description:
						'Replace the saved alternatives for existing ingredients. Match each ingredient by its stored Dutch name. Use an empty substitutes array to clear them.',
					items: {
						type: 'object',
						properties: {
							name: { type: 'string', description: 'Ingredient name as stored on the recipe (Dutch)' },
							substitutes: {
								type: 'array',
								items: {
									type: 'object',
									properties: {
										name: { type: 'string', description: 'Dutch substitute name' },
										kind: { type: 'string', enum: ['protein', 'spice', 'vegetable', 'other'] },
										note: { type: 'string', description: 'Short practical use/caution note' }
									},
									required: ['name']
								}
							}
						},
						required: ['name', 'substitutes']
					}
				},
				directions: { type: 'array', items: { type: 'string' } },
				notes: { type: 'string' }
			},
			required: ['slug']
		}
	},
	{
		name: 'add_recipe_from_url',
		description:
			'Import a recipe from a web URL into the catalog. Fetches the page, extracts it (structured data or AI), keeps ingredient names Dutch (the Albert Heijn lookup key), and flags the recipe for review when fields are missing. Use when the user shares a recipe link or asks to save one.',
		input_schema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'The recipe page URL' }
			},
			required: ['url']
		}
	},
	{
		name: 'log_meal',
		description: 'Record a cooked meal with optional rating.',
		input_schema: {
			type: 'object',
			properties: {
				date: { type: 'string', description: 'ISO date, defaults to today' },
				recipe_slug: { type: 'string' },
				meal_name: { type: 'string', description: 'Free-text name if no recipe slug' },
				rating: { type: 'number', description: '1-5 stars' },
				notes: { type: 'string' }
			},
			required: []
		}
	},
	{
		name: 'link_leftover_recipe',
		description:
			'Link a leftover inventory item to the recipe it was cooked from, or set its recipe status. Marks the item kind=leftover. Use status="linked" with recipe_slug/recipe_id to link, "plan_to_add" to note a recipe should be added later, or "no_recipe" to dismiss the missing-recipe nudge for a leftover that needs no recipe.',
		input_schema: {
			type: 'object',
			properties: {
				item_id: { type: 'number', description: 'The leftover inventory item id' },
				recipe_slug: { type: 'string', description: 'Recipe to link (preferred over id)' },
				recipe_id: { type: 'number', description: 'Recipe id to link, if slug unknown' },
				status: {
					type: 'string',
					enum: ['linked', 'plan_to_add', 'no_recipe'],
					description: 'Defaults to "linked" when a recipe is given'
				}
			},
			required: ['item_id']
		}
	},
	{
		name: 'set_staple',
		description:
			'Mark or unmark a pantry inventory item as a staple (always kept on hand, excluded from generated shopping lists by default).',
		input_schema: {
			type: 'object',
			properties: {
				item_id: { type: 'number' },
				is_staple: { type: 'boolean' }
			},
			required: ['item_id', 'is_staple']
		}
	},
	{
		name: 'set_freezer_staple',
		description:
			'Mark a recipe as a freezer staple with a target frozen-portion count, or clear it. When frozen stock is below target you can suggest batch-cooking — never auto-plan it.',
		input_schema: {
			type: 'object',
			properties: {
				slug: { type: 'string' },
				is_freezer_staple: { type: 'boolean' },
				target_portions: {
					type: 'number',
					description: 'Desired frozen portions to keep on hand'
				}
			},
			required: ['slug', 'is_freezer_staple']
		}
	},
	{
		name: 'get_freezer_staples',
		description:
			'List recipes marked as freezer staples with their target vs current frozen portions on hand. Use to surface below-target batch-cook suggestions (informational only).',
		input_schema: { type: 'object', properties: {}, required: [] }
	},
	{
		name: 'set_review_flag',
		description:
			"Flag an inventory item for review (with a reason) or resolve its existing review flag. Use to clear the review dot on an item once it's sorted, or to raise a review when something looks off.",
		input_schema: {
			type: 'object',
			properties: {
				item_id: { type: 'number' },
				flagged: {
					type: 'boolean',
					description: 'true to flag for review, false to resolve/clear the flag'
				},
				reason: {
					type: 'string',
					description: 'Short reason, used only when flagging (flagged=true)'
				}
			},
			required: ['item_id', 'flagged']
		}
	},
	{
		name: 'get_inventory_history',
		description:
			'Recent inventory changes (who changed what, when) as a timeline. Pass item_id to scope to one item. Use when the user asks what changed, or to find the op_id to undo.',
		input_schema: {
			type: 'object',
			properties: {
				item_id: { type: 'number', description: 'Scope to a single item' },
				limit: { type: 'number', description: 'Max entries (default 20, max 200)' }
			},
			required: []
		}
	},
	{
		name: 'undo_op',
		description:
			'Undo a specific past inventory change by its op_id (from get_inventory_history), applying a compensating op. Refuses with a conflict if the item drifted since — it flags the item for review instead of overwriting. Alternatively pass item_id to undo the latest removal of that item.',
		input_schema: {
			type: 'object',
			properties: {
				op_id: { type: 'number', description: 'History op id to undo (preferred)' },
				item_id: { type: 'number', description: 'Undo the latest removal of this item, if op_id unknown' }
			},
			required: []
		}
	},
	{
		name: 'present_plan',
		description:
			'Show the user a short ordered checklist of the steps you are about to take, BEFORE executing them. Use for batch or multi-step requests (e.g. stocking several freezer items, a multi-part edit). Then carry out the steps with the other tools. Do not use for a single action or a plain question.',
		input_schema: {
			type: 'object',
			properties: {
				title: { type: 'string', description: 'Optional short heading, e.g. "Stocking the freezer"' },
				steps: {
					type: 'array',
					items: { type: 'string' },
					minItems: 1,
					maxItems: 12,
					description: 'Ordered, user-facing step labels (2–8 short lines)'
				}
			},
			required: ['steps']
		}
	}
];
