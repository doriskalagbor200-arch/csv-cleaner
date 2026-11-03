# Doris CSV Cleaner

A local CSV cleaning workspace for importing a file, reviewing quality findings, applying simple transformations, and downloading a cleaned CSV with a quality report.

## Stack

- React 19 with Vite 8 for the interface
- FastAPI for upload, parsing, validation, transformation, and downloads
- SQLite for job metadata; source and output files stay in `data/`
- Python 3.14 and Node.js 24 LTS

## Run locally

Start the API in one terminal:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Start the web app in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5173`). The API is available at `http://127.0.0.1:8000`; its interactive schema is at `/docs`.

The current execution environment did not have Node.js/npm or FastAPI installed, so the app source has not been launched here. Install the runtimes above before running it.

## Use the app

1. Import a UTF-8 `.csv` file no larger than 10 MB. Choose comma, tab, or semicolon and whether the first row contains headers.
2. Review blank cells and duplicate records in the source preview.
3. Choose whether to trim whitespace, normalize selected columns to lower or upper case, and optionally remove duplicates by full row or selected key columns.
4. Run the job. Download the cleaned CSV and the quality report CSV. Blank values remain in the output and are counted in the report.

Jobs persist in the local SQLite database and `data/jobs/` until deleted from the job view. Set `DORIS_DATA_DIR` to move both to a different local directory. The API binds to loopback in the documented run command; this MVP has no accounts or cloud storage.

## Sample data

Use `examples/sample_contacts.csv` to preview whitespace, a blank value, and an exact duplicate. It contains invented demonstration records using the reserved `.test` email domain.

## Demo walkthrough

1. Import `examples/sample_contacts.csv` with comma delimiter and header enabled.
2. Point out the blank `city` cell and repeated Jon Bell row in the preview.
3. Enable trimming and full-row deduplication, then run the job.
4. Download the cleaned CSV and report; show that the first duplicate remains, the blank cell stays, and the report counts both conditions.
5. Reopen the completed job from the list and delete it to demonstrate local retention and cleanup.

## Acceptance checks

- Happy path: import the sample CSV, confirm the blank and duplicate findings, select trimming and deduplication, run the job, then open both downloaded CSV files.
- Failure path: try a non-CSV file, a malformed/uneven CSV, and a file over 10 MB; each should show a clear error and leave no partial job behind.
- Persistence: restart the API, reopen a completed job, then delete it and confirm it disappears from the list.

## Visual direction

The app uses the Forma-inspired dark palette from `DESIGN.md` while keeping the CSV workflow and React/FastAPI stack in `PLAN.md`. The progress line tracks the three task steps; a small row-alignment canvas appears only during processing. The Motion toggle pauses nonessential animation. The Forma website-builder copy and showcase assets are intentionally not used in this data-cleaning interface.
