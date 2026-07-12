import { describe, expect, it } from 'vitest';
import { deriveQuantity, effectiveUnitPrice, rankProducts, toSearchTerm, fallbackTerm } from './matching';
import type { AHProduct } from './client';

function product(overrides: Partial<AHProduct> & { name: string }): AHProduct {
	return {
		id: overrides.name,
		priceBeforeBonus: null,
		currentPrice: null,
		isBonus: false,
		bonusMechanism: null,
		salesUnitSize: null,
		unitPriceDescription: null,
		imageUrl: null,
		isPreviouslyBought: false,
		mainCategory: null,
		...overrides
	};
}

describe('deriveQuantity', () => {
	it('parses legacy combined amount/unit strings', () => {
		expect(deriveQuantity('300 g', null, '250 g')).toBe(2);
		expect(deriveQuantity('1 kg', null, '500 g')).toBe(2);
	});
});

describe('effectiveUnitPrice', () => {
	it('returns the parsed unit price for non-bonus items', () => {
		const p = product({ name: 'AH Penne', unitPriceDescription: 'prijs per kg €1.78' });
		expect(effectiveUnitPrice(p)).toEqual({ value: 1.78, basis: 'kg' });
	});

	it('scales the regular unit price down by the bonus ratio', () => {
		const p = product({
			name: 'AH Penne',
			isBonus: true,
			currentPrice: 0.5,
			priceBeforeBonus: 1.0,
			unitPriceDescription: 'normale prijs per kg €2.00'
		});
		expect(effectiveUnitPrice(p)).toEqual({ value: 1.0, basis: 'kg' });
	});
});

describe('toSearchTerm', () => {
	it('resolves a dangling-hyphen either/or to the complete alternative', () => {
		expect(toSearchTerm('zonnebloem- of koolzaadolie')).toBe('koolzaadolie');
	});

	it('strips prep words and leaf-form compound tails', () => {
		expect(toSearchTerm('vers gehakte korianderblaadjes')).toBe('koriander');
		expect(toSearchTerm('grote ui')).toBe('ui');
	});

	it('keeps words that name a different product', () => {
		expect(toSearchTerm('gemalen koriander')).toBe('gemalen koriander');
		expect(toSearchTerm('gedroogde abrikozen')).toBe('gedroogde abrikozen');
	});

	it('keeps a last-position prep word — it is the noun there', () => {
		expect(toSearchTerm('half-om-half gehakt')).toBe('half-om-half gehakt');
	});

	it('falls back to the input when cleanup would empty the query', () => {
		expect(toSearchTerm('verse')).toBe('verse');
	});
});

describe('fallbackTerm', () => {
	it('retries with the longest word', () => {
		expect(fallbackTerm('verse koriander los')).toBe('koriander');
	});
	it('returns null when there is nothing simpler', () => {
		expect(fallbackTerm('koriander')).toBeNull();
	});
});

describe('rankProducts', () => {
	it('prefers the cheapest per-unit match over a previously-bought pricier variant (mini penne case)', () => {
		const mini = product({
			name: "AH Mini penne volkoren",
			isPreviouslyBought: true,
			unitPriceDescription: 'prijs per kg €1.88'
		});
		const regular = product({ name: 'AH Penne', unitPriceDescription: 'prijs per kg €1.78' });
		const { ranked } = rankProducts('penne', [mini, regular]);
		expect(ranked[0].name).toBe('AH Penne');
	});

	it('falls back to previously-bought when unit prices cannot be compared', () => {
		const bought = product({ name: 'AH Spaghetti', isPreviouslyBought: true });
		const other = product({ name: 'Grand Italia Spaghetti' });
		const { ranked } = rankProducts('spaghetti', [other, bought]);
		expect(ranked[0].name).toBe('AH Spaghetti');
	});

	it('keeps textual coverage as the primary guard', () => {
		const offTopic = product({ name: 'Looye Honingtomaten', unitPriceDescription: 'prijs per kg €1.00' });
		const onTopic = product({ name: 'AH Snoeptomaatjes', unitPriceDescription: 'prijs per kg €4.00' });
		const { ranked, lowConfidence } = rankProducts('snoeptomaatjes', [offTopic, onTopic]);
		expect(ranked[0].name).toBe('AH Snoeptomaatjes');
		expect(lowConfidence).toBe(false);
	});

	// --- 2026-07-10 regression fixtures: real preview failures ---------------

	it('matches Dutch head-final compounds — tafelzout/zeezout ARE zout (himalaya-grinder case)', () => {
		const grinder = product({ name: 'Drogheria Molen roze Himalaya zout', unitPriceDescription: 'prijs per kg €39.26' });
		const tafel = product({ name: 'AH Tafelzout met jodium', unitPriceDescription: 'prijs per kg €3.92' });
		const zee = product({ name: 'La Baleine Grof zeezout', unitPriceDescription: 'prijs per kg €2.19' });
		const { ranked } = rankProducts('zout', [grinder, tafel, zee]);
		expect(ranked[0].name).toBe('La Baleine Grof zeezout');
		expect(ranked[2].name).toBe('Drogheria Molen roze Himalaya zout');
	});

	it('a "zonder X" product never matches X (sugar-free cookie case)', () => {
		const cookie = product({
			name: 'Céréal Chocolate chip cookie zonder suikers',
			unitPriceDescription: 'prijs per kg €33.00'
		});
		const slasaus = product({
			name: "Gouda's Glorie Slasaus zero 0% toegevoegde suikers",
			unitPriceDescription: 'prijs per liter €3.90'
		});
		const kristal = product({ name: 'Van Gilse Kristalsuiker', unitPriceDescription: 'prijs per kg €0.89' });
		const { ranked } = rankProducts('suiker', [cookie, slasaus, kristal]);
		expect(ranked[0].name).toBe('Van Gilse Kristalsuiker');
	});

	it('matches a compound term against its split words (groentebouillon case)', () => {
		const premium = product({ name: 'Zonnatura Groentebouillon tabletten', unitPriceDescription: 'prijs per kg €18.94' });
		const basic = product({ name: 'AH Bouillon groente', unitPriceDescription: 'prijs per kg €4.58' });
		const blokjes = product({ name: 'Maggi Bouillonblokjes groente', unitPriceDescription: 'prijs per kg €19.49' });
		const { ranked } = rankProducts('groentebouillon', [premium, basic, blokjes]);
		expect(ranked[0].name).toBe('AH Bouillon groente');
	});

	it('prices only compare on the pool majority basis; unpriced composites sink (runderstoof-pie case)', () => {
		const pie = product({ name: 'AH Pie runderstoof ui 2-pack' });
		const geel = product({ name: 'AH Gele uien', isPreviouslyBought: true, unitPriceDescription: 'prijs per kg €1.65' });
		const rood = product({ name: 'AH Rode uien', isPreviouslyBought: true, unitPriceDescription: 'prijs per kg €1.39' });
		const bos = product({ name: 'AH Bosui', isPreviouslyBought: true });
		const { ranked } = rankProducts('ui', [pie, geel, rood, bos]);
		expect(ranked[0].name).toBe('AH Rode uien');
		expect(ranked[3].name).toBe('AH Pie runderstoof ui 2-pack');
	});

	it('is a total order — result does not depend on input order (given no exact key ties)', () => {
		const pool = [
			product({ name: 'AH Pie runderstoof ui 2-pack' }),
			product({ name: 'AH Gele uien', isPreviouslyBought: true, unitPriceDescription: 'prijs per kg €1.65' }),
			product({ name: 'Aardappel Anders Bacon - ui', unitPriceDescription: 'prijs per kg €8.44' }),
			product({ name: 'AH Rode uien', isPreviouslyBought: true, unitPriceDescription: 'prijs per kg €1.39' }),
			product({ name: 'AH Bosui', isPreviouslyBought: true })
		];
		const forward = rankProducts('ui', pool).ranked.map((p) => p.name);
		const reversed = rankProducts('ui', [...pool].reverse()).ranked.map((p) => p.name);
		expect(reversed).toEqual(forward);
		expect(forward).toEqual([
			'AH Rode uien',
			'AH Gele uien',
			'Aardappel Anders Bacon - ui',
			'AH Bosui',
			'AH Pie runderstoof ui 2-pack'
		]);
	});

	it('demotes non-food categories below any food match (shower-gel case)', () => {
		const gel = product({
			name: 'Melkmeisje Zonnebloem/melk bad & douche',
			mainCategory: 'Drogisterij',
			unitPriceDescription: 'prijs per liter €4.99'
		});
		const olie = product({
			name: 'AH Zonnebloemolie',
			mainCategory: 'Soepen, sauzen, kruiden, olie',
			unitPriceDescription: 'prijs per liter €1.39'
		});
		const { ranked } = rankProducts('zonnebloem', [gel, olie]);
		expect(ranked[0].name).toBe('AH Zonnebloemolie');
	});
});
