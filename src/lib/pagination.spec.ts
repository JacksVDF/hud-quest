import { describe, expect, it } from 'vitest';
import { clampPage, pageCount, paginate } from './pagination.ts';

const list = Array.from({ length: 25 }, (_, i) => i + 1);

describe('pageCount', () => {
	it('is at least 1, even for an empty list', () => {
		expect(pageCount(0)).toBe(1);
	});

	it('rounds up', () => {
		expect(pageCount(10, 10)).toBe(1);
		expect(pageCount(11, 10)).toBe(2);
		expect(pageCount(25, 10)).toBe(3);
	});
});

describe('clampPage', () => {
	it('keeps valid pages', () => {
		expect(clampPage(2, 25, 10)).toBe(2);
	});

	it('clamps pages that are too low, too high or invalid', () => {
		expect(clampPage(0, 25, 10)).toBe(1);
		expect(clampPage(-3, 25, 10)).toBe(1);
		expect(clampPage(9, 25, 10)).toBe(3);
		expect(clampPage(Number.NaN, 25, 10)).toBe(1);
	});
});

describe('paginate', () => {
	it('returns the slice for a page', () => {
		expect(paginate(list, 1, 10)).toEqual(list.slice(0, 10));
		expect(paginate(list, 3, 10)).toEqual([21, 22, 23, 24, 25]);
	});

	it('falls back to the last page when the page is too high', () => {
		expect(paginate(list, 99, 10)).toEqual([21, 22, 23, 24, 25]);
	});

	it('returns an empty list for an empty input', () => {
		expect(paginate([], 1, 10)).toEqual([]);
	});
});
