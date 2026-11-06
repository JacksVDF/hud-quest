// Post-deploy smoke test: node scripts/smoke.mjs [url]
// Talks to the real deployment like a browser would (compressed responses, weak ETags).
// It signs up a throwaway user, saves and reads a task, and always deletes the user afterwards.
const base = (
	process.argv[2] ??
	process.env.SMOKE_URL ??
	'https://hud-quest.jacksvdf.workers.dev'
).replace(/\/$/, '');
const email = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = `smoke-${Math.random().toString(36).slice(2)}-A1`;

let cookie = '';
let failures = 0;

function check(name, ok, detail = '') {
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
	if (!ok) failures++;
}

async function call(path, init = {}) {
	const res = await fetch(base + path, {
		...init,
		headers: {
			origin: base,
			cookie,
			...(init.body ? { 'content-type': 'application/json' } : {}),
			...init.headers
		}
	});
	const set = res.headers.getSetCookie?.() ?? [];
	if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
	return res;
}

try {
	const home = await call('/');
	const html = await home.text();
	check(
		'home page loads',
		home.status === 200 && html.includes('HUD//QUEST'),
		`status ${home.status}`
	);
	check('tasks API requires a session', (await call('/api/tasks')).status === 401);

	const signUp = await call('/api/auth/sign-up/email', {
		method: 'POST',
		body: JSON.stringify({ email, password, name: 'smoke' })
	});
	check('sign up works', signUp.ok, `status ${signUp.status}`);

	const first = await call('/api/tasks');
	const etag = first.headers.get('etag') ?? '';
	check('tasks load with a version', first.status === 200 && etag !== '', `status ${first.status}`);
	check('new account starts empty', JSON.stringify(await first.json()) === '[]');

	const task = {
		id: 'smoke-1',
		title: 'Smoke task',
		complexity: 'easy',
		done: false,
		tags: [],
		items: [],
		notes: ''
	};
	const put = await call('/api/tasks', {
		method: 'PUT',
		body: JSON.stringify([task]),
		headers: { 'if-match': etag }
	});
	check('tasks save with the version the server sent', put.ok, `status ${put.status}`);

	const stale = await call('/api/tasks', {
		method: 'PUT',
		body: '[]',
		headers: { 'if-match': etag }
	});
	check('a stale version is refused', stale.status === 412, `status ${stale.status}`);

	const back = await (await call('/api/tasks')).json();
	check('saved task comes back', back.length === 1 && back[0].title === 'Smoke task');
} catch (e) {
	check('smoke test ran without errors', false, String(e));
} finally {
	if (cookie) {
		const del = await call('/api/auth/delete-user', {
			method: 'POST',
			body: JSON.stringify({ password })
		});
		check('temporary account deleted', del.ok, `status ${del.status}`);
		const gone = await call('/api/tasks');
		check('deleted account has no access', gone.status === 401, `status ${gone.status}`);
	}
}

console.log(failures === 0 ? `\nAll good: ${base}` : `\n${failures} check(s) failed: ${base}`);
process.exit(failures === 0 ? 0 : 1);
