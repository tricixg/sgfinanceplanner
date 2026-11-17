# 10 — Design system

The UI follows three principles borrowed from Apple's Human Interface Guidelines, adapted to a web finance app:

- **Clarity** — one dominant figure per card, sentence-case labels, figures right-aligned in tabular numerals.
- **Deference** — the data is the interface. Hairline borders, soft shadows, no gradients; colour is reserved for meaning.
- **Depth** — three elevation levels (surface, raised, overlay) and short, eased transitions that respect `prefers-reduced-motion`.

Everything lives in [webapp/app/globals.css](../webapp/app/globals.css) (tokens at the top, components below) and [webapp/components/ui/](../webapp/components/ui/).

## Colour

The palette is the app's original brand palette and **must not change**. New work uses the tokens, never raw hex values.

| Token | Value | Use |
|-------|-------|-----|
| `--ink` | `#11201a` | Text, primary buttons |
| `--paper` | `#f4f1e8` | Page background |
| `--card` | `#fffdf6` | Card and sheet surfaces |
| `--moss` | `#2f5d3a` | Accent, positive / income, active navigation |
| `--rust` | `#b5482e` | Negative / spending, destructive actions |
| `--gold` | `#c08a2e` | Warnings, "watch" states |
| `--sky` | `#3d6b8e` | Informational, secondary series |
| `--muted` | `#7d7560` | Secondary text |
| `--line`, `--sand` | `#dcd4bd`, `#d8cfb4` | Dividers, quiet fills |

Derived tints (`--moss-soft`, `--rust-soft`, `--gold-soft`, `--fill`, `--line-soft`, `--accent-soft`, …) are defined once in `:root`. Semantic aliases: `--positive`, `--negative`, `--warning`, `--accent`.

Chart series colours: [components/spending/chart-colors.ts](../webapp/components/spending/chart-colors.ts). Income is always moss, spending always rust.

## Type

| Token | Stack | Use |
|-------|-------|-----|
| `--font-sans` | System UI (SF Pro, Segoe UI, Roboto) | All interface text and figures |
| `--font-display` | Iowan Old Style / Palatino / Georgia | Page titles and the brand wordmark only |

Body is 15px/1.45 with `font-variant-numeric: tabular-nums`. Scale: page title 34 (28 on mobile), section `h2` 20, card `h3` 16, body 14–15, secondary 12.5–13, minimum 11. Labels are sentence case; uppercase is kept only for the brand kicker and sidebar group headings.

## Shape, elevation, motion

- Radius: `--r-xs` 6, `--r-sm` 10 (controls), `--r-md` 14 (tiles), `--r-lg` 18 (cards, sheets), `--r-pill`.
- Shadow: `--shadow-1` (cards), `--shadow-2` (hover, toasts), `--shadow-3` (modals, drawer).
- Motion: `--dur` 0.18s with `--ease`; data bars animate width over 0.5s.

## Layout

| Width | Navigation | Notes |
|-------|------------|-------|
| ≥ 1100px | 256px sidebar | Content max-width 1180px |
| 900–1099px | 224px sidebar | Tighter page padding; 4-up grids become 2-up |
| < 900px | Top bar + bottom tab bar + drawer | Large title in the page, compact title fades into the bar on scroll |

Small screens: safe-area insets are honoured on the top bar, tab bar, drawer and sheets; modals become bottom sheets under 640px; form fields are 16px so iOS Safari does not zoom; interactive targets are at least 44px (36px visible with an extended hit area for dense table actions).

Dashboards use `.dash` (vertical stack) and `.dash-grid` (12 columns; `.span-4`…`.span-8`, `.span-sm-6` for tablets).

## Components

React primitives in `components/ui/`:

| Component | Purpose |
|-----------|---------|
| `Icon` | Line-icon set (24px grid, 1.75 stroke, `currentColor`) |
| `SegmentedControl` | Pill toggle for mutually exclusive views; optional compact labels |
| `CardHeader` | Card title, subtitle and drill-down link |
| `Delta` | Signed percentage with arrow, coloured by whether the change is favourable |
| `ProgressBar` | Budget / goal progress with default, warn and over tones |
| `Skeleton`, `SkeletonLines`, `EmptyState`, `ErrorState` | Loading, empty and error states |

CSS classes used across pages:

| Class | Purpose |
|-------|---------|
| `.card`, `.card-head`, `.card-sub` | Surface and its header |
| `.stat` (`.accent`, `.warn`) with `.lbl` / `.val` / `.note` | KPI tile |
| `.grid.g2` / `.g3` / `.g4` | Responsive tile grids |
| `.btn` (`.ghost`, `.del`, `.sm`, `.on`, `.block`), `.icon-btn` | Buttons: hover, active, focus-visible, disabled states |
| `.seg` | Segmented control (legacy `.bto-mode-segment`, `.poker-fx-segment`, `.oncall-seg` share the look) |
| `.tag`, `.status-pill`, `.delta` | Status and change indicators |
| `.list`, `.list-row` | Mobile-friendly rows (transactions, commitments) |
| `.hero`, `.metric`, `.rank`, `.alloc-bar`, `.health-tile` | Dashboard building blocks |
| `.table-scroll` | Horizontal scroll container for wide tables |

Tables: text is left-aligned; add `className="num"` to both the `th` and `td` of numeric columns so figures right-align. Wrap wide tables in `.table-scroll`. Where a table has more than about five columns, provide a `.list` alternative for small screens (see `TransactionsHistoryPage`).

Charts: defaults (font, grid, tooltip, bar radius) are set once in [components/chart-setup.ts](../webapp/components/chart-setup.ts). Give each chart container `role="img"` and an `aria-label`.

## Accessibility

- Visible `:focus-visible` ring on every interactive element.
- Icons are decorative (`aria-hidden`); icon-only buttons carry an `aria-label`.
- Colour is never the only signal: deltas have arrows and signs, statuses have text.
- Navigation exposes `aria-current="page"`; the drawer closes on Escape and locks page scroll.
