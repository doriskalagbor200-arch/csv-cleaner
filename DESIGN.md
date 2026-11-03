# Doris CSV Cleaner — Design Direction

## Product and visual reference

The product is the local CSV-cleaning MVP described in [`PLAN.md`](PLAN.md). The Forma brief is a visual reference only: use its dark palette, editorial typography, copper interaction accent, star marker, and restrained particle-to-structure motion. Do not copy the AI website-builder content, showcase projects, Forma logo, or its landing-page section order into the data-cleaning product.

The implementation stack remains React and FastAPI from `PLAN.md`. Use the Forma visual language within the app shell; do not switch to Tailwind CDN or a standalone vanilla-JavaScript page.

## Design goals

- Make the next useful action obvious: import a CSV, inspect findings, choose rules, run, and download.
- Put real dataset information first. Use a readable preview table and quality counts instead of decorative metrics or a marketing-style hero.
- Keep the interface calm and technical, with a warm near-black surface, soft ivory text, copper for primary action and important marks, and quiet structural lines.
- Use motion only to confirm a user action or explain data becoming structured. Every motion effect can be paused and respects reduced-motion preferences.

## Visual system

### Color

```css
:root {
  --bg: #111110;
  --panel: #191918;
  --ink: #f2f0e9;
  --muted: #96948d;
  --copper: #e8ab7e;
  --line: rgba(244, 236, 222, .13);
}
```

- Keep `--bg` as the workspace ground and `--panel` for the preview, settings, and report surfaces.
- Use `--copper` for the primary action, active workflow step, the `✳` mark, and selected data warnings. Keep normal navigation and neutral controls monochrome.
- Use green only for successful completion and red only for destructive or failed states. Do not use violet/indigo or rainbow category colors.
- Separate panels with a subtle border or one tone step, not both a heavy border and a shadow. Reserve shadows for floating menus and dialogs.

### Type and layout

- DM Sans is the interface face. Instrument Serif has one expressive role in short onboarding or processing phrases; do not use it for dense data or controls.
- Use tabular figures for row counts and right-align numeric columns. Labels and table content remain at readable sizes, with no dense text below 11px.
- Use a compact application title, sentence-case labels, consistent 4px-based spacing, and one chosen panel radius. Avoid a large landing-page headline, icon-topped KPI tiles, decorative badges, or placeholder charts.
- On desktop, use a labelled left rail and a wide canvas. The title, preview, findings, and action align to the same content edges.
- On phone, fold navigation into a compact top bar, keep one primary action visible, and convert wide tables into a horizontally scrollable preview frame rather than causing page-level sideways scrolling.

## Workspace screens

### Jobs

The first screen is the saved-jobs workspace. It shows the product name, local-storage scope, a clear “New cleaning job” action, and recent jobs with filename, row count, quality-flag count, updated date, and draft/completed status. The first-run state keeps the same frame and gives the import action the visual lead; it does not show invented totals.

### Import

Provide a CSV drop zone and browse control, a 10 MB limit, delimiter selection (comma, tab, semicolon), and a header-row toggle. State that UTF-8 files are expected and data stays local. Show selected filename and size before upload; reject unsupported extensions and oversized files with a clear inline message.

### Review and rules

- Show file identity, record count, blank-cell and duplicate findings, and the first 30 source rows.
- Mark blank cells and duplicate rows directly in the preview with text labels or accessible status, not color alone.
- Provide controls for trimming whitespace, lower/upper case normalization with selected columns, and optional deduplication by full row or selected key columns.
- Recompute duplicate findings and row markers when rule settings change. Preserve blank values in output and say so beside the run action.
- Keep the primary “Run cleaning” action close to the rule summary and preserve the original source file.

### Processing and results

- Processing feedback uses a small canvas that animates particles into aligned rows. It is a response to the user's run action, not an ambient background effect. Pause rendering when hidden, paused, or reduced-motion is active.
- Show a concise results summary with input rows, output rows, blank cells, duplicate rows, and rows removed. Provide separate downloads for the cleaned CSV and quality-report CSV.
- The report covers the run totals and blank-cell counts per column. A deduplicated output retains the first row in each matching group. Blank-value rows stay in the output.
- Reopening a saved job restores its source, settings, and completed outputs. Deletion removes the job and its local files after confirmation.

## Interaction and motion

- Use a thin copper progress line as the three-step task indicator (Import → Review → Results), not as a marketing-page scroll-progress bar.
- Preserve the small `✳` marker as the app's visual cue for the primary action or data alignment; do not add Forma's `FORMA / 02` breadcrumb or brand mark.
- The bottom-right Motion toggle pauses nonessential animations by applying `.motion-paused` to `<body>`. Its accessible name and pressed state must describe the current mode.
- Respect `prefers-reduced-motion` as the higher-priority setting. In reduced mode, show the settled canvas arrangement and use immediate state changes while preserving every label and control.
- Use short transitions for hover, focus, toggles, and status feedback only. No word-by-word manifesto reveal, sticky scroll narrative, animated showcase gallery, or global ambient particle field in the cleaning workspace.

## Data states and accessibility

- Empty jobs: explain the next step and offer file import in the content area.
- Empty preview: show the table frame and headers; state that the file contains no data rows.
- Zero findings: show `0` as a real count and say no blank or duplicate records were found.
- Missing values: use an em dash only when a value is not applicable; actual empty cells are marked as blank.
- Loading: retain the final layout and labels, replacing changing content with stable placeholders. No shimmer.
- Errors: explain what failed and how to retry without clearing the user's selected file or rules.
- Use semantic landmarks and headings, explicit labels for all fields, keyboard-operable file selection and tables, visible focus, and at least 44px touch targets on mobile.
- Never rely on hover alone to reveal a value or issue. Check text contrast on both `--bg` and `--panel` and support browser zoom.

## Acceptance criteria

- A new user can find the import action immediately and understand that files are stored locally.
- The core import → review → configure → run → download journey fits the visual system and does not use marketing-page content.
- The quality preview responds to the active duplicate key and transformation settings.
- The Motion toggle pauses the processing canvas, and OS reduced-motion preference produces a settled static view.
- Desktop, tablet, and phone layouts keep the primary action accessible and prevent page-level horizontal overflow.
