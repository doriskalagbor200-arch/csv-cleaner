import { useEffect, useMemo, useState } from 'react';
import FlowCanvas from './FlowCanvas.jsx';
import { api, explainError } from './api.js';

const EMPTY_SETTINGS = {
  trim_whitespace: true,
  case_mode: 'none',
  case_columns: [],
  dedupe: false,
  dedupe_mode: 'row',
  dedupe_columns: [],
};

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function Status({ status }) {
  const label = status === 'completed' ? 'Complete' : status === 'running' ? 'Processing' : 'Draft';
  return <span className={`status status-${status}`}>{label}</span>;
}

function StepLine({ step }) {
  const labels = ['Import', 'Review', 'Results'];
  return (
    <div className="step-line" aria-label={`Step ${step} of 3: ${labels[step - 1]}`}>
      <div className="step-progress"><span style={{ width: `${(step / 3) * 100}%` }} /></div>
      <div className="step-labels">
        {labels.map((label, index) => (
          <span key={label} className={index + 1 === step ? 'is-current' : index + 1 < step ? 'is-done' : ''}>
            <b>{String(index + 1).padStart(2, '0')}</b>{label}
          </span>
        ))}
      </div>
    </div>
  );
}

function WorkspaceShell({ children, screen, onNavigate, motionPaused, systemReduced, setMotionPaused, title }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => onNavigate('jobs')} aria-label="Doris Data home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><strong>Doris</strong><small>DATA WORKSPACE</small></span>
        </button>
        <div className="workspace-name"><span className="eyebrow">LOCAL WORKSPACE</span><span>My datasets <span className="chevron">⌄</span></span></div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={screen === 'jobs' ? 'active' : ''} onClick={() => onNavigate('jobs')}>
            <span className="nav-glyph" aria-hidden="true">▤</span>Cleaning jobs
          </button>
          <button className={screen === 'new' ? 'active' : ''} onClick={() => onNavigate('new')}>
            <span className="nav-glyph copper" aria-hidden="true">✳</span>New import
          </button>
        </nav>
        <div className="sidebar-foot">
          <span className="local-indicator"><i />Stored on this device</span>
          <span className="side-version">DORIS / 01</span>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="crumb"><span>Workspace</span><span className="crumb-sep">/</span><strong>{title}</strong></div>
          <div className="topbar-actions">
            <span className="local-badge"><i />Local only</span>
            <button className="avatar" aria-label="Local workspace">D</button>
          </div>
        </header>
        <div className="content-wrap">{children}</div>
      </main>

      <button
        className={`motion-toggle ${motionPaused ? 'is-paused' : ''}`}
        onClick={() => setMotionPaused((value) => !value)}
        aria-pressed={motionPaused || systemReduced}
        aria-label={systemReduced ? 'Motion is reduced by your system settings' : motionPaused ? 'Resume interface motion' : 'Pause interface motion'}
        title={systemReduced ? 'Motion is reduced by your system settings' : motionPaused ? 'Resume interface motion' : 'Pause interface motion'}
        disabled={systemReduced}
      >
        <span className="motion-glyph" aria-hidden="true">{motionPaused || systemReduced ? 'Ⅱ' : '✳'}</span>
        <span>Motion {systemReduced ? 'reduced' : motionPaused ? 'off' : 'on'}</span>
      </button>
    </div>
  );
}

function EmptyJobs({ onNew }) {
  return (
    <section className="empty-jobs">
      <div className="empty-copy">
        <span className="eyebrow copper-text">A cleaner start</span>
        <h2>Your next dataset<br /><em>starts here.</em></h2>
        <p>Bring in a CSV, see what needs attention, and make a clean copy you can trust.</p>
        <button className="button-primary" onClick={onNew}><span>✳</span> Import a CSV <span className="button-arrow">↗</span></button>
        <span className="supporting-note">CSV · UTF-8 · Up to 10 MB</span>
      </div>
      <div className="empty-visual" aria-hidden="true">
        <div className="flow-label"><span>RAW ROWS</span><span>STRUCTURED</span></div>
        <div className="flow-grid">
          {Array.from({ length: 36 }, (_, index) => <i key={index} className={index % 7 === 0 ? 'accent-dot' : ''} />)}
        </div>
        <div className="flow-foot"><span>records align</span><span>✳</span></div>
      </div>
    </section>
  );
}

function JobsScreen({ jobs, loading, onOpen, onNew, error }) {
  const completed = jobs.filter((job) => job.status === 'completed').length;
  const drafts = jobs.filter((job) => job.status !== 'completed').length;
  return (
    <>
      <div className="page-heading">
        <div><span className="eyebrow">YOUR DATA, IN ORDER</span><h1>Cleaning jobs</h1><p>Import, inspect, and transform local CSV files.</p></div>
        {jobs.length > 0 && <button className="button-primary" onClick={onNew}><span>✳</span> New cleaning job <span className="button-arrow">↗</span></button>}
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {jobs.length > 0 && (
        <div className="overview-strip" aria-label="Job totals">
          <div><span>Saved jobs</span><strong>{jobs.length}</strong></div>
          <div><span>Completed</span><strong>{completed}</strong></div>
          <div><span>Needs a run</span><strong>{drafts}</strong></div>
        </div>
      )}
      {loading ? <div className="loading-state"><span className="loading-mark">✳</span>Loading your local jobs…</div> : jobs.length === 0 ? <EmptyJobs onNew={onNew} /> : (
        <section className="jobs-section">
          <div className="section-heading"><div><h2>Recent work</h2><p>Your source files and results stay on this device.</p></div><span className="count-label">{jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}</span></div>
          <div className="table-frame">
            <table className="jobs-table">
              <thead><tr><th>Dataset</th><th>Rows</th><th>Quality flags</th><th>Updated</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} onClick={() => onOpen(job.id)} tabIndex="0" onKeyDown={(event) => event.key === 'Enter' && onOpen(job.id)}>
                    <td><span className="file-mark">CSV</span><span className="dataset-cell"><strong>{job.name}</strong><small>{job.filename}</small></span></td>
                    <td className="numeric">{job.row_count.toLocaleString()}</td>
                    <td className="numeric">{job.issue_count ? <span className="flag-count">{job.issue_count}</span> : <span className="quiet-zero">0</span>}</td>
                    <td className="date-cell">{formatDate(job.updated_at)}</td>
                    <td><Status status={job.status} /></td>
                    <td className="row-arrow">↗</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function ImportScreen({ onCreate, busy, error, onBack }) {
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [delimiter, setDelimiter] = useState('comma');
  const [hasHeader, setHasHeader] = useState(true);
  const [dragging, setDragging] = useState(false);

  const acceptFile = (candidate) => {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith('.csv')) {
      setFileError('Choose a file with the .csv extension.');
      return;
    }
    setFileError('');
    setFile(candidate);
  };

  const submit = (event) => {
    event.preventDefault();
    if (file) onCreate({ file, delimiter, hasHeader });
  };

  return (
    <>
      <StepLine step={1} />
      <div className="page-heading compact-heading">
        <div><span className="eyebrow copper-text">01 / Import</span><h1>Bring in a dataset</h1><p>Start with a CSV. Your file stays in your local workspace.</p></div>
        <button className="button-quiet" onClick={onBack}>← Back to jobs</button>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <form className="import-layout" onSubmit={submit}>
        <section className="panel import-panel">
          <div className="panel-heading"><div><h2>Source file</h2><p>CSV files up to 10 MB</p></div><span className="file-spec">UTF-8</span></div>
          <label
            className={`drop-zone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]); }}
          >
            <input type="file" accept=".csv,text/csv" onChange={(event) => acceptFile(event.target.files?.[0])} />
            {file ? <><span className="drop-icon checked">✓</span><strong>{file.name}</strong><small>{formatBytes(file.size)} · Ready to inspect</small><span className="change-file">Choose a different file</span></> : <><span className="drop-icon">↥</span><strong>Drop a CSV here</strong><small>or <span>browse files</span> from your device</small><span className="drop-limit">Maximum file size: 10 MB</span></>}
          </label>
          {fileError && <p className="field-error" role="alert">{fileError}</p>}
          <div className="import-options">
            <label className="field-label" htmlFor="delimiter">Delimiter
              <select id="delimiter" value={delimiter} onChange={(event) => setDelimiter(event.target.value)}>
                <option value="comma">Comma ,</option><option value="tab">Tab</option><option value="semicolon">Semicolon ;</option>
              </select>
            </label>
            <label className="switch-row header-switch"><span><strong>First row contains headers</strong><small>Use the first row as column names</small></span><input type="checkbox" checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} /></label>
          </div>
          <div className="panel-footer import-footer"><span className="privacy-note"><i />Stored on this device</span><button className="button-primary" type="submit" disabled={!file || busy}>{busy ? 'Inspecting…' : <>Continue to review <span className="button-arrow">→</span></>}</button></div>
        </section>
        <aside className="import-aside">
          <span className="eyebrow">WHAT HAPPENS NEXT</span>
          <h2>From raw file<br /><em>to clear picture.</em></h2>
          <ol className="import-steps"><li><b>01</b><span><strong>Inspect</strong><small>See blanks and repeated rows before changing anything.</small></span></li><li><b>02</b><span><strong>Choose rules</strong><small>Trim, normalize, or deduplicate with control.</small></span></li><li><b>03</b><span><strong>Take the result</strong><small>Download a cleaned CSV and quality report.</small></span></li></ol>
        </aside>
      </form>
    </>
  );
}

function ColumnPicker({ headers, selected, onChange, label }) {
  const toggle = (header) => onChange(selected.includes(header) ? selected.filter((item) => item !== header) : [...selected, header]);
  return (
    <fieldset className="column-picker">
      <legend>{label}</legend>
      <div className="column-options">
        {headers.map((header) => <label key={header}><input type="checkbox" checked={selected.includes(header)} onChange={() => toggle(header)} /><span>{header}</span></label>)}
      </div>
    </fieldset>
  );
}

function PreviewTable({ headers, rows, showFlags = false }) {
  if (!headers?.length) return null;
  return (
    <div className="preview-frame">
      <table className="preview-table">
        <thead><tr><th className="row-number">#</th>{headers.map((header) => <th key={header}>{header}</th>)}{showFlags && <th>Quality</th>}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.number}>
              <td className="row-number">{row.number}</td>
              {headers.map((header, index) => {
                const blank = showFlags && row.blank_columns?.includes(header);
                return <td key={header} className={blank ? 'cell-blank' : ''}>{row.values[index] || (blank ? <span className="blank-marker">Blank</span> : <span className="empty-cell">—</span>)}</td>;
              })}
              {showFlags && <td>{row.duplicate ? <span className="row-flag">Duplicate</span> : row.blank_columns?.length ? <span className="row-flag muted-flag">Blank value</span> : <span className="clean-mark">—</span>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RulesPanel({ settings, setSettings, headers }) {
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  return (
    <section className="panel rules-panel">
      <div className="panel-heading"><div><h2>Cleaning rules</h2><p>Nothing changes until you run the job.</p></div><span className="rules-spark">✳</span></div>
      <label className="switch-row"><span><strong>Trim whitespace</strong><small>Remove spaces at the beginning and end of text cells.</small></span><input type="checkbox" checked={settings.trim_whitespace} onChange={(event) => update('trim_whitespace', event.target.checked)} /></label>
      <div className="rule-block">
        <label className="field-label" htmlFor="case-mode">Normalize case</label>
        <select id="case-mode" value={settings.case_mode} onChange={(event) => update('case_mode', event.target.value)}><option value="none">Leave as is</option><option value="lower">lowercase</option><option value="upper">UPPERCASE</option></select>
        {settings.case_mode !== 'none' && <ColumnPicker headers={headers} selected={settings.case_columns} onChange={(value) => update('case_columns', value)} label="Apply to columns" />}
      </div>
      <div className="switch-row dedupe-row"><span><strong>Remove duplicate records</strong><small>Keep the first match and include the count in the report.</small></span><input type="checkbox" checked={settings.dedupe} onChange={(event) => update('dedupe', event.target.checked)} /></div>
      {settings.dedupe && (
        <div className="rule-block dedupe-options">
          <div className="radio-row"><label><input type="radio" name="dedupe-mode" checked={settings.dedupe_mode === 'row'} onChange={() => update('dedupe_mode', 'row')} /><span>Entire row</span></label><label><input type="radio" name="dedupe-mode" checked={settings.dedupe_mode === 'columns'} onChange={() => update('dedupe_mode', 'columns')} /><span>Selected key columns</span></label></div>
          {settings.dedupe_mode === 'columns' && <ColumnPicker headers={headers} selected={settings.dedupe_columns} onChange={(value) => update('dedupe_columns', value)} label="Match records by" />}
        </div>
      )}
      <div className="rule-note"><span aria-hidden="true">i</span><p>Blank values stay in the output and are counted in the quality report.</p></div>
    </section>
  );
}

function QualitySummary({ quality }) {
  const columns = Object.entries(quality?.blank_by_column || {}).filter(([, count]) => count > 0);
  return (
    <section className="quality-block">
      <div className="section-heading"><div><h2>Quality findings</h2><p>Based on the source file and selected matching rule.</p></div><span className="finding-total">{(quality?.blank_cells || 0) + (quality?.duplicates_found || 0)} <small>findings</small></span></div>
      <div className="quality-summary">
        <div><span>Blank cells</span><strong>{quality?.blank_cells || 0}</strong><small>{quality?.rows_with_blanks || 0} rows affected</small></div>
        <div><span>Duplicate records</span><strong>{quality?.duplicates_found || 0}</strong><small>Later matching rows</small></div>
        <div><span>Columns with blanks</span><strong>{columns.length}</strong><small>{columns.length ? columns.map(([name]) => name).join(', ') : 'No blank values found'}</small></div>
      </div>
    </section>
  );
}

function ReviewScreen({ job, settings, setSettings, onSaveRun, onDelete, onBack, busy, error }) {
  return (
    <>
      <StepLine step={2} />
      <div className="page-heading compact-heading">
        <div><span className="eyebrow copper-text">02 / Review</span><h1>Inspect your data</h1><p>{job.filename} <span className="subtle-separator">·</span> {job.row_count.toLocaleString()} records <span className="subtle-separator">·</span> {formatBytes(job.file_size)}</p></div>
        <div className="heading-buttons"><button className="button-quiet" onClick={onBack}>← Jobs</button><button className="button-danger-quiet" onClick={onDelete}>Delete job</button></div>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <QualitySummary quality={job.quality} />
      <div className="review-layout">
        <section className="panel preview-panel">
          <div className="panel-heading"><div><h2>Source preview</h2><p>First {job.preview.length} of {job.row_count.toLocaleString()} records</p></div><span className="preview-legend"><i />Blank value <i className="legend-duplicate" />Duplicate</span></div>
          <PreviewTable headers={job.headers} rows={job.preview} showFlags />
        </section>
        <RulesPanel settings={settings} setSettings={setSettings} headers={job.headers} />
      </div>
      <div className="run-bar"><span><i />Your source file remains unchanged.</span><button className="button-primary" onClick={onSaveRun} disabled={busy}>{busy ? <><span className="button-spinner" /> Cleaning records…</> : <>Run cleaning <span className="button-arrow">→</span></>}</button></div>
    </>
  );
}

function ProcessingScreen({ job, motionPaused }) {
  return (
    <section className="processing-screen">
      <div className="processing-card">
        <div className="processing-copy"><span className="eyebrow copper-text">RUN IN PROGRESS</span><h1>Bringing rows<br /><em>into alignment.</em></h1><p>Applying your rules to {job.row_count.toLocaleString()} records. This usually takes a moment.</p><span className="processing-status"><i />Cleaning locally in this browser session</span></div>
        <div className="processing-visual"><FlowCanvas paused={motionPaused} /><span className="canvas-caption">RAW → CLEAN</span></div>
      </div>
    </section>
  );
}

function ResultsScreen({ job, onBack, onDelete, error }) {
  const summary = job.summary || {};
  const saved = summary.rows_removed || 0;
  return (
    <>
      <StepLine step={3} />
      <div className="page-heading compact-heading">
        <div><span className="eyebrow copper-text">03 / Results</span><h1>Cleaning complete</h1><p>{job.filename} <span className="subtle-separator">·</span> Completed {formatDate(job.updated_at)}</p></div>
        <div className="heading-buttons"><button className="button-quiet" onClick={onBack}>← All jobs</button><button className="button-danger-quiet" onClick={onDelete}>Delete job</button></div>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <section className="result-banner">
        <div className="result-icon">✓</div>
        <div><strong>Your cleaned file is ready.</strong><p>{summary.rows_output?.toLocaleString() ?? 0} records in the output{saved ? ` · ${saved} duplicate ${saved === 1 ? 'row' : 'rows'} removed` : ' · No rows removed'}.</p></div>
        <a className="button-primary download-main" href={api.downloadUrl(job.id, 'cleaned')} download><span>↓</span> Download cleaned CSV</a>
      </section>
      <section className="results-grid">
        <div className="panel result-table-panel">
          <div className="panel-heading"><div><h2>Cleaned preview</h2><p>First {job.output_preview?.length || 0} rows of {summary.rows_output?.toLocaleString() || 0}</p></div><span className="status status-completed">Ready</span></div>
          <PreviewTable headers={job.headers} rows={job.output_preview || []} />
          {(!job.output_preview || job.output_preview.length === 0) && <p className="empty-result">The cleaning run produced no rows. Download the file to review its headers and settings.</p>}
        </div>
        <aside className="panel report-panel">
          <div className="panel-heading"><div><h2>Quality report</h2><p>A concise record of this run.</p></div><span className="report-glyph">↗</span></div>
          <dl className="report-list"><div><dt>Input records</dt><dd>{summary.rows_input?.toLocaleString() ?? 0}</dd></div><div><dt>Output records</dt><dd>{summary.rows_output?.toLocaleString() ?? 0}</dd></div><div><dt>Blank cells</dt><dd>{summary.blank_cells ?? 0}</dd></div><div><dt>Duplicate records</dt><dd>{summary.duplicates_found ?? 0}</dd></div><div><dt>Rows removed</dt><dd>{summary.rows_removed ?? 0}</dd></div></dl>
          <a className="button-secondary report-download" href={api.downloadUrl(job.id, 'report')} download>Download report CSV <span>↓</span></a>
          <p className="report-footnote">{summary.rows_removed ? 'The first record in each duplicate group was kept.' : 'All source records remain in the cleaned file.'} Blank values were preserved.</p>
        </aside>
      </section>
    </>
  );
}

function App() {
  const [screen, setScreen] = useState('jobs');
  const [jobs, setJobs] = useState([]);
  const [job, setJob] = useState(null);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [motionPaused, setMotionPaused] = useState(() => localStorage.getItem('doris-motion-paused') === 'true');
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (event) => setSystemReduced(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const paused = motionPaused || systemReduced;
    document.body.classList.toggle('motion-paused', paused);
    localStorage.setItem('doris-motion-paused', String(motionPaused));
    return () => document.body.classList.remove('motion-paused');
  }, [motionPaused, systemReduced]);

  const pageTitle = useMemo(() => ({ jobs: 'Cleaning jobs', new: 'New import', review: 'Review', processing: 'Processing', results: 'Results' })[screen], [screen]);

  const refreshJobs = async () => {
    setLoading(true);
    try {
      setJobs(await api.jobs());
      setError('');
    } catch (caught) {
      setError(explainError(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refreshJobs(); }, []);

  useEffect(() => {
    if (screen !== 'review' || !job) return undefined;
    const timeout = window.setTimeout(async () => {
      try {
        const inspected = await api.inspect(job.id, settings);
        setJob(inspected);
        setError('');
      } catch (caught) {
        setError(explainError(caught));
      }
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [screen, job?.id, settings]);

  const navigate = (next) => {
    setError('');
    setScreen(next);
    if (next === 'jobs') {
      setJob(null);
      refreshJobs();
    }
  };

  const createJob = async ({ file, delimiter, hasHeader }) => {
    if (file.size > 10 * 1024 * 1024) {
      setError('This file is larger than the 10 MB limit. Choose a smaller CSV.');
      return;
    }
    setBusy(true);
    setError('');
    const body = new FormData();
    body.append('file', file);
    body.append('delimiter', delimiter);
    body.append('has_header', String(hasHeader));
    try {
      const created = await api.create(body);
      setJob(created);
      setSettings(created.settings);
      setScreen('review');
      await refreshJobs();
    } catch (caught) {
      setError(explainError(caught));
    } finally {
      setBusy(false);
    }
  };

  const openJob = async (id) => {
    setBusy(true);
    setError('');
    try {
      const loaded = await api.job(id);
      setJob(loaded);
      setSettings(loaded.settings);
      setScreen(loaded.status === 'completed' ? 'results' : 'review');
    } catch (caught) {
      setError(explainError(caught));
    } finally {
      setBusy(false);
    }
  };

  const saveAndRun = async () => {
    if (!job) return;
    setBusy(true);
    setError('');
    setScreen('processing');
    try {
      await api.saveSettings(job.id, settings);
      const result = await api.run(job.id);
      setJob(result);
      setSettings(result.settings);
      setScreen('results');
      await refreshJobs();
    } catch (caught) {
      setError(explainError(caught));
      setScreen('review');
    } finally {
      setBusy(false);
    }
  };

  const deleteJob = async () => {
    if (!job || !window.confirm(`Delete “${job.name}” and its saved files?`)) return;
    setBusy(true);
    try {
      await api.remove(job.id);
      setJob(null);
      setScreen('jobs');
      await refreshJobs();
    } catch (caught) {
      setError(explainError(caught));
    } finally {
      setBusy(false);
    }
  };

  let content;
  if (screen === 'new') content = <ImportScreen onCreate={createJob} busy={busy} error={error} onBack={() => navigate('jobs')} />;
  else if (screen === 'review' && job) content = <ReviewScreen job={job} settings={settings} setSettings={setSettings} onSaveRun={saveAndRun} onDelete={deleteJob} onBack={() => navigate('jobs')} busy={busy} error={error} />;
  else if (screen === 'processing' && job) content = <ProcessingScreen job={job} motionPaused={motionPaused || systemReduced} />;
  else if (screen === 'results' && job) content = <ResultsScreen job={job} onBack={() => navigate('jobs')} onDelete={deleteJob} error={error} />;
  else content = <JobsScreen jobs={jobs} loading={loading} onOpen={openJob} onNew={() => navigate('new')} error={error} />;

  return <WorkspaceShell screen={screen} onNavigate={navigate} motionPaused={motionPaused} systemReduced={systemReduced} setMotionPaused={setMotionPaused} title={pageTitle}>{content}</WorkspaceShell>;
}

export default App;
