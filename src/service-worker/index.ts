/**
 * Makes the app installable and lets it open without a network.
 *
 * It keeps only the shell of the app (scripts, styles, fonts, icons and the prerendered pages)
 * and never anything from `/api/*`, so a signed-in user's tasks are never stored by it and one
 * person's data can never be shown to another on a shared device.
 */
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self } from '$app/service-worker';

const CACHE = `hud-quest-${version}`;

/** Large or useless offline: the social image, robots.txt and the older .woff font fallbacks. */
const skip = (path: string) =>
	path === '/og-image.png' || path === '/robots.txt' || path.endsWith('.woff');

/**
 * The manifest lists paths without the leading slash (`_app/...`, `login`, and an empty string
 * for the start page); requests come in as `/login`, so everything is turned into that form.
 */
const absolute = (path: string) => `/${path}`;

const SHELL: string[] = [...immutable, ...assets, ...prerendered]
	.map((entry) => absolute(entry.path))
	.filter((path) => !skip(path));

self.addEventListener('install', (event) => {
	// No skipWaiting here: a new version waits until the player accepts it, so the page they are
	// using is never swapped for new code in the middle of an edit.
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})()
	);
});

self.addEventListener('message', (event) => {
	if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});

/**
 * Pages come from the network first, so they are always current when there is a connection.
 * Without one, the stored copy is used; an address that was never stored (a workspace page
 * is built for each user) goes back to the start page instead of showing a browser error.
 */
async function page(request: Request, path: string): Promise<Response> {
	try {
		return await fetch(request);
	} catch {
		const cached = await caches.match(path, { cacheName: CACHE });
		return cached ?? Response.redirect(new URL('/', self.location.origin).href, 302);
	}
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (request.method !== 'GET' || url.origin !== self.location.origin) return;
	// Account data and sign-in never go through the cache.
	if (url.pathname.startsWith('/api/')) return;

	if (request.mode === 'navigate') {
		event.respondWith(page(request, url.pathname));
	} else if (SHELL.includes(url.pathname)) {
		// Files of the shell never change under the same name (the build puts a hash in it).
		event.respondWith(
			caches.match(url.pathname, { cacheName: CACHE }).then((hit) => hit ?? fetch(request))
		);
	}
});
