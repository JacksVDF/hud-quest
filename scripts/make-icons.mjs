// Draws the icons and the social image into static/ from the logo SVG and the project fonts.
// Run with `npm run icons` after changing the logo. It uses the Chrome Playwright already uses.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const logo = readFileSync('src/lib/assets/favicon.svg');
const logoUri = `data:image/svg+xml;base64,${logo.toString('base64')}`;
const font = (pkg, file) =>
	`data:font/woff2;base64,${readFileSync(`node_modules/@fontsource/${pkg}/files/${file}`).toString('base64')}`;

const GRADIENT = 'linear-gradient(90deg, #ff7a9c, #4de8ff, #b66cff)';

const social = `<!doctype html><style>
@font-face { font-family: 'Chakra Petch'; font-weight: 700; src: url(${font('chakra-petch', 'chakra-petch-latin-700-normal.woff2')}); }
@font-face { font-family: 'Space Mono'; font-weight: 400; src: url(${font('space-mono', 'space-mono-latin-400-normal.woff2')}); }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #fff; color: #000; position: relative; overflow: hidden; }
.brand { position: absolute; left: 60px; top: 44px; display: flex; align-items: center; gap: 20px; font: 700 40px 'Chakra Petch'; letter-spacing: 0.1em; }
.brand img { width: 56px; height: 56px; }
.line { position: absolute; left: 60px; right: 60px; top: 128px; height: 8px; background: ${GRADIENT}; }
h1 { position: absolute; left: 60px; top: 190px; font: 700 168px/1 'Chakra Petch'; }
p { position: absolute; left: 66px; top: 392px; font: 400 40px/1.4 'Space Mono'; }
.foot { position: absolute; left: 0; right: 0; bottom: 0; height: 72px; border-top: 3px solid #000; padding: 0 60px; display: flex; align-items: center; font: 400 24px 'Space Mono'; }
.corner { position: absolute; width: 36px; height: 36px; border: 0 solid #000; }
.tl { left: 40px; top: 160px; border-width: 4px 0 0 4px; } .tr { right: 40px; top: 160px; border-width: 4px 4px 0 0; }
.bl { left: 40px; bottom: 100px; border-width: 0 0 4px 4px; } .br { right: 40px; bottom: 100px; border-width: 0 4px 4px 0; }
</style>
<div class="brand"><img src="${logoUri}" alt="" />HUD//QUEST</div>
<div class="line"></div>
<h1>_TASKS;</h1>
<p>Complete tasks. Earn XP.<br />Level up.</p>
<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
<div class="foot">HANDLE_WITH_CARE;</div>`;

const square = (size) =>
	`<!doctype html><style>*{margin:0}img{display:block;width:${size}px;height:${size}px}</style><img src="${logoUri}" alt="" />`;

// Maskable icons are cropped to a circle or rounded square by the system, so the logo must sit
// inside the central 80% ("safe zone"). The black background runs to the edges.
const maskable = (size) =>
	`<!doctype html><style>*{margin:0}body{width:${size}px;height:${size}px;background:#000;display:grid;place-items:center}img{width:${Math.round(size * 0.6)}px;height:${Math.round(size * 0.6)}px}</style><img src="${logoUri}" alt="" />`;

const browser = await chromium.launch({ channel: 'chrome' });
try {
	const jobs = [
		['static/icon-32.png', square(32), 32, 32],
		['static/apple-touch-icon.png', square(180), 180, 180],
		['static/icon-192.png', square(192), 192, 192],
		['static/icon-512.png', square(512), 512, 512],
		['static/icon-maskable-512.png', maskable(512), 512, 512],
		['static/og-image.png', social, 1200, 630]
	];
	for (const [file, html, width, height] of jobs) {
		const page = await browser.newPage({ viewport: { width, height } });
		await page.setContent(html);
		await page.evaluate(() => document.fonts.ready);
		writeFileSync(file, await page.screenshot());
		await page.close();
		console.log('wrote', file);
	}
} finally {
	await browser.close();
}
