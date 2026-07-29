import type Anthropic from '@anthropic-ai/sdk';

export const tools: Anthropic.Tool[] = [
	{
		name: 'get_inventory',
		description:
			'Query inventory items. Filter by section (freezer/fridge/pantry), canonical category/type, expiring soon, or older entry date.',
		input_schema: {
			type: 'object',
			properties: {
				section: { type: 'string', enum: ['freezer', 'fridge', 'pantry'], description: 'Filter by storage section' },
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
		description: 'Add an item to the freezer, fridge, or pantry.',
		input_schema: {
			type: 'object',
			properties: {
				name: { type: 'string' },
				section: { type: 'string', enum: ['freezer', 'fridge', 'pantry'] },
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
				section: { type: 'string', enum: ['freezer', 'fridge', 'pantry'], description: 'Narrows name search' }
			},
			required: []
		}
	},
	{
		name: 'update_inventory_item',
		description:
			'Update qty, entry date, expiry date, canonical category/type, or storage section (freezer/fridge/pantry) on an existing item.',
		input_schema: {
			type: 'object',
			properties: {
				id: { type: 'number' },
				qty_text: { type: 'string' },
				qty_num: { type: 'number' },
				unit: { type: 'string' },
				section: {
					type: 'string',
					enum: ['freezer', 'fridge', 'pantry'],
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
			'Propose one atomic update for 2-10 inventory items. The user reviews every row before anything is written; approval commits all rows or none and exposes Undo all.',
		input_schema: {
			type: 'object',
			properties: {
				updates: {
					type: 'array',
					minItems: 2,
					maxItems: 10,
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
								enum: ['freezer', 'fridge', 'pantry'],
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
		description:
			'Get planned meals. Returns current and upcoming weeks by default. Set include_missed=true when the user asks to move, drop, keep, or review uncooked past meals.',
		input_schema: {
			type: 'object',
			properties: {
				weeks: { type: 'number', description: 'Number of upcoming weeks to return (default 2)' },
				week_start_date: { type: 'string', description: 'ISO date inside the planning week to fetch' },
				include_missed: {
					type: 'boolean',
					description:
						'Also return planned meals whose date has passed or whose undated planning week is before the current week'
				}
			},
			required: []
		}
	},
	{
		name: 'prepare_cooking_action',
		description:
			'Prepare one reviewed after-cook, timer, rescue, or defrost action. Writes nothing.',
		input_schema: {
			type: 'object',
			properties: {
				action: {
					type: 'string',
					enum: ['after_cook', 'timer', 'rescue', 'defrost']
				},
				meal_id: { type: 'number' },
				cooked_date: { type: 'string' },
				eaten_portions: { type: 'number' },
				timer_operation: {
					type: 'string',
					enum: ['start', 'extend', 'rename', 'cancel']
				},
				seconds: { type: 'number' },
				label: { type: 'string' },
				target_label: { type: 'string' },
				recipe_slug: { type: 'string' },
				step_index: { type: 'number' },
				issue: {
					type: 'string',
					enum: ['too_salty', 'too_thin', 'not_browning']
				},
				inventory_id: { type: 'number' },
				reminder_seconds: { type: 'number' }
			},
			required: ['action']
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
		name: 'propose_meal_plan',
		description:
			'Stage one adjustable meal-plan review after reading the target week and relevant recipes. This writes nothing. Include all add/update/remove operations and only recommendation context grounded in those reads; omit optional context rather than inventing filler. The user chooses rows before one atomic apply; Shopping reconciliation commits in the same transaction.',
		input_schema: {
			type: 'object',
			properties: {
				week_start_date: {
					type: 'string',
					description: 'ISO date inside the target planning week'
				},
				title: { type: 'string' },
				recommendation: {
					type: 'object',
					properties: {
						why_now: { type: 'string' },
						evidence: {
							type: 'array',
							maxItems: 12,
							items: { type: 'string' }
						},
						confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
						uncertainty: {
							type: ['string', 'null'],
							description: 'What remains unknown; null only when no material uncertainty remains'
						},
						consequence: { type: 'string' },
						alternatives: {
							type: 'array',
							maxItems: 8,
							items: { type: 'string' }
						}
					},
					required: []
				},
				operations: {
					type: 'array',
					minItems: 1,
					maxItems: 14,
					items: {
						oneOf: [
							{
								type: 'object',
								properties: {
									kind: { type: 'string', enum: ['add'] },
									dinner: { type: 'string' },
									recipe_slug: { type: ['string', 'null'] },
									planned_date: { type: ['string', 'null'] },
									servings: { type: ['number', 'null'] },
									source: { type: 'string', enum: ['fresh', 'freezer'] },
									note: { type: ['string', 'null'] },
									reason: { type: 'string' }
								},
								required: [
									'kind',
									'dinner',
									'recipe_slug',
									'planned_date',
									'servings',
									'source',
									'note',
									'reason'
								]
							},
							{
								type: 'object',
								properties: {
									kind: { type: 'string', enum: ['update'] },
									meal_id: { type: 'number' },
									changes: {
										type: 'object',
										properties: {
											week_start_date: { type: 'string' },
											dinner: { type: 'string' },
											recipe_slug: { type: ['string', 'null'] },
											planned_date: { type: ['string', 'null'] },
											servings: { type: ['number', 'null'] },
											source: { type: 'string', enum: ['fresh', 'freezer'] },
											note: { type: ['string', 'null'] }
										},
										required: []
									},
									reason: { type: 'string' }
								},
								required: ['kind', 'meal_id', 'changes', 'reason']
							},
							{
								type: 'object',
								properties: {
									kind: { type: 'string', enum: ['remove'] },
									meal_id: { type: 'number' },
									reason: { type: 'string' }
								},
								required: ['kind', 'meal_id', 'reason']
							}
						]
					}
				}
			},
			required: ['week_start_date', 'title', 'recommendation', 'operations']
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
		name: 'search_ah_products',
		description:
			'Read-only live Albert Heijn product search. Send 1-5 Dutch product queries. Returns at most 5 products per query with current package size and price evidence. Never adds anything to a basket or shopping list. If unavailable, say the AH package size could not be verified.',
		input_schema: {
			type: 'object',
			properties: {
				queries: {
					type: 'array',
					minItems: 1,
					maxItems: 5,
					items: { type: 'string' },
					description: 'Dutch product names only, e.g. "kikkererwten blik" or "verse koriander"'
				}
			},
			required: ['queries']
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
		name: 'propose_recipe_patch',
		description:
			'Stage recipe corrections and/or three-to-nine distinct AH product-form choices for review. Never writes the recipe. Ingredient names stay Dutch. Use only opaque evidence_key values returned by search_ah_products in this turn; never send a product ID.',
		input_schema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				slug: { type: 'string' },
				operations: {
					type: 'array',
					minItems: 0,
					maxItems: 30,
					items: {
						oneOf: [
							{
								type: 'object',
								additionalProperties: false,
								properties: {
									kind: { type: 'string', enum: ['add_ingredient'] },
									after: {
										type: 'object',
										additionalProperties: false,
										properties: {
											name: { type: 'string' },
											amount: { type: 'string' },
											unit: { type: ['string', 'null'] },
											preparation: { type: ['string', 'null'] },
											role: { type: 'string', enum: ['cook_in', 'serve_fresh'] },
											optional: { type: 'boolean' },
											component: { type: ['string', 'null'] },
											purchaseForm: {
												type: 'string',
												enum: ['fresh', 'preserved', 'frozen', 'dried', 'any']
											},
											scale: { type: 'string', enum: ['linear', 'whole', 'fixed'] }
										},
										required: ['name', 'amount']
									},
									reason: { type: 'string' },
									evidence: {
										type: 'object',
										additionalProperties: false,
										properties: { evidence_key: { type: 'string' } },
										required: ['evidence_key']
									}
								},
								required: ['kind', 'after', 'reason']
							},
							{
								type: 'object',
								additionalProperties: false,
								properties: {
									kind: { type: 'string', enum: ['update_ingredient'] },
									ingredient_id: { type: 'string' },
									changes: {
										type: 'object',
										additionalProperties: false,
										properties: {
											amount: { type: 'string' },
											unit: { type: ['string', 'null'] },
											preparation: { type: ['string', 'null'] },
											role: {
												type: ['string', 'null'],
												enum: ['cook_in', 'serve_fresh', null]
											},
											optional: { type: 'boolean' }
										}
									},
									reason: { type: 'string' },
									evidence: {
										type: 'object',
										additionalProperties: false,
										properties: { evidence_key: { type: 'string' } },
										required: ['evidence_key']
									}
								},
								required: ['kind', 'ingredient_id', 'changes', 'reason']
							},
							{
								type: 'object',
								additionalProperties: false,
								properties: {
									kind: { type: 'string', enum: ['add_substitute'] },
									ingredient_id: { type: 'string' },
									after: {
										type: 'object',
										additionalProperties: false,
										properties: {
											name: { type: 'string' },
											kind: {
												type: 'string',
												enum: ['protein', 'spice', 'vegetable', 'other']
											},
											note: { type: 'string' }
										},
										required: ['name']
									},
									reason: { type: 'string' },
									evidence: {
										type: 'object',
										additionalProperties: false,
										properties: { evidence_key: { type: 'string' } },
										required: ['evidence_key']
									}
								},
								required: ['kind', 'ingredient_id', 'after', 'reason']
							},
							{
								type: 'object',
								additionalProperties: false,
								properties: {
									kind: { type: 'string', enum: ['recipe_field'] },
									field: { type: 'string', enum: ['servings', 'directions', 'notes'] },
									after: {
										description:
											'Servings number/null, directions string array, or notes string/null.'
									},
									reason: { type: 'string' }
								},
								required: ['kind', 'field', 'after', 'reason']
							}
						]
					}
				},
				product_choices: {
					type: 'array',
					minItems: 0,
					maxItems: 10,
					items: {
						type: 'object',
						additionalProperties: false,
						properties: {
							ingredient_id: {
								type: 'string',
								description: 'Stable ingredient ID returned by get_recipe'
							},
							reason: { type: 'string' },
							candidates: {
								type: 'array',
								minItems: 3,
								maxItems: 9,
								items: {
									type: 'object',
									additionalProperties: false,
									properties: {
										evidence_key: { type: 'string' },
										form_label: {
											type: 'string',
											description:
												'Canonical purchase-form category, e.g. whole block, freshly grated, or grated powder. Products with the same form must use the same label regardless of brand, size, cultivar, or marketing wording, and cannot both be candidates.'
										},
										distinction: {
											type: 'string',
											description: 'Optional one-line comparison of use, texture, or convenience'
										}
									},
									required: ['evidence_key', 'form_label']
								}
							}
						},
						required: ['ingredient_id', 'reason', 'candidates']
					}
				}
			},
			required: ['slug', 'operations', 'product_choices']
		}
	},
	{
		name: 'edit_recipe',
		description:
			'Set cook-in/serve-fresh roles on existing recipe ingredients by stable ingredient ID. All other recipe content changes must use propose_recipe_patch for user review.',
		input_schema: {
			type: 'object',
			properties: {
				slug: { type: 'string' },
				set_ingredient_roles: {
					type: 'array',
					description:
						'Set cook_in / serve_fresh on existing ingredients using IDs returned by get_recipe.',
					items: {
						type: 'object',
						properties: {
							ingredient_id: { type: 'string', description: 'Stable ingredient id from get_recipe' },
							role: {
								type: 'string',
								enum: ['cook_in', 'serve_fresh'],
								description: 'cook_in = ends up in the frozen leftover; serve_fresh = bought fresh the week it is eaten'
							}
						},
						required: ['ingredient_id', 'role']
					}
				}
			},
			required: ['slug', 'set_ingredient_roles']
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
			'Undo one past inventory change by op_id, or an atomic confirmed batch by all of its op_ids. Refuses the whole operation if any item changed since. Use item_id only for the legacy latest-remove undo.',
		input_schema: {
			type: 'object',
			properties: {
				op_id: { type: 'number', description: 'History op id to undo (preferred)' },
				op_ids: {
					type: 'array',
					minItems: 2,
					maxItems: 10,
					items: { type: 'number' },
					description: 'Exact operation ids from one confirmed batch; undone all-or-nothing'
				},
				item_id: { type: 'number', description: 'Undo the latest removal of this item, if op_id unknown' }
			},
			required: []
		}
	},
	{
		name: 'prepare_stock_action',
		description:
			'Prepare one reviewed, atomic Stock + Shopping proposal. Use after get_inventory for “out of”/“used the last”, and directly for Shopping edits, bought-to-stock intake, grocery photo/voice intake, or pantry-target refills. For an explicit service request, call this instead of replying with a prose checklist. This only stages a card; nothing changes until the user applies it.',
		input_schema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				title: { type: 'string' },
				reason: { type: 'string', description: 'Why this proposal is useful now' },
				operations: {
					type: 'array',
					minItems: 1,
					maxItems: 30,
					items: {
						type: 'object',
						additionalProperties: false,
						properties: {
							kind: {
								type: 'string',
								enum: [
									'stock_replace',
									'par_refill',
									'shopping_add',
									'shopping_change',
									'bought_intake',
									'inventory_intake'
								]
							},
							item_id: { type: 'number' },
							item_ids: { type: 'array', maxItems: 30, items: { type: 'number' } },
							name: { type: 'string' },
							replacement_name: { type: 'string' },
							shopping_name: { type: 'string' },
							change: {
								type: 'string',
								enum: ['remove', 'mark_bought', 'set_quantity']
							},
							amount: { type: ['string', 'null'] },
							unit: { type: ['string', 'null'] },
							section: { type: 'string', enum: ['freezer', 'fridge', 'pantry'] },
							qty_num: { type: ['number', 'null'] },
							expiry_date: { type: ['string', 'null'] },
							items: {
								type: 'array',
								maxItems: 30,
								items: {
									type: 'object',
									properties: {
										name: { type: 'string' },
										section: { type: 'string', enum: ['freezer', 'fridge', 'pantry'] },
										qty_num: { type: ['number', 'null'] },
										unit: { type: ['string', 'null'] },
										expiry_date: { type: ['string', 'null'] }
									},
									required: ['name', 'section']
								}
							},
							reason: { type: 'string' }
						},
						required: ['kind', 'reason']
					}
				}
			},
			required: ['title', 'reason', 'operations']
		}
	}
];

function onlyTools(names: readonly string[]): Anthropic.Tool[] {
	const allowed = new Set(names);
	return tools.filter((tool) => allowed.has(tool.name));
}

export type AssistantToolRoute = {
	tools: Anthropic.Tool[];
	forcedToolName?: string;
};

function forcedSequence(
	toolNames: readonly string[],
	completedToolNames: readonly string[]
): AssistantToolRoute {
	const nextIndex = toolNames.findIndex((name) => !completedToolNames.includes(name));
	return nextIndex >= 0
		? {
				tools: onlyTools(toolNames.slice(0, nextIndex + 1)),
				forcedToolName: toolNames[nextIndex]
			}
		: { tools: [] };
}

/**
 * Route explicit service requests to the smallest capable pack. The consolidated
 * proposal owns its own current-state reads except for stock replacement, where
 * the model needs the authoritative inventory id before it can stage a row.
 */
export function assistantToolRoute(
	message: string,
	hasImages = false,
	priorToolNames: readonly string[] = [],
	completedToolNames: readonly string[] = []
): AssistantToolRoute {
	const normalized = message.toLocaleLowerCase('nl-NL');
	const stockReplacement =
		/\b(out of|used the last|last of)\b/.test(normalized) ||
		/\b(is op|zijn op|het laatste|de laatste)\b/.test(normalized);
	const intake =
		/\b(unpack|grocery haul|i bought|we bought|restock)\b/.test(normalized) ||
		/\b(uitpakken|boodschappen uitgepakt|ik heb .* gekocht|we hebben .* gekocht)\b/.test(normalized);
	const parRefill =
		/\b(par target|pantry target|refill (?:the )?pantry)\b/.test(normalized) ||
		/\b(streefaantal|voorraaddoel|voorraad aanvullen)\b/.test(normalized);
	const freezerRefill =
		(/\b(?:freezer|frozen)\b/.test(normalized) &&
			/\b(?:refill|restock|targets?|batch[- ]cook)\b/.test(normalized)) ||
		(/\b(?:vriezer|diepvries)\b/.test(normalized) &&
			/\b(?:aanvullen|doelen?|batch)\b/.test(normalized));
	const mealPlanEdit =
		/\b(?:move|reschedule|replace)\b.*\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|meal|dinner)\b/.test(
			normalized
		) ||
		/\b(?:verplaats|verschuif|vervang)\b.*\b(?:maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|maaltijd)\b/.test(
			normalized
		) ||
		/\b(?:change|set|wijzig|zet)\b.*\b(?:servings|portions|porties|personen)\b/.test(normalized);
	const weekProposal =
		(/\b(?:next|coming) week\b/.test(normalized) &&
			/\b(?:dinners?|meals?|meal plan|plan)\b/.test(normalized)) ||
		(/\b(?:volgende|komende) week\b/.test(normalized) &&
			/\b(?:avondeten|maaltijden|weekmenu|plan)\b/.test(normalized));
	const tonightChoice =
		/\b(?:what should we eat|what can we eat).*\btonight\b/.test(normalized) ||
		/\b(?:wat eten we|wat zullen we eten).*\b(?:vanavond|vandaag)\b/.test(normalized);
	const missedMealRollover =
		(/\b(?:move|roll over|rollover|reschedule|handle|sort out|deal with)\b/.test(normalized) &&
			/\b(?:missed|uncooked|past)\b.*\b(?:meal|dinner)s?\b/.test(normalized)) ||
		(/\b(?:verplaats|schuif|verschuif|doorschuif|regel|ruim op)\b/.test(normalized) &&
			/\b(?:gemiste|niet gekookte|oude)\b.*\b(?:maaltijd|maaltijden|avondeten)\b/.test(
				normalized
			));
	const cookFromStock =
		/\b(?:cook|make|meals?).*\b(?:from|with) stock\b/.test(normalized) ||
		/\b(?:entirely|almost entirely).*\bfrom stock\b/.test(normalized) ||
		/\b(?:koken|maken).*\b(?:uit|met) (?:de )?voorraad\b/.test(normalized);
	const shoppingReconcile =
		/\b(?:reconcile|rebuild|derive)\b.*\bshopping list\b/.test(normalized) ||
		/\b(?:werk|bouw|leid)\b.*\bboodschappenlijst\b/.test(normalized);
	const inventoryRead =
		/\b(?:what|which).*\b(?:have|oldest|stock).*\b(?:freezer|fridge|pantry|stock)\b/.test(
			normalized
		) ||
		/\b(?:what|which).*\b(?:freezer|fridge|pantry|stock).*\b(?:have|oldest)\b/.test(
			normalized
		) ||
		/\b(?:wat|welke).*\b(?:voorraad|vriezer|koelkast|voorraadkast).*\b(?:hebben|oudst|ligt|staat)\b/.test(
			normalized
		);
	const historyRead =
		/\b(?:who|what).*\b(?:changed|added|removed).*\b(?:stock|inventory|freezer|fridge|pantry)\b/.test(
			normalized
		) ||
		/\b(?:wie|wat).*\b(?:wijzigde|veranderde|voegde|verwijderde).*\b(?:voorraad|vriezer|koelkast|voorraadkast)\b/.test(
			normalized
		);
	const shoppingControl =
		/\b(add|remove|delete|mark|make|change)\b.*\b(shopping list|groceries)\b/.test(normalized) ||
		/\bmark\b.*\bbought\b/.test(normalized) ||
		/\b(voeg|verwijder|markeer|maak|wijzig)\b.*\b(boodschappen|boodschappenlijst)\b/.test(normalized) ||
		/\bmarkeer\b.*\bgekocht\b/.test(normalized);
	const contextualQuantityFollowUp =
		priorToolNames.includes('prepare_stock_action') &&
		(/^(?:make|change) (?:it|that)(?: to)? (?:\d+|one|two|three|four|five)\b/.test(normalized) ||
			/^(?:maak|wijzig) (?:het|dat)(?: naar)? (?:\d+|een|twee|drie|vier|vijf)\b/.test(
				normalized
			));
	const cookingTimer =
		(/\b(?:start|set|begin|extend|rename|cancel)\b.*\btimer\b/u.test(normalized) ||
			/\b(?:start|zet|verleng|hernoem|annuleer)\b.*\btimer\b/u.test(normalized));
	const cookingRescue =
		/\b(?:too salty|too thin|not browning|won t brown|doesn t brown)\b/u.test(normalized) ||
		/\b(?:te zout|te dun|wordt niet bruin|bruint niet)\b/u.test(normalized);
	const defrostCue =
		/\b(?:defrost|thaw|ontdooi|ontdooien)\b/u.test(normalized);
	const afterCook =
		/\b(?:we|i) (?:cooked|ate|finished|served)\b/u.test(normalized) ||
		/\b(?:mark|finish|check out)\b.*\b(?:meal|dinner)\b.*\b(?:cooked|eaten)\b/u.test(
			normalized
		) ||
		/\b(?:we|ik) (?:hebben|heb) .*\b(?:gekookt|gegeten|opgegeten)\b/u.test(normalized) ||
		/\b(?:markeer|rond af)\b.*\b(?:maaltijd|avondeten)\b.*\b(?:gekookt|gegeten)\b/u.test(
			normalized
		);

	if (cookingTimer) {
		return forcedSequence(['prepare_cooking_action'], completedToolNames);
	}
	if (cookingRescue) {
		return forcedSequence(['get_recipe', 'prepare_cooking_action'], completedToolNames);
	}
	if (defrostCue) {
		return forcedSequence(['get_inventory', 'prepare_cooking_action'], completedToolNames);
	}
	if (afterCook) {
		return forcedSequence(['get_meal_plan', 'prepare_cooking_action'], completedToolNames);
	}
	if (shoppingControl || intake || parRefill || contextualQuantityFollowUp) {
		return forcedSequence(['prepare_stock_action'], completedToolNames);
	}
	if (stockReplacement) {
		return forcedSequence(['get_inventory', 'prepare_stock_action'], completedToolNames);
	}
	if (freezerRefill) {
		return forcedSequence([
			'get_freezer_staples',
			'get_meal_plan',
			'suggest_meals',
			'propose_meal_plan'
		], completedToolNames);
	}
	if (missedMealRollover) {
		return forcedSequence(['get_meal_plan', 'propose_meal_plan'], completedToolNames);
	}
	if (mealPlanEdit) {
		return forcedSequence(['get_meal_plan', 'propose_meal_plan'], completedToolNames);
	}
	if (weekProposal) {
		return forcedSequence(
			['get_meal_plan', 'suggest_meals', 'propose_meal_plan'],
			completedToolNames
		);
	}
	if (tonightChoice) {
		return forcedSequence(['get_inventory', 'get_meal_plan', 'suggest_meals'], completedToolNames);
	}
	if (cookFromStock) return forcedSequence(['suggest_meals'], completedToolNames);
	if (shoppingReconcile) return forcedSequence(['generate_shopping_list'], completedToolNames);
	if (historyRead) return forcedSequence(['get_inventory_history'], completedToolNames);
	if (inventoryRead) return forcedSequence(['get_inventory'], completedToolNames);
	if (hasImages) return { tools };
	return {
		tools: tools.filter(
			(tool) =>
				tool.name !== 'prepare_stock_action' &&
				tool.name !== 'prepare_cooking_action'
		)
	};
}

export function toolsForAssistantTurn(
	message: string,
	hasImages = false,
	priorToolNames: readonly string[] = [],
	completedToolNames: readonly string[] = []
): Anthropic.Tool[] {
	return assistantToolRoute(message, hasImages, priorToolNames, completedToolNames).tools;
}
