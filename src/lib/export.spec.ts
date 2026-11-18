import { describe, expect, it } from 'vitest';
import { EXPORT_VERSION, buildExport } from './export';
import { toData } from './workspaces';
import type { Data } from './workspaces';

const data: Data = {
	workspaces: [{ id: 'w1', name: 'Work' }],
	tasks: [
		{
			id: 't1',
			title: 'Ship it',
			complexity: 'hard',
			// Every milestone is done, so the app itself would load it as done.
			done: true,
			tags: ['work'],
			items: [{ id: 'i1', title: 'step', done: true }],
			notes: 'n',
			workspaceId: 'w1',
			dueDate: '2026-11-12',
			repeat: 'weekly'
		},
		{
			id: 't2',
			title: 'Binned',
			complexity: 'easy',
			done: true,
			tags: [],
			items: [],
			notes: '',
			deletedAt: 1
		}
	],
	activity: { '2026-11-10': { easy: 1, medium: 0, hard: 0, xp: 10 } }
};

describe('buildExport', () => {
	const now = new Date(2026, 10, 10, 15).getTime();
	const file = buildExport(data, now);
	const parsed = JSON.parse(file.content);

	it('names the file after the local day', () => {
		expect(file.filename).toBe('hud-quest-2026-11-10.json');
	});

	it('has a version, the app name and the export time', () => {
		expect(parsed.app).toBe('HUD//QUEST');
		expect(parsed.version).toBe(EXPORT_VERSION);
		expect(parsed.exportedAt).toBe(new Date(now).toISOString());
	});

	it('includes workspaces, trashed tasks and the daily record', () => {
		expect(parsed.workspaces).toEqual(data.workspaces);
		expect(parsed.tasks.map((t: { id: string }) => t.id)).toEqual(['t1', 't2']);
		expect(parsed.activity).toEqual(data.activity);
	});

	it('can be read back by the app without losing anything', () => {
		expect(toData(parsed)).toEqual(data);
	});

	it('is indented so a person can read it', () => {
		expect(file.content).toContain('\n  "workspaces"');
	});

	it('holds nothing that identifies the account', () => {
		expect(file.content).not.toMatch(/email|user_?id|password/i);
	});
});
