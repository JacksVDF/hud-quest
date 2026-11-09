import { describe, expect, it } from 'vitest';
import { PAGE_SIZE } from './pagination';
import type { Task } from './tasks';
import {
	INBOX_ID,
	MAX_WORKSPACES,
	MAX_WORKSPACE_NAME,
	normalizeWorkspaceName,
	parseData,
	tasksIn,
	toData,
	toWorkspaces,
	workspaceKey,
	workspaceNameError,
	workspaceStats,
	type Workspace
} from './workspaces';

const task = (over: Partial<Task> = {}): Task => ({
	id: 't',
	title: 'T',
	complexity: 'easy',
	done: false,
	tags: [],
	items: [],
	notes: '',
	...over
});
const ws = (id: string, name: string): Workspace => ({ id, name });

describe('limits', () => {
	it('uses the one global ten for pages and for workspaces', () => {
		expect(MAX_WORKSPACES).toBe(10);
		expect(MAX_WORKSPACES).toBe(PAGE_SIZE);
	});
});

describe('workspace names', () => {
	it('trims, collapses spaces and caps the length', () => {
		expect(normalizeWorkspaceName('  My   big  project ')).toBe('My big project');
		expect(normalizeWorkspaceName('x'.repeat(50))).toHaveLength(MAX_WORKSPACE_NAME);
	});

	it('accepts a fresh name', () => {
		expect(workspaceNameError('Home', [ws('1', 'Work')])).toBe('');
	});

	it('refuses a blank name', () => {
		expect(workspaceNameError('   ', [])).not.toBe('');
	});

	it('refuses duplicates regardless of case, but lets a workspace keep its own name', () => {
		const list = [ws('1', 'Work')];
		expect(workspaceNameError('work', list)).toMatch(/already exists/);
		expect(workspaceNameError(' WORK ', list)).toMatch(/already exists/);
		expect(workspaceNameError('Work', list, '1')).toBe('');
		expect(workspaceNameError('work', [ws('1', 'Work'), ws('2', 'Home')], '2')).not.toBe('');
	});

	it('reserves INBOX', () => {
		expect(workspaceNameError('Inbox', [])).toMatch(/reserved/);
		expect(workspaceNameError(' inbox ', [])).toMatch(/reserved/);
	});
});

describe('grouping', () => {
	const tasks = [
		task({ id: 'a' }),
		task({ id: 'b', workspaceId: 'w1' }),
		task({ id: 'c', workspaceId: 'w1', done: true }),
		task({ id: 'd', workspaceId: 'w2' })
	];

	it('maps the INBOX route to no workspace', () => {
		expect(workspaceKey(INBOX_ID)).toBeUndefined();
		expect(workspaceKey('w1')).toBe('w1');
	});

	it('selects the tasks of one workspace or of the INBOX', () => {
		expect(tasksIn(tasks, 'w1').map((t) => t.id)).toEqual(['b', 'c']);
		expect(tasksIn(tasks, undefined).map((t) => t.id)).toEqual(['a']);
		expect(tasksIn(tasks, 'nope')).toEqual([]);
	});

	it('counts open and done tasks', () => {
		expect(workspaceStats(tasksIn(tasks, 'w1'))).toEqual({ open: 1, done: 1, total: 2 });
		expect(workspaceStats([])).toEqual({ open: 0, done: 0, total: 0 });
	});
});

describe('toWorkspaces', () => {
	it('keeps valid entries in order and normalizes names', () => {
		expect(
			toWorkspaces([
				{ id: '1', name: '  A  b ' },
				{ id: '2', name: 'C' }
			])
		).toEqual([ws('1', 'A b'), ws('2', 'C')]);
	});

	it('drops junk, duplicate ids, duplicate names, reserved names and the INBOX id', () => {
		const result = toWorkspaces([
			null,
			'x',
			{ id: '', name: 'No id' },
			{ id: 1, name: 'Numeric id' },
			{ id: '1', name: 'Keep' },
			{ id: '1', name: 'Same id' },
			{ id: '2', name: 'keep' },
			{ id: '3', name: 'Inbox' },
			{ id: INBOX_ID, name: 'Sneaky' },
			{ id: '4', name: 5 },
			{ id: 'x'.repeat(100), name: 'Long id' }
		]);
		expect(result).toEqual([ws('1', 'Keep')]);
	});

	it('keeps at most the global limit', () => {
		const many = Array.from({ length: 15 }, (_, i) => ({ id: `id${i}`, name: `W${i}` }));
		expect(toWorkspaces(many)).toHaveLength(MAX_WORKSPACES);
	});

	it('returns an empty list for anything that is not a list', () => {
		expect(toWorkspaces(undefined)).toEqual([]);
		expect(toWorkspaces({})).toEqual([]);
	});
});

describe('toData', () => {
	it('reads the old plain array as INBOX tasks', () => {
		const data = toData([task({ id: 'old' })]);
		expect(data).toMatchObject({ workspaces: [], tasks: [{ id: 'old' }] });
		expect(data!.tasks[0].workspaceId).toBeUndefined();
	});

	it('reads the current document', () => {
		const data = toData({
			workspaces: [ws('w1', 'Work')],
			tasks: [task({ id: 'a', workspaceId: 'w1' })]
		});
		expect(data!.workspaces).toEqual([ws('w1', 'Work')]);
		expect(data!.tasks[0].workspaceId).toBe('w1');
	});

	it('sends active tasks of an unknown workspace back to the INBOX', () => {
		const data = toData({ workspaces: [], tasks: [task({ workspaceId: 'gone' })] });
		expect(data!.tasks[0].workspaceId).toBeUndefined();
	});

	it('lets a trashed task keep a workspace that no longer exists', () => {
		const data = toData({
			workspaces: [],
			tasks: [task({ workspaceId: 'gone', deletedAt: 1 })]
		});
		expect(data!.tasks[0].workspaceId).toBe('gone');
	});

	it('refuses data that is neither a list nor a document with a task list', () => {
		expect(toData('nope')).toBeNull();
		expect(toData(null)).toBeNull();
		expect(toData(42)).toBeNull();
		expect(toData({ workspaces: [] })).toBeNull();
		expect(toData({ workspaces: [], tasks: 'x' })).toBeNull();
	});

	it('ignores an invalid workspaceId on a task', () => {
		const data = toData([{ ...task(), workspaceId: 5 }]);
		expect(data!.tasks[0].workspaceId).toBeUndefined();
	});
});

describe('parseData', () => {
	it('returns an empty document for missing or broken JSON', () => {
		const empty = { workspaces: [], tasks: [] };
		expect(parseData(null)).toEqual(empty);
		expect(parseData('{not json')).toEqual(empty);
		expect(parseData('42')).toEqual(empty);
	});

	it('round-trips a document', () => {
		const doc = { workspaces: [ws('w1', 'Work')], tasks: [task({ workspaceId: 'w1' })] };
		expect(parseData(JSON.stringify(doc))).toEqual(doc);
	});
});
