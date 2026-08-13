# Traceroute

A Numberlink / Flow-Free-style puzzle game: connect same-colored dots with a single non-crossing path, filling every cell on the grid.

**Play it:** https://thkim5937.github.io/Traceroute/

**Stack:** [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/), Canvas 2D rendering, [Vitest](https://vitest.dev/) for tests.

## Gameplay

- Each color has a set of endpoints — 2 for most colors, 3-4 for some colors on harder levels. Draw one continuous, non-branching path per color that visits every one of its endpoints, in any order.
- A level is solved when every cell on the grid is filled by exactly one color's path.
- Some levels include obstacles: blocked cells the path can't cross.
- A hint system reveals the next segment of a color's path — either read straight off a precomputed solution, or, if you've drawn yourself into a different but still-valid state, solved live against the current board.
- Undo/redo and clear let you back out of a path without restarting the level.
- Levels are star-rated (1-3) by path efficiency (total edge count vs. the level's minimum), with a 0.25-star deduction per hint used, floored at 1 star.

## Why this is a hard problem

Numberlink — and the broader class of "fill every cell with non-crossing paths connecting color pairs" — is [NP-complete](https://en.wikipedia.org/wiki/NP-completeness). In plain terms: there's no known algorithm that solves arbitrary instances efficiently as the grid grows; you're stuck doing some form of search, and the worst case scales exponentially with grid size. That shaped two decisions in this codebase:

**The solver searches, but bounded.** [`Solver.ts`](src/solver/Solver.ts) is a backtracking DFS, not brute force: it picks the most-constrained color first (fewest legal next cells), detects forced moves (a color with exactly one legal next cell isn't a real decision, so it's taken without counting as a search node), and prunes dead ends via flood-fill reachability before branching. Even with all that, it still runs under hard node-count and wall-clock limits (`SOLVER_NODE_LIMIT` / `SOLVER_TIME_LIMIT_MS`) — an aborted search returns its best candidate so far rather than hanging.

**Levels are generated, then verified — not solved-to-order.** You can't ask "give me a hard puzzle" and directly construct one; instead [`BoardGenerator.ts`](src/generator/BoardGenerator.ts) grows a random non-branching "snake" path per color until the grid is full, and the pipeline only *keeps* that board if the solver can independently verify it's solvable within budget and its solution meets a minimum difficulty threshold. Boards that don't qualify are discarded and regenerated from scratch.

## Architecture

**Generator** ([`BoardGenerator.ts`](src/generator/BoardGenerator.ts)) — grows one random non-branching path per color, cell by cell, until the grid is filled (retrying the whole fill if paths dead-end before covering every cell). For harder levels, some colors are then upgraded from 2 to 3-4 endpoints by picking well-spaced cells along that color's own already-grown path (`selectMultiEndpoints`), rather than growing separate branches.

**Solver** ([`Solver.ts`](src/solver/Solver.ts)) — the backtracking DFS described above, generalized to handle any number of endpoints per color: a color is done once every one of its endpoints has been visited, in whatever order the path reaches them.

**Difficulty scorer** ([`DifficultyScorer.ts`](src/solver/DifficultyScorer.ts)) — scores a level from the solver's *found* solution (not the generator's discarded growth shape), as total path length plus a weighted turn count. That raw score is normalized against an empirically observed min/max range from a calibration batch to produce a 1-99 `difficultyScore` and an easy/medium/hard tag.

**Offline content pipeline** ([`scripts/generate-levels.ts`](scripts/generate-levels.ts)) — generates and verifies the shipped level pool across four difficulty tiers (5x5 through 8x8 grids), rejecting and retrying any board that fails to generate, fails to solve, or falls short of its tier's difficulty floor. [`scripts/generate-weekly-levels.ts`](scripts/generate-weekly-levels.ts) extends this for ongoing content: it generates candidate levels and submits each to an automated AI review step (via the Anthropic API) before opening a PR, so new levels get a fun/difficulty sanity check beyond what the solver alone can measure.

## Local development

```bash
npm install
npm run dev
```

Run tests:

```bash
npm test
```

Generate the shipped level pool or a batch of weekly levels:

```bash
npm run generate:levels
npm run generate:weekly-levels
```

## Deployment

Pushes to `main` trigger [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the app and deploys it to GitHub Pages. A separate scheduled workflow, [`.github/workflows/weekly-level-generation.yml`](.github/workflows/weekly-level-generation.yml), runs weekly to generate and AI-review new levels, opening a PR with anything approved.
