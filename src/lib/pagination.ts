export const PAGE_SIZE = 10;

export function pageCount(total: number, size: number = PAGE_SIZE): number {
	return Math.max(1, Math.ceil(total / size));
}

/** Keeps a page number inside 1..pageCount, so a stale page never shows an empty list. */
export function clampPage(page: number, total: number, size: number = PAGE_SIZE): number {
	return Math.min(Math.max(1, Math.floor(page) || 1), pageCount(total, size));
}

export function paginate<T>(list: T[], page: number, size: number = PAGE_SIZE): T[] {
	const start = (clampPage(page, list.length, size) - 1) * size;
	return list.slice(start, start + size);
}
