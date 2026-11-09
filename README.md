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
npm run deploy     # build and deploy to Cloudflare (needs `npx wrangler login` once)
```

## Deploy checklist

1. `npx wrangler login`
2. `npm run db:migrate:remote` (applies the files in `migrations/` to the real D1 database)
3. `npx wrangler secret put BETTER_AUTH_SECRET` (a long random value; never commit it)
4. `npm run deploy`
5. `npm run smoke` (checks the live site with a throwaway account that it deletes at the end; pass another URL as `npm run smoke -- https://...`)

`BETTER_AUTH_URL` is optional; without it the app uses the URL of each request.

## Checks

```sh
npm run check      # svelte-check (types)
npm run lint       # prettier + eslint
npm test           # unit tests (vitest)
npm run test:e2e   # browser tests (Playwright, builds the app and uses installed Google Chrome)
```

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

**Tags and filters:** up to 3 tags per task (20 characters each, lowercased). Filter the list by status (all/open/done) and by tags; selecting several tags shows tasks that have all of them. Filters reset on reload. The list shows 10 tasks per page, with numbered page buttons.

**Workspaces:** the home page shows a card per workspace (name, open and done tasks, progress bar) plus an `INBOX` card. Tasks without a workspace live in the INBOX, whose list is also shown under the cards. Each card opens `/w/<id>` with that workspace's tasks, its own filters and pagination, and the number of pending tasks. Up to 10 workspaces, with a name of 1–30 characters that is unique regardless of case (`INBOX` is reserved). A task is created in the workspace you are in, or you pick one in the form on the home page, and you can move it from its edit form. Level and XP are global: they add up all workspaces. Deleting a workspace asks first and sends its tasks to the trash.

**One "ten":** 10 is a single rule in the code (`PAGE_SIZE`): tasks per page, trash rows per page, and the most workspaces a user can have.

**Trash:** deleting a task (or a workspace) moves its tasks to the `_TRASH;` section instead of removing them. The trash is shared by all workspaces and each row says where it came from. A trashed task gives no XP, can be restored (its XP returns, in its workspace, or in the INBOX if that workspace no longer exists) or deleted forever, and is removed automatically after 30 days. The trash shows 10 rows per page. It is saved with the rest of the data (browser or account), and counts toward the 500-task account limit.

**Feedback:** messages close by themselves after 6 seconds with a visible countdown; hovering or focusing a message pauses it. The header (logo, login/account, theme) stays at the top while scrolling, and changing page scrolls back to the first task.

**Accounts and storage:**

- Without an account (guest), workspaces and tasks are kept in the browser (`localStorage`). A list saved by an older version (a plain array of tasks) is still read, as INBOX tasks.
- With an account (email + password, at least 10 characters), workspaces and tasks are kept in Cloudflare D1 (one JSON document per user) and follow you across browsers. There is no email verification and no password recovery yet.
- After the first login the app offers to import the guest workspaces and tasks of that browser into the account (nothing is imported without asking; tasks already in the account are not duplicated, a workspace whose name already exists is merged into the existing one, and when the limit of 10 is reached the rest of its tasks go to the INBOX).
- Login endpoints are rate limited per IP. Passwords are hashed by Better Auth (scrypt). Every task query is filtered by the signed-in user's id (`src/lib/server/db.ts`), and the API accepts at most 500 tasks and 512 KB per save.
- Every save says which version of the list it is based on (`If-Match` / `ETag`). If another tab or device saved first, the server answers 412, nothing is overwritten, and the app asks you to reload your tasks.
- The account page (`/account`, click your email in the header) can delete the account and all its data. The password is always required.
- The theme is always saved in the browser.

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
src/lib/app.svelte.ts      starts the app: session, storage choice, guest import
src/lib/notice.svelte.ts   the message line shared by every page
src/lib/task-store.svelte.ts   reactive store; storage is swappable
src/lib/storage.ts         TaskStorage: localStorage (guest) and /api/tasks (account)
src/lib/session.svelte.ts  who is signed in, as seen by the browser
src/lib/server/auth.ts     Better Auth config (D1, rate limits)
src/lib/server/db.ts       the only code that reads/writes a user's tasks
src/routes/api/tasks/      GET/PUT the signed-in user's workspaces and tasks
src/routes/w/[id]/         one workspace (not prerendered: it is the user's own data)
src/routes/login, signup, account/  auth and account pages
migrations/                D1 schema, a single 0001_init.sql (apply with the db:migrate:* scripts)
.github/workflows/ci.yml   check, lint, unit and e2e tests on every push
src/lib/motion.ts          transition durations (0 with reduced motion)
src/lib/components/        UI components
src/routes/layout.css      design tokens and shared HUD styles
```

Imports use the `#lib/...` alias with the file extension (e.g. `#lib/xp.ts`), because SvelteKit 3 removed `$lib`.
