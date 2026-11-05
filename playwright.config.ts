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
		command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: false,
		timeout: 120_000
	}
});
