# HUD//QUEST — Gamified To-Do

A to-do app where finishing tasks earns XP. Built with SvelteKit (Svelte 5), TypeScript and Tailwind CSS, deployed on Cloudflare Workers, styled after the "HUD Quest" design (monochrome light/dark themes, corner brackets, gradient accent).

## Run it

```sh
npm install
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" > .dev.vars   # local secret, git-ignored
npm run db:migrate:local   # create the local D1 tables
npm run dev        # development server
npm run build      # Cloudflare Worker + assets in .svelte-kit/cloudflare
npx wrangler dev   # run the built Worker locally (workerd + local D1)
npm run deploy     # build, deploy to Cloudflare, then smoke-test the live site (needs `npx wrangler login` once)
```

## Deploy checklist

1. `npx wrangler login`
2. `npm run db:migrate:remote` (applies the files in `migrations/` to the real D1 database)
3. `npx wrangler secret put BETTER_AUTH_SECRET` (a long random value; never commit it)
4. `npm run deploy`
   `npm run deploy` already ends with `npm run smoke`, which checks the live site with a throwaway account that it deletes at the end. Run it alone, or against another URL, with `npm run smoke -- https://...`.

`BETTER_AUTH_URL` is optional; without it the app uses the URL of each request.

## Checks

```sh
npm run check      # svelte-check (types)
npm run lint       # prettier + eslint
npm test           # unit tests (vitest)
npm run test:e2e   # browser tests (Playwright, builds the app and uses installed Google Chrome)
npm run icons      # redraws static/*.png (icons, social image) from src/lib/assets/favicon.svg
```

The e2e suite includes an accessibility scan (axe, WCAG 2.2 AA) of every page in both themes, plus keyboard and focus-outline checks.

## How it works

**XP by complexity**

| Complexity | XP  | Extras                                                               |
| ---------- | --- | -------------------------------------------------------------------- |
| Easy       | 10  | —                                                                    |
| Medium     | 25  | Subtasks (no XP of their own); completes when its last one is ticked |
| Hard       | 50  | Project with milestones; XP is released as they are done             |

- A medium task with subtasks completes automatically when all subtasks are done, and reopens (losing its XP) if one is unticked or a new subtask is added.
- A hard project releases `floor(50 × done / total)` XP. Un-checking anything removes its XP again, so XP can't be farmed.
- Level N needs `N × 100` XP to reach level N+1.
- A new rank every 10 levels: EMBER (1–9), VESTIGE, LIMINAL, ZENITH, ECLIPSE, PARAGON, ETERNAL (60+).

**Deadlines and repeating tasks:** any task can have a due date (a calendar day, no time). The row shows `DUE NOV 12`, `TODAY` or `OVERDUE`, and the filter `DUE TODAY OR OVERDUE` keeps only open tasks that are due. Missing a date costs no XP. A task can repeat daily, weekly or monthly (it needs a due date). Completing it creates the next copy, on the first date of the series that is after today, with the same tags, workspace and unticked subtasks. Undoing the completion removes that copy while it is untouched, and a task never creates two copies. Days always follow the player's own time zone.

**Streaks and statistics:** every completion is counted on the day it happened in a small per-day record (`activity`: tasks by complexity and XP, last 365 days), kept with the rest of the data. Deleting a task or emptying the trash never changes it. Undoing a completion takes it back from the day it was counted on. A streak is the number of days in a row with at least one completed task; today may still be empty, and the streak ends only after a whole day with nothing done. The level card shows the streak and links to `/stats`: current and best streak, the last 14 days as bars, and 7 and 30 day totals by complexity.

**Calendar:** the home page opens with a month calendar (Monday first, six weeks so it never changes height) of every task that has a due date, from all workspaces and the INBOX. Each day shows how many tasks are open (`■2`), late (`!2`) or all done (`[X]`); today has the gradient underline. Clicking a day lists its tasks below (open first, done ones crossed out); clicking it again clears the list, and today is picked on load. Trashed tasks are not shown, and a repeating task shows only its current due date. From the list of a day you can finish or reopen a task (same XP and messages as the main list; tasks with subtasks or milestones close by themselves, so their button is locked), move an open task to another day by dragging it onto the day or with its date field, and press `+ ADD` to fill the due day of the new-task form. Arrow keys move between days. Every workspace page (and the INBOX page) has the same calendar with only the tasks of that workspace, and `+ ADD` there creates the task in it; each page starts on today. The calendar has two views, `WEEK` and `MONTH`: phones (under 640 px wide) start on the week, which needs far less room, and wider screens on the month; switching keeps the picked day in sight. The title of the view, `TODAY`, `<` and `>` change what is shown (a month or a week at a time); the logic is in `src/lib/calendar.ts` and the screen in `src/lib/components/Calendar.svelte`.

**Your data:** the account page can download everything (workspaces, tasks with the trash, daily record) as one JSON file, with no email or account id inside. A short welcome panel explains the rules on the very first visit and never comes back once closed (or once there is any data).

**Pages and sharing:** the app has its own icons, a theme colour and a social preview image (`static/og-image.png`). Unknown addresses and server errors show an HUD-styled 404/500 page with the right status code. `SITE_URL` in `src/lib/site.ts` is the one place to change when a custom domain is added.

**Tags and filters:** up to 3 tags per task (20 characters each, lowercased). Filter the list by status (all/open/done) and by tags; selecting several tags shows tasks that have all of them. Filters reset on reload. The list shows 10 tasks per page, with numbered page buttons.

**Workspaces:** the home page shows a card per workspace (name, open and done tasks, progress bar) plus an `INBOX` card. Tasks without a workspace live in the INBOX, whose list is also shown under the cards. Each card opens `/w/<id>` with that workspace's tasks, its own filters and pagination, and the number of pending tasks. Up to 10 workspaces, with a name of 1–30 characters that is unique regardless of case (`INBOX` is reserved). A task is created in the workspace you are in, or you pick one in the form on the home page. Every task row has a selector that shows where it is and moves it with one choice; the edit form has one too. Level and XP are global: they add up all workspaces. Deleting a workspace asks first and sends its tasks to the trash.

**One "ten":** 10 is a single rule in the code (`PAGE_SIZE`): tasks per page, trash rows per page, and the most workspaces a user can have.

**Trash:** deleting a task (or a workspace) moves its tasks to the `_TRASH;` section instead of removing them. The trash is shared by all workspaces and each row says where it came from. A trashed task gives no XP, can be restored (its XP returns, in its workspace, or in the INBOX if that workspace no longer exists) or deleted forever, and is removed automatically after 30 days. The trash shows 10 rows per page. It is saved with the rest of the data (browser or account), and counts toward the 500-task account limit.

**Layout and long text:** the header shows only what comes before the @ of your email (the full address is in the tooltip and on the account page), and long names wrap instead of ending in "…". The corner brackets of the cards have 20 px arms.

**Layout and long text (rows):** every task row puts its full title on its own line, in the same button as DO IT (so the focus ring wraps both), with the labels (XP, size, deadline, repeat) and the actions (move, edit, delete) below it, sharing a row when there is room and wrapping apart when there is not. Long names with no spaces (addresses, pasted text) wrap instead of widening the page (`.wrap` in `layout.css`), in tasks, subtasks, workspace names and cards, the trash and the calendar's day list. The main sections (calendar, new task, workspaces, task list, trash) are set apart by a light rule and extra space (`.sect`). Free-text fields set `autocomplete="off"`, so the browser's list of saved entries no longer covers the keyboard on phones; only the email and password fields keep theirs.

**Feedback:** messages close by themselves after 6 seconds with a visible countdown; hovering or focusing a message pauses it. The header (logo, login/account, theme) stays at the top while scrolling, and changing page scrolls back to the first task.

**Accounts and storage:**

- Without an account (guest), workspaces and tasks are kept in the browser (`localStorage`). A list saved by an older version (a plain array of tasks) is still read, as INBOX tasks.
- With an account (email + password, at least 10 characters), workspaces, tasks and the daily record are kept in Cloudflare D1 (one JSON document per user) and follow you across browsers. There is no email verification and no password recovery yet.
- After the first login the app offers to import the guest workspaces and tasks of that browser into the account (nothing is imported without asking; tasks already in the account are not duplicated, a workspace whose name already exists is merged into the existing one, and when the limit of 10 is reached the rest of its tasks go to the INBOX).
- Login endpoints are rate limited per IP. Passwords are hashed by Better Auth (scrypt). Every task query is filtered by the signed-in user's id (`src/lib/server/db.ts`), and the API accepts at most 500 tasks and 512 KB per save.
- Every save says which version of the list it is based on (`If-Match` / `ETag`). If another tab or device saved first, the server answers 412, nothing is overwritten, and the app asks you to reload your tasks.
- The account page (`/account`, click your user name in the header) can delete the account and all its data. The password is always required.
- The theme is always saved in the browser.

**Install and offline (PWA):** the app can be installed (`static/manifest.webmanifest`, icons 192/512 plus a maskable one, made by `npm run icons`) and opens without a network. A service worker (`src/service-worker/`) keeps only the shell: scripts, styles, fonts, icons and the prerendered pages. It never touches `/api/*`, so no account data is stored on the device and one person's tasks can never show up for another on a shared computer. Pages are fetched from the network first and fall back to the stored copy; an address that was never stored (such as a workspace page) goes to the start page.

- Guests work fully offline: their data already lives in the browser.
- Signed-in users can keep reading what is on screen when the connection drops, and a notice says changes are not saved. There is no queue of pending changes: nothing is sent later. If they _open_ the app offline, their tasks cannot be shown (they are not kept on the device), so a notice says so; the guest list is not shown in their place. When the connection returns, the account loads by itself.
- A new version never replaces the page you are using. A `NEW VERSION READY` bar appears, and the app reloads only after `RELOAD >` is pressed.
- The Playwright tests (`e2e/pwa.spec.ts`) are the only ones that allow the service worker; the rest run with it blocked so pages are not cached between tests.

## Known limits

- No email verification and no password recovery yet (they need an email sender and a domain). A forgotten password means a lost account.
- `npm audit` reports 15 low/moderate issues, all in dev tooling (eslint, minimatch) or a prototype-pollution advisory in `deepmerge`, which is used by the build tool only. The only fixes npm offers are major downgrades, so they are not applied. Re-check after dependency updates.

## Project layout

```
e2e/                        Playwright browser tests
src/lib/xp.ts              XP values, level curve, ranks
src/lib/pagination.ts      page count, clamping, slicing
src/lib/tasks.ts           task model, XP rules, tags, filtering, safe loading
src/lib/workspaces.ts      workspace model, name rules, grouping, loading of the saved document
src/lib/calendar.ts        month grid, tasks per day, cell text for the calendar
src/lib/dates.ts           calendar days, due state, next occurrence of a repeating task
src/lib/activity.ts        the per-day record, streaks, statistics
src/lib/today.svelte.ts    the current day, kept fresh across midnight
src/lib/export.ts          builds and downloads the JSON export
src/lib/site.ts            site URL and description for social previews
scripts/make-icons.mjs     draws the PNG icons and the social image
src/lib/app.svelte.ts      starts the app: session, storage choice, guest import
src/lib/notice.svelte.ts   the message line shared by every page
src/lib/task-store.svelte.ts   reactive store; storage is swappable
src/lib/storage.ts         TaskStorage: localStorage (guest) and /api/tasks (account)
src/lib/session.svelte.ts  who is signed in, as seen by the browser (and whether the server is unreachable)
src/service-worker/        the service worker: shell cache, offline pages, waits for the player to accept updates
static/manifest.webmanifest  install manifest
src/lib/server/auth.ts     Better Auth config (D1, rate limits)
src/lib/server/db.ts       the only code that reads/writes a user's tasks
src/routes/api/tasks/      GET/PUT the signed-in user's workspaces and tasks
src/routes/w/[id]/         one workspace (not prerendered: it is the user's own data)
src/routes/stats/          streaks and statistics
src/routes/+error.svelte   404 / 500 page
src/routes/login, signup, account/  auth and account pages
migrations/                D1 schema, a single 0001_init.sql (apply with the db:migrate:* scripts)
.github/workflows/ci.yml   check, lint, unit and e2e tests on every push
src/lib/motion.ts          transition durations (0 with reduced motion)
src/lib/components/        UI components
src/routes/layout.css      design tokens and shared HUD styles
```

Imports use the `#lib/...` alias with the file extension (e.g. `#lib/xp.ts`), because SvelteKit 3 removed `$lib`.

Tag git: savepoint-2026-11-18, sobre el commit 7a9cc52. El árbol de trabajo estaba limpio.
Bundle del repo completo: ../backups/hud-quest-savepoint-2026-11-18.bundle. Lo verifiqué y está bien. Contiene todo el historial.
Copia de archivos: ../backups/hud-quest-files-2026-11-18.tar.gz. No incluye node_modules, .git ni .dev.vars, así que no hay secretos.
Para volver atrás: git reset --hard savepoint-2026-11-18.
