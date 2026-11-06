import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

const PASSWORD = 'correct-horse-1';
const uniqueEmail = () => `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const n = () => Math.floor(Math.random() * 254) + 1;

/** A fresh API client (own cookies, own fake IP) that is signed in as a new user. */
async function newUser(browser: Browser) {
	const context = await browser.newContext({
		extraHTTPHeaders: { 'cf-connecting-ip': `10.${n()}.${n()}.${n()}` }
	});
	const api = context.request;
	const res = await api.post('/api/auth/sign-up/email', {
		data: { email: uniqueEmail(), password: PASSWORD, name: 'api' }
	});
	expect(res.ok()).toBe(true);
	return { api, close: () => context.close() };
}

const task = (id: string, title: string) => ({
	id,
	title,
	complexity: 'easy',
	done: false,
	tags: [],
	items: [],
	notes: ''
});

/** The version (ETag) the server currently has for this user. */
async function versionOf(api: APIRequestContext) {
	return (await api.get('/api/tasks')).headers()['etag'];
}

/** Saves on top of the current version, like a tab that has just loaded. */
async function put(api: APIRequestContext, data: unknown) {
	return api.put('/api/tasks', { data, headers: { 'if-match': await versionOf(api) } });
}

test('requires a session', async ({ playwright, baseURL }) => {
	const api = await playwright.request.newContext({ baseURL });
	expect((await api.get('/api/tasks')).status()).toBe(401);
	expect((await put(api, [])).status()).toBe(401);
	await api.dispose();
});

test('saves and loads a user’s tasks', async ({ browser }) => {
	const user = await newUser(browser);
	expect(await (await user.api.get('/api/tasks')).json()).toEqual([]);
	expect((await put(user.api, [task('a', 'Mine')])).ok()).toBe(true);
	const saved = await (await user.api.get('/api/tasks')).json();
	expect(saved).toMatchObject([{ id: 'a', title: 'Mine' }]);
	await user.close();
});

test('users never see each other’s tasks', async ({ browser }) => {
	const alice = await newUser(browser);
	const bob = await newUser(browser);

	await put(alice.api, [task('a1', 'Alice secret')]);
	await put(bob.api, [task('b1', 'Bob secret')]);

	const aliceTasks = await (await alice.api.get('/api/tasks')).json();
	const bobTasks = await (await bob.api.get('/api/tasks')).json();
	expect(aliceTasks.map((t: { title: string }) => t.title)).toEqual(['Alice secret']);
	expect(bobTasks.map((t: { title: string }) => t.title)).toEqual(['Bob secret']);

	// Bob overwriting his list does not touch Alice's.
	await put(bob.api, []);
	const aliceAgain = await (await alice.api.get('/api/tasks')).json();
	expect(aliceAgain).toHaveLength(1);

	await alice.close();
	await bob.close();
});

test('rejects bad input', async ({ browser }) => {
	const user = await newUser(browser);
	expect((await put(user.api, { not: 'a list' })).status()).toBe(400);
	expect((await put(user.api, [task('a', 'ok'), { id: 1 }])).status()).toBe(400);
	expect(
		(
			await user.api.put('/api/tasks', {
				data: 'not json{',
				headers: { 'content-type': 'application/json', 'if-match': '"0"' }
			})
		).status()
	).toBe(400);
	expect(
		(
			await user.api.put('/api/tasks', {
				data: '[]',
				headers: { 'content-type': 'application/xml', 'if-match': '"0"' }
			})
		).status()
	).toBe(415);
	const tooMany = Array.from({ length: 501 }, (_, i) => task(`t${i}`, 'x'));
	expect((await put(user.api, tooMany)).status()).toBe(413);
	expect(
		(
			await user.api.put('/api/tasks', {
				data: [],
				headers: { origin: 'https://evil.example', 'if-match': '"0"' }
			})
		).status()
	).toBe(403);
	await user.close();
});

test('refuses to overwrite a list that changed since it was read', async ({ browser }) => {
	const user = await newUser(browser);
	const first = await versionOf(user.api);
	expect(first).toBe('"0"');

	// Tab A saves on top of version 0.
	const a = await user.api.put('/api/tasks', {
		data: [task('a', 'From A')],
		headers: { 'if-match': first }
	});
	expect(a.status()).toBe(200);
	expect(a.headers()['etag']).toBe('"1"');

	// Tab B still thinks it is at version 0: refused, and A's data survives.
	const b = await user.api.put('/api/tasks', {
		data: [task('b', 'From B')],
		headers: { 'if-match': first }
	});
	expect(b.status()).toBe(412);
	const current = await (await user.api.get('/api/tasks')).json();
	expect(current.map((t: { title: string }) => t.title)).toEqual(['From A']);

	// Reloading gives the new version, and saving works again.
	const c = await user.api.put('/api/tasks', {
		data: [task('a', 'From A'), task('b', 'From B')],
		headers: { 'if-match': await versionOf(user.api) }
	});
	expect(c.status()).toBe(200);
	expect(c.headers()['etag']).toBe('"2"');
	await user.close();
});

test('requires a version to save', async ({ browser }) => {
	const user = await newUser(browser);
	expect((await user.api.put('/api/tasks', { data: [] })).status()).toBe(428);
	expect(
		(await user.api.put('/api/tasks', { data: [], headers: { 'if-match': 'abc' } })).status()
	).toBe(400);
	await user.close();
});

test('accepts weak ETags, which Cloudflare sends when it compresses responses', async ({
	browser
}) => {
	const user = await newUser(browser);
	const saved = await user.api.put('/api/tasks', {
		data: [task('a', 'First')],
		headers: { 'if-match': 'W/"0"' }
	});
	expect(saved.status()).toBe(200);
	// A stale weak version is still refused.
	const stale = await user.api.put('/api/tasks', {
		data: [],
		headers: { 'if-match': 'W/"0"' }
	});
	expect(stale.status()).toBe(412);
	await user.close();
});
