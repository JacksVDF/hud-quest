import { dayKey } from './dates';
import type { Data } from './workspaces';

/** Bumped if the shape of the exported file ever changes. */
export const EXPORT_VERSION = 1;

export interface ExportFile {
	/** The file name offered to the browser, e.g. `hud-quest-2026-11-10.json`. */
	filename: string;
	/** Pretty-printed JSON, so a person can read it too. */
	content: string;
}

/**
 * Everything the player has, as one JSON file: workspaces, active and trashed tasks, and the
 * daily record. It carries no account details (no email, no id).
 */
export function buildExport(data: Data, now: number): ExportFile {
	const doc = {
		app: 'HUD//QUEST',
		version: EXPORT_VERSION,
		exportedAt: new Date(now).toISOString(),
		workspaces: data.workspaces,
		tasks: data.tasks,
		activity: data.activity
	};
	return { filename: `hud-quest-${dayKey(now)}.json`, content: JSON.stringify(doc, null, 2) };
}

/** Starts a browser download for the file. Client only. */
export function download(file: ExportFile) {
	const url = URL.createObjectURL(new Blob([file.content], { type: 'application/json' }));
	const link = document.createElement('a');
	link.href = url;
	link.download = file.filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	// Revoked later: some browsers start reading the URL after click() returns.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
