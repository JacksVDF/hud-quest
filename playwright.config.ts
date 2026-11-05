import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	reporter: 'list',
	use: {
		baseURL: 'http://127.0.0.1:4173',
		// Uses the Google Chrome already installed, so no browser download is needed.
		channel: 'chrome'
	},
	webServer: {
		// The built Worker imports `cloudflare:workers`, so it must run in workerd, not in `vite preview`.
		// Migrations run on the local D1 first so the auth tables exist.
		command:
			'npm run build && wrangler d1 migrations apply hud-quest-db --local && wrangler dev --ip 127.0.0.1 --port 4173',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: false,
		timeout: 120_000
	}
});
