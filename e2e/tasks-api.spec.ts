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

const doc = (tasks: unknown[] = [], workspaces: unknown[] = []) => ({ workspaces, tasks });
const titles = (data: { tasks: { title: string }[] }) => data.tasks.map((t) => t.title);

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
	expect(await (await user.api.get('/api/tasks')).json()).toEqual(doc());
	expect((await put(user.api, doc([task('a', 'Mine')]))).ok()).toBe(true);
	const saved = await (await user.api.get('/api/tasks')).json();
	expect(saved).toMatchObject({ workspaces: [], tasks: [{ id: 'a', title: 'Mine' }] });
	await user.close();
});

test('users never see each other’s tasks', async ({ browser }) => {
	const alice = await newUser(browser);
	const bob = await newUser(browser);

	await put(alice.api, doc([task('a1', 'Alice secret')], [{ id: 'wa', name: 'Alice space' }]));
	await put(bob.api, doc([task('b1', 'Bob secret')]));

	const aliceData = await (await alice.api.get('/api/tasks')).json();
	const bobData = await (await bob.api.get('/api/tasks')).json();
	expect(titles(aliceData)).toEqual(['Alice secret']);
	expect(titles(bobData)).toEqual(['Bob secret']);
	expect(bobData.workspaces).toEqual([]);

	// Bob overwriting his data does not touch Alice's.
	await put(bob.api, doc());
	const aliceAgain = await (await alice.api.get('/api/tasks')).json();
	expect(aliceAgain.tasks).toHaveLength(1);
	expect(aliceAgain.workspaces).toHaveLength(1);

	await alice.close();
	await bob.close();
});

test('rejects bad input', async ({ browser }) => {
	const user = await newUser(browser);
	expect((await put(user.api, { not: 'a document' })).status()).toBe(400);
	expect((await put(user.api, [task('a', 'ok')])).status()).toBe(400);
	expect((await put(user.api, doc([task('a', 'ok'), { id: 1 }]))).status()).toBe(400);
	expect((await put(user.api, doc([], [{ id: 'w', name: '' }]))).status()).toBe(400);
	expect((await put(user.api, doc([], [{ id: 'w', name: 'Inbox' }]))).status()).toBe(400);
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
				data: '{}',
				headers: { 'content-type': 'application/xml', 'if-match': '"0"' }
			})
		).status()
	).toBe(415);
	const tooMany = Array.from({ length: 501 }, (_, i) => task(`t${i}`, 'x'));
	expect((await put(user.api, doc(tooMany))).status()).toBe(413);
	const tooManyWorkspaces = Array.from({ length: 11 }, (_, i) => ({ id: `w${i}`, name: `W${i}` }));
	expect((await put(user.api, doc([], tooManyWorkspaces))).status()).toBe(400);
	expect(
		(
			await user.api.put('/api/tasks', {
				data: doc(),
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
		data: doc([task('a', 'From A')]),
		headers: { 'if-match': first }
	});
	expect(a.status()).toBe(200);
	expect(a.headers()['etag']).toBe('"1"');

	// Tab B still thinks it is at version 0: refused, and A's data survives.
	const b = await user.api.put('/api/tasks', {
		data: doc([task('b', 'From B')]),
		headers: { 'if-match': first }
	});
	expect(b.status()).toBe(412);
	const current = await (await user.api.get('/api/tasks')).json();
	expect(titles(current)).toEqual(['From A']);

	// Reloading gives the new version, and saving works again.
	const c = await user.api.put('/api/tasks', {
		data: doc([task('a', 'From A'), task('b', 'From B')]),
		headers: { 'if-match': await versionOf(user.api) }
	});
	expect(c.status()).toBe(200);
	expect(c.headers()['etag']).toBe('"2"');
	await user.close();
});

test('requires a version to save', async ({ browser }) => {
	const user = await newUser(browser);
	expect((await user.api.put('/api/tasks', { data: doc() })).status()).toBe(428);
	expect(
		(await user.api.put('/api/tasks', { data: doc(), headers: { 'if-match': 'abc' } })).status()
	).toBe(400);
	await user.close();
});

test('accepts weak ETags, which Cloudflare sends when it compresses responses', async ({
	browser
}) => {
	const user = await newUser(browser);
	const saved = await user.api.put('/api/tasks', {
		data: doc([task('a', 'First')]),
		headers: { 'if-match': 'W/"0"' }
	});
	expect(saved.status()).toBe(200);
	// A stale weak version is still refused.
	const stale = await user.api.put('/api/tasks', {
		data: doc(),
		headers: { 'if-match': 'W/"0"' }
	});
	expect(stale.status()).toBe(412);
	await user.close();
});

test('keeps workspaces and tracks where each task lives', async ({ browser }) => {
	const user = await newUser(browser);
	const work = { id: 'w1', name: 'Work' };
	await put(
		user.api,
		doc([{ ...task('a', 'Inside'), workspaceId: 'w1' }, task('b', 'Loose')], [work])
	);
	const saved = await (await user.api.get('/api/tasks')).json();
	expect(saved.workspaces).toEqual([work]);
	expect(saved.tasks.find((t: { id: string }) => t.id === 'a').workspaceId).toBe('w1');
	expect(saved.tasks.find((t: { id: string }) => t.id === 'b').workspaceId).toBeUndefined();
	await user.close();
});

test('an active task pointing at a missing workspace goes back to the INBOX', async ({
	browser
}) => {
	const user = await newUser(browser);
	await put(user.api, doc([{ ...task('a', 'Orphan'), workspaceId: 'ghost' }]));
	const saved = await (await user.api.get('/api/tasks')).json();
	expect(saved.tasks[0].workspaceId).toBeUndefined();
	await user.close();
});
