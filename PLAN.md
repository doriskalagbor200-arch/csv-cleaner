# Create `PLAN.md` — Local CSV Cleaning MVP

## Summary

Create a root-level `PLAN.md` with the agreed implementation sequence for a local CSV-cleaning web app. The document will guide a React frontend and FastAPI backend that process files up to 10 MB, save jobs locally, and provide cleaned CSV and quality-report downloads.

## Implementation changes

- **Stack and local setup:** Specify React 19.3 with Node.js 24 LTS, Python 3.14, FastAPI, SQLite, and local file storage. FastAPI currently lists Python 3.14 support; React 19.3 is the latest documented release, and Node 24 is an LTS line. [React versions](https://react.dev/versions), [FastAPI package metadata](https://github.com/fastapi/fastapi/blob/master/pyproject.toml), [Node.js release](https://nodejs.org/uk/blog/release/v24.22.0), [Python releases](https://www.python.org/doc/versions/)
- **Data flow and API:** Plan endpoints to create/list/read/delete jobs, inspect upload previews and validation summaries, run transformations, and download the cleaned CSV and report CSV. Store job settings and status in SQLite; use generated job IDs and local paths for source and output files.
- **User workflow and rules:** Plan upload with a 10 MB cap, delimiter selection (comma, tab, or semicolon), and header toggle; preview; select transformation settings and target columns; run synchronously; review and download results. Flag blank values and duplicates. Trimming and case normalization are configurable; deduplication is optional and can match full rows or selected key columns.
- **Errors and file handling:** Treat empty or whitespace-only cells as blank. Reject malformed CSVs with a clear error rather than producing partial results. When deduplication is enabled, retain the first matching record and report how many were removed. Deleting a job removes its metadata and associated files. Keep the local service bound to localhost; do not add accounts or hosted deployment.
- **Documentation and demo:** Include setup instructions, configuration and data-directory notes, sample data, and a short demo script covering architecture and trade-offs.

## Test plan

- Verify CSV import, preview, blank and duplicate findings, configurable transformations, saved-job reopening, deletion, and both downloads in the end-to-end flow.
- Verify rejection and clear errors for files over 10 MB and malformed CSV input.
- Verify deduplication by full row and selected key columns, including first-record retention.
- Verify settings and generated files remain associated with the correct job after restarting the local service.

## Assumptions

- This is a single-user local workspace; no real authentication, cloud persistence, retention timer, or public deployment is included.
- Input is UTF-8. A file without headers uses generated column labels for preview and rule selection.
- Job data persists until the user deletes the job.
- Exact dependency patch versions will be pinned during implementation based on the selected runtime lines.
