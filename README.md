# HUD//QUEST — Gamified To-Do

A to-do app where finishing tasks earns XP. Built with SvelteKit (Svelte 5), TypeScript and Tailwind CSS, deployed on Cloudflare Workers, styled after the "HUD Quest" design (monochrome light/dark themes, corner brackets, gradient accent).

## Run it

```sh
npm install
npm run dev        # development server
npm run build      # Cloudflare Worker + assets in .svelte-kit/cloudflare
npx wrangler dev   # run the built Worker locally (workerd + local D1)
npm run deploy     # build and deploy to Cloudflare (needs `npx wrangler login` once)
```

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

**Storage:** tasks and the theme are saved in the browser (`localStorage`). There is no backend.

## Project layout

```
e2e/                        Playwright browser tests
src/lib/xp.ts              XP values, level curve, ranks
src/lib/pagination.ts      page count, clamping, slicing
src/lib/tasks.ts           task model, XP rules, tags, filtering, safe loading
src/lib/task-store.svelte.ts   reactive store + localStorage persistence
src/lib/motion.ts          transition durations (0 with reduced motion)
src/lib/components/        UI components
src/routes/layout.css      design tokens and shared HUD styles
```

Imports use the `#lib/...` alias with the file extension (e.g. `#lib/xp.ts`), because SvelteKit 3 removed `$lib`.
