# VoltDown — 1000 Solutions to High Electricity Prices

VoltDown is a single-file, no-build, no-dependency web app that lists **1,000 actionable solutions to high electricity prices**, each decomposed into 3–5 subtasks with editable, clickable statuses. It runs entirely in your browser from one `index.html` file — there is nothing to install, no server required, and no network calls. The full catalog is generated locally and deterministically on load, then rendered as a searchable, filterable, sortable board of cards with a live progress dashboard. Click any solution to open a **right-side detail panel** with its full subtask list and an estimated cost per subtask. Any status changes you make are saved to your own device.

## Verified facts

These numbers were verified by running the generator in Node:

- **Exactly 1,000 unique solutions** (no duplicate titles).
- **3,954 subtasks** in total.
- **3–5 subtasks per solution.**
- Spread across **17 categories.**

## Features

- **Search** across solution titles, categories, and subtask text.
- **Category filter chips** — one click to focus a single category (each chip shows its count); an "All" chip resets the filter.
- **Status filter** — show solutions that have a To-do, an In-progress, or a Blocked subtask, or that are fully complete.
- **Sort** by progress (low → high or high → low), by impact (High first), by **feasibility (High first)**, or by **quick wins (impact × feasibility)** — surfacing solutions that are both high-impact and highly feasible — plus a default order.
- **Live stats bar** — totals for solutions, subtasks, fully-complete solutions, percent of subtasks done, and blocked subtasks, with a **segmented progress bar** showing the done / in-progress / blocked / to-do mix.
- **Master–detail panel** — click a card (or focus it and press **Enter**/**Space**) to slide open a right-side detail panel showing the solution's full subtask list, each subtask's estimated cost, the rolled-up estimated total, and live progress. Close it with the **✕** button, the **Esc** key, or by clicking the backdrop. Cards are keyboard-accessible (`role="button"`, focusable, with an ARIA label) and the active card stays highlighted while the panel is open. The panel is a focus-managed dialog — see **Accessibility** below.
- **Per-subtask cost + per-solution total** — every subtask carries an illustrative estimated cost (USD), and each solution rolls them up into an **estimated total cost** shown as a pill on the card and broken out in the detail panel.
- **Feasibility score** — every solution carries an illustrative **feasibility score (0–100)**, displayed as a **High / Medium / Low** band, shown next to the impact and cost pills on both the cards and the right-side detail panel.
- **Clickable status cycling** — click any subtask status (on a card or in the panel) to advance it through **To-do → In progress → Done → Blocked** and back to To-do. Changing a status inside the panel now re-renders the grid live whenever a status-dependent filter or the progress sort is active, so affected cards leave or reorder correctly without a manual refresh.
- **Per-card mini progress** — each card shows a small progress bar and a `done/total` count that updates instantly as you change statuses.
- **localStorage persistence** — your status changes are saved to your device and restored on reload.
- **Reset progress** — clear all saved status changes (with a confirmation prompt).
- **Export JSON** and **Export CSV** — download the full catalog (with your current statuses, **the cost columns** — per-subtask estimated cost and the per-solution rolled-up estimated total — and the **feasibility score and band**) as `voltdown-solutions.json` or `voltdown-solutions.csv`.
- **Infinite scroll** — cards load in batches of ~60 as you scroll, so all 1,000 solutions stay responsive.
- **Responsive dark theme** — a polished dark UI that reflows to a single column on small screens.

## Accessibility

VoltDown is built to be usable with a keyboard and a screen reader:

- **Detail panel is a proper dialog** — the right-side panel is marked up as `role="dialog"` with `aria-modal="true"` and `aria-labelledby="detailTitle"`, so assistive tech announces it as a modal tied to the solution's title.
- **Focus management** — when the panel opens, focus moves into it (onto the close button); the background (header, stats, controls, and main grid) is set `inert` so it can't be reached by keyboard or screen reader while the dialog is open. When the panel closes, focus returns to the card that opened it.
- **Labeled controls** — the search input and the status and sort `<select>`s all carry `aria-label`s so their purpose is clear even without a visible `<label>`.
- **Higher-contrast "Low" pills** — the **Low impact** and **Low feasibility** pills now use higher-contrast text plus a visible border, so they no longer rely on color alone and meet contrast expectations.
- **Keyboard-operable filter chips** — the category filter chips are real `<button type="button">` elements with `aria-pressed` reflecting the active category, so they can be reached and toggled with the keyboard (not just the mouse).
- **Screen-reader status announcements** — a visually-hidden live region (`role="status"` / `aria-live="polite"`) announces subtask status changes (e.g. "… set to In progress") so screen-reader users hear updates as they cycle a status.
- **Progressbar semantics** — every progress bar (the per-card mini-bars, the detail-panel bar, and the stats segmented bar) carries `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax` and a summarizing `aria-label`, so assistive tech can read out progress.
- **Visible focus ring** — a shared `:focus-visible` ring is applied to chips, buttons, inputs, and selects, so keyboard focus is always clearly visible.

## How the data is generated

The catalog is produced **deterministically** so the output is stable across reloads — you see the same 1,000 solutions every time, in the same order, with the same default statuses.

- A seeded PRNG (**mulberry32**) drives all the random choices; each solution is seeded from its own id, so generation is fully reproducible.
- Each of the 17 categories contributes a set of solution **"stems"** (e.g. "Subsidize home battery storage"), which are combined with **scope qualifiers** (e.g. "for low-income households", "in rural areas", "using AI-driven optimization") to form complete solution titles.
- The generator walks the categories **round-robin** so the list stays balanced across all categories.
- **Uniqueness is enforced** — if a generated title collides with one already produced, a differentiator (e.g. "(phase 2)") is appended so every title is distinct.
- Each solution then gets a seeded impact rating, cost rating, and 3–5 subtasks drawn from a shared subtask bank, each with a seeded default status.

## Honesty / disclaimer

The **impact ratings**, **cost ratings**, **per-subtask cost estimates** (and the per-solution rolled-up totals derived from them), **feasibility scores** (and their High / Medium / Low bands), and **default statuses** are **illustrative seeded values**, generated to make the tracker usable and visually meaningful out of the box. The dollar figures in particular are seeded from each solution's cost tier, and the feasibility scores are seeded per solution — they are **not** sourced estimates, expert assessments, quotes, or real project data, and they should not be read as evidence about which solutions are actually most effective, cheapest, most feasible, or already underway, nor as real budgets. Treat the catalog as a structured starting point for thinking and planning — the ratings, costs, and statuses are there so the dashboard, panel, and filters have something to work with, not as factual claims.

## Run locally

From the project directory:

```bash
cd electricity-solutions
python3 -m http.server 4310
```

Then open <http://localhost:4310> in your browser.

Or, since it's a single self-contained file, you can simply **open `index.html` directly** in any modern browser — no server needed.

## Tech

- Vanilla **HTML / CSS / JavaScript**.
- **Zero dependencies**, no build step, no framework.
- A **single file** (`index.html`) containing all markup, styles, and logic.
- Persistence via the browser's **localStorage**; exports via in-browser Blob downloads.

## Project structure

```
electricity-solutions/
├── index.html   # the entire app — markup, styles, data generator, and logic
└── README.md    # this file
```
