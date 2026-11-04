from __future__ import annotations

import csv
import json
import os
import shutil
import sqlite3
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field


ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("DORIS_DATA_DIR", ROOT_DIR / "data")).expanduser()
JOBS_DIR = DATA_DIR / "jobs"
DB_PATH = DATA_DIR / "jobs.sqlite3"
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
PREVIEW_LIMIT = 30
DELIMITERS = {"comma": ",", "tab": "\t", "semicolon": ";"}

DEFAULT_SETTINGS = {
    "trim_whitespace": True,
    "case_mode": "none",
    "case_columns": [],
    "dedupe": False,
    "dedupe_mode": "row",
    "dedupe_columns": [],
}


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    with connect_db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_path TEXT NOT NULL,
                output_path TEXT,
                report_path TEXT,
                original_filename TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                delimiter TEXT NOT NULL,
                has_header INTEGER NOT NULL,
                settings_json TEXT NOT NULL,
                summary_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'draft',
                row_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="Doris CSV Cleaner", version="0.1.0", lifespan=lifespan)

allowed_origins = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

frontend_origin = os.environ.get("FRONTEND_ORIGIN")

if frontend_origin:
    allowed_origins.append(frontend_origin.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

class SettingsInput(BaseModel):
    trim_whitespace: bool = True
    case_mode: Literal["none", "lower", "upper"] = "none"
    case_columns: list[str] = Field(default_factory=list)
    dedupe: bool = False
    dedupe_mode: Literal["row", "columns"] = "row"
    dedupe_columns: list[str] = Field(default_factory=list)


def get_job_or_404(job_id: str) -> dict:
    with connect_db() as connection:
        row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return dict(row)


def unique_headers(values: list[str]) -> list[str]:
    output: list[str] = []
    used: set[str] = set()
    for index, value in enumerate(values, start=1):
        base = value.strip() or f"Column {index}"
        candidate = base
        suffix = 2
        while candidate in used:
            candidate = f"{base} ({suffix})"
            suffix += 1
        used.add(candidate)
        output.append(candidate)
    return output


def parse_csv(path: Path, delimiter_key: str, has_header: bool) -> tuple[list[str], list[list[str]]]:
    delimiter = DELIMITERS.get(delimiter_key)
    if delimiter is None:
        raise ValueError("Choose comma, tab, or semicolon as the delimiter.")

    try:
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            reader = csv.reader(source, delimiter=delimiter, strict=True)
            first = next(reader, None)
            if first is None or not first:
                raise ValueError("The CSV is empty.")
            if has_header:
                headers = unique_headers(first)
                raw_rows = reader
            else:
                headers = [f"Column {index}" for index in range(1, len(first) + 1)]
                raw_rows = iter([first, *reader])

            rows: list[list[str]] = []
            for line_number, row in enumerate(raw_rows, start=2 if has_header else 1):
                if not row:
                    row = [""] * len(headers)
                if len(row) != len(headers):
                    raise ValueError(
                        f"Row {line_number} has {len(row)} fields; expected {len(headers)}."
                    )
                rows.append(row)
    except UnicodeDecodeError as error:
        raise ValueError("This file is not valid UTF-8 CSV.") from error
    except csv.Error as error:
        raise ValueError(f"The CSV structure is malformed: {error}") from error

    return headers, rows


def validate_settings(settings: dict, headers: list[str], require_ready: bool = True) -> None:
    unknown = (set(settings.get("case_columns", [])) | set(settings.get("dedupe_columns", []))) - set(headers)
    if unknown:
        raise HTTPException(status_code=422, detail="A selected column is no longer available.")
    if require_ready and settings.get("case_mode") != "none" and not settings.get("case_columns"):
        raise HTTPException(status_code=422, detail="Choose at least one column for case normalization.")
    if require_ready and settings.get("dedupe") and settings.get("dedupe_mode") == "columns" and not settings.get("dedupe_columns"):
        raise HTTPException(status_code=422, detail="Choose at least one key column for deduplication.")


def transform_rows(rows: list[list[str]], headers: list[str], settings: dict) -> list[list[str]]:
    case_positions = {headers.index(name) for name in settings.get("case_columns", []) if name in headers}
    transformed: list[list[str]] = []
    for source_row in rows:
        row = [value.strip() for value in source_row] if settings.get("trim_whitespace") else list(source_row)
        if settings.get("case_mode") in {"lower", "upper"}:
            method = str(settings["case_mode"])
            for index in case_positions:
                row[index] = getattr(row[index], method)()
        transformed.append(row)
    return transformed


def analyze_rows(headers: list[str], source_rows: list[list[str]], settings: dict) -> dict:
    transformed = transform_rows(source_rows, headers, settings)
    blank_by_column = {
        header: sum(1 for row in source_rows if not row[index].strip())
        for index, header in enumerate(headers)
    }
    rows_with_blanks = sum(1 for row in source_rows if any(not value.strip() for value in row))

    if settings.get("dedupe_mode") == "columns" and settings.get("dedupe_columns"):
        key_positions = [headers.index(name) for name in settings["dedupe_columns"]]
    else:
        key_positions = list(range(len(headers)))

    first_seen: set[tuple[str, ...]] = set()
    duplicate_indexes: set[int] = set()
    for index, row in enumerate(transformed):
        key = tuple(row[position] for position in key_positions)
        if key in first_seen:
            duplicate_indexes.add(index)
        else:
            first_seen.add(key)

    return {
        "transformed_rows": transformed,
        "blank_by_column": blank_by_column,
        "blank_cells": sum(blank_by_column.values()),
        "rows_with_blanks": rows_with_blanks,
        "duplicate_indexes": duplicate_indexes,
        "duplicates_found": len(duplicate_indexes),
    }


def preview_rows(headers: list[str], source_rows: list[list[str]], settings: dict) -> list[dict]:
    analysis = analyze_rows(headers, source_rows, settings)
    duplicate_indexes = analysis["duplicate_indexes"]
    output = []
    for index, row in enumerate(source_rows[:PREVIEW_LIMIT]):
        output.append(
            {
                "number": index + 1,
                "values": row,
                "blank_columns": [headers[i] for i, value in enumerate(row) if not value.strip()],
                "duplicate": index in duplicate_indexes,
            }
        )
    return output


def public_job(job: dict, require_ready: bool = True) -> dict:
    settings = json.loads(job["settings_json"])
    summary = json.loads(job["summary_json"] or "{}")
    try:
        headers, rows = parse_csv(Path(job["source_path"]), job["delimiter"], bool(job["has_header"]))
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=500, detail=f"Saved source file could not be read: {error}") from error

    validate_settings(settings, headers, require_ready=require_ready)
    analysis = analyze_rows(headers, rows, settings)
    result_preview = []
    if job["status"] == "completed" and job["output_path"] and Path(job["output_path"]).is_file():
        try:
            _, output_rows = parse_csv(Path(job["output_path"]), job["delimiter"], bool(job["has_header"]))
            result_preview = [
                {"number": index + 1, "values": row}
                for index, row in enumerate(output_rows[:PREVIEW_LIMIT])
            ]
        except (OSError, ValueError):
            result_preview = []

    return {
        "id": job["id"],
        "name": job["name"],
        "filename": job["original_filename"],
        "file_size": job["file_size"],
        "delimiter": job["delimiter"],
        "has_header": bool(job["has_header"]),
        "status": job["status"],
        "row_count": len(rows),
        "headers": headers,
        "preview": preview_rows(headers, rows, settings),
        "output_preview": result_preview,
        "settings": settings,
        "summary": summary,
        "quality": {
            "blank_cells": analysis["blank_cells"],
            "rows_with_blanks": analysis["rows_with_blanks"],
            "duplicates_found": analysis["duplicates_found"],
            "blank_by_column": analysis["blank_by_column"],
        },
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "Doris CSV Cleaner"}


@app.get("/api/jobs")
def list_jobs() -> list[dict]:
    with connect_db() as connection:
        rows = connection.execute("SELECT * FROM jobs ORDER BY updated_at DESC").fetchall()
    jobs = []
    for row in rows:
        job = dict(row)
        summary = json.loads(job["summary_json"] or "{}")
        jobs.append(
            {
                "id": job["id"],
                "name": job["name"],
                "filename": job["original_filename"],
                "status": job["status"],
                "row_count": job["row_count"],
                "issue_count": summary.get("blank_cells", 0) + summary.get("duplicates_found", 0),
                "created_at": job["created_at"],
                "updated_at": job["updated_at"],
            }
        )
    return jobs


@app.post("/api/jobs")
async def create_job(
    file: UploadFile = File(...),
    delimiter: str = Form("comma"),
    has_header: bool = Form(True),
) -> dict:
    if Path(file.filename or "").suffix.lower() != ".csv":
        raise HTTPException(status_code=400, detail="Choose a .csv file.")
    if delimiter not in DELIMITERS:
        raise HTTPException(status_code=422, detail="Choose comma, tab, or semicolon as the delimiter.")

    job_id = uuid.uuid4().hex[:12]
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    source_path = job_dir / "source.csv"
    size = 0
    try:
        with source_path.open("wb") as destination:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="This file is larger than the 10 MB limit.")
                destination.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="The CSV file is empty.")
        headers, rows = parse_csv(source_path, delimiter, has_header)
    except ValueError as error:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except OSError as error:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="The upload could not be saved locally.") from error
    finally:
        await file.close()

    filename = Path(file.filename or "dataset.csv").name
    settings = dict(DEFAULT_SETTINGS)
    analysis = analyze_rows(headers, rows, settings)
    summary = {
        "rows_input": len(rows),
        "rows_output": len(rows),
        "rows_removed": 0,
        "blank_cells": analysis["blank_cells"],
        "rows_with_blanks": analysis["rows_with_blanks"],
        "duplicates_found": analysis["duplicates_found"],
        "duplicates_removed": 0,
        "blank_by_column": analysis["blank_by_column"],
    }
    timestamp = now_iso()
    with connect_db() as connection:
        connection.execute(
            """
            INSERT INTO jobs (
                id, name, source_path, original_filename, file_size, delimiter,
                has_header, settings_json, summary_json, status, row_count,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
            """,
            (
                job_id,
                Path(filename).stem or "Untitled dataset",
                str(source_path),
                filename,
                size,
                delimiter,
                int(has_header),
                json.dumps(settings),
                json.dumps(summary),
                len(rows),
                timestamp,
                timestamp,
            ),
        )
    return public_job(get_job_or_404(job_id))


@app.get("/api/jobs/{job_id}")
def read_job(job_id: str) -> dict:
    return public_job(get_job_or_404(job_id))


@app.post("/api/jobs/{job_id}/inspect")
def inspect_job(job_id: str, payload: SettingsInput) -> dict:
    job = get_job_or_404(job_id)
    headers, _ = parse_csv(Path(job["source_path"]), job["delimiter"], bool(job["has_header"]))
    settings = payload.model_dump()
    validate_settings(settings, headers, require_ready=False)
    preview_job = dict(job)
    preview_job["settings_json"] = json.dumps(settings)
    return public_job(preview_job, require_ready=False)


@app.put("/api/jobs/{job_id}/settings")
def save_settings(job_id: str, payload: SettingsInput) -> dict:
    job = get_job_or_404(job_id)
    headers, rows = parse_csv(Path(job["source_path"]), job["delimiter"], bool(job["has_header"]))
    settings = payload.model_dump()
    validate_settings(settings, headers)
    analysis = analyze_rows(headers, rows, settings)
    summary = {
        "rows_input": len(rows),
        "rows_output": len(rows),
        "rows_removed": 0,
        "blank_cells": analysis["blank_cells"],
        "rows_with_blanks": analysis["rows_with_blanks"],
        "duplicates_found": analysis["duplicates_found"],
        "duplicates_removed": 0,
        "blank_by_column": analysis["blank_by_column"],
    }
    timestamp = now_iso()
    with connect_db() as connection:
        connection.execute(
            """
            UPDATE jobs SET settings_json = ?, summary_json = ?, status = 'draft',
                output_path = NULL, report_path = NULL, updated_at = ? WHERE id = ?
            """,
            (json.dumps(settings), json.dumps(summary), timestamp, job_id),
        )
    for key in ("output_path", "report_path"):
        if job.get(key):
            Path(job[key]).unlink(missing_ok=True)
    return public_job(get_job_or_404(job_id))


@app.post("/api/jobs/{job_id}/run")
def run_job(job_id: str) -> dict:
    job = get_job_or_404(job_id)
    source_path = Path(job["source_path"])
    try:
        headers, rows = parse_csv(source_path, job["delimiter"], bool(job["has_header"]))
    except (OSError, ValueError) as error:
        raise HTTPException(status_code=400, detail=f"Saved CSV could not be processed: {error}") from error

    settings = json.loads(job["settings_json"])
    validate_settings(settings, headers)
    analysis = analyze_rows(headers, rows, settings)
    duplicate_indexes = analysis["duplicate_indexes"]
    if settings["dedupe"]:
        output_rows = [row for index, row in enumerate(analysis["transformed_rows"]) if index not in duplicate_indexes]
    else:
        output_rows = analysis["transformed_rows"]

    job_dir = Path(job["source_path"]).parent
    output_path = job_dir / "cleaned.csv"
    report_path = job_dir / "quality-report.csv"
    temp_output = job_dir / "cleaned.tmp"
    temp_report = job_dir / "report.tmp"
    try:
        with temp_output.open("w", encoding="utf-8", newline="") as destination:
            writer = csv.writer(destination)
            if bool(job["has_header"]):
                writer.writerow(headers)
            writer.writerows(output_rows)

        rows_removed = len(rows) - len(output_rows)
        summary = {
            "rows_input": len(rows),
            "rows_output": len(output_rows),
            "rows_removed": rows_removed,
            "blank_cells": analysis["blank_cells"],
            "rows_with_blanks": analysis["rows_with_blanks"],
            "duplicates_found": analysis["duplicates_found"],
            "duplicates_removed": rows_removed,
            "blank_by_column": analysis["blank_by_column"],
        }
        with temp_report.open("w", encoding="utf-8", newline="") as destination:
            writer = csv.writer(destination)
            writer.writerow(["metric", "count", "details"])
            writer.writerow(["input rows", summary["rows_input"], "Rows imported from the source CSV"])
            writer.writerow(["output rows", summary["rows_output"], "Rows in the cleaned CSV"])
            writer.writerow(["rows removed", summary["rows_removed"], "Removed by the optional deduplication rule"])
            writer.writerow(["rows with blank values", summary["rows_with_blanks"], "Rows containing one or more empty or whitespace-only cells"])
            writer.writerow(["blank cells", summary["blank_cells"], "Empty or whitespace-only cells in the source"])
            writer.writerow(["duplicate rows", summary["duplicates_found"], "Rows matching the selected duplicate key after transformations"])
            writer.writerow(["duplicates removed", summary["duplicates_removed"], "Later matching rows excluded from the cleaned CSV"])
            for column, count in summary["blank_by_column"].items():
                writer.writerow(["blank cells by column", count, column])

        os.replace(temp_output, output_path)
        os.replace(temp_report, report_path)
    except OSError as error:
        temp_output.unlink(missing_ok=True)
        temp_report.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="The output files could not be written.") from error

    timestamp = now_iso()
    with connect_db() as connection:
        connection.execute(
            """
            UPDATE jobs SET output_path = ?, report_path = ?, summary_json = ?, status = 'completed',
                row_count = ?, updated_at = ? WHERE id = ?
            """,
            (str(output_path), str(report_path), json.dumps(summary), len(output_rows), timestamp, job_id),
        )
    return public_job(get_job_or_404(job_id))


@app.get("/api/jobs/{job_id}/download/{kind}")
def download_job_file(job_id: str, kind: Literal["cleaned", "report"]) -> FileResponse:
    job = get_job_or_404(job_id)
    path_value = job["output_path"] if kind == "cleaned" else job["report_path"]
    if not path_value or not Path(path_value).is_file():
        raise HTTPException(status_code=409, detail="Run this cleaning job before downloading its outputs.")
    filename = "cleaned.csv" if kind == "cleaned" else "quality-report.csv"
    return FileResponse(path_value, media_type="text/csv", filename=filename)


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: str) -> None:
    job = get_job_or_404(job_id)
    with connect_db() as connection:
        connection.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
    shutil.rmtree(Path(job["source_path"]).parent, ignore_errors=True)
