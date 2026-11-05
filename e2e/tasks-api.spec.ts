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

const put = (api: APIRequestContext, data: unknown) => api.put('/api/tasks', { data });

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
				headers: { 'content-type': 'application/json' }
			})
		).status()
	).toBe(400);
	expect(
		(
			await user.api.put('/api/tasks', {
				data: '[]',
				headers: { 'content-type': 'application/xml' }
			})
		).status()
	).toBe(415);
	const tooMany = Array.from({ length: 501 }, (_, i) => task(`t${i}`, 'x'));
	expect((await put(user.api, tooMany)).status()).toBe(413);
	expect(
		(
			await user.api.put('/api/tasks', {
				data: [],
				headers: { origin: 'https://evil.example' }
			})
		).status()
	).toBe(403);
	await user.close();
});
