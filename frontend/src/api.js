async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const payload = await response.json();
      if (payload.detail) message = payload.detail;
    } catch {
      // Keep the HTTP status message when an error response is not JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  jobs: () => request('/api/jobs'),
  job: (id) => request(`/api/jobs/${encodeURIComponent(id)}`),
  create: (formData) => request('/api/jobs', { method: 'POST', body: formData }),
  inspect: (id, settings) => request(`/api/jobs/${encodeURIComponent(id)}/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }),
  saveSettings: (id, settings) => request(`/api/jobs/${encodeURIComponent(id)}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  }),
  run: (id) => request(`/api/jobs/${encodeURIComponent(id)}/run`, { method: 'POST' }),
  remove: (id) => request(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  downloadUrl: (id, kind) => `/api/jobs/${encodeURIComponent(id)}/download/${kind}`,
};

export function explainError(error) {
  if (error instanceof TypeError) return 'The local service could not be reached. Start the FastAPI server and try again.';
  return error?.message || 'Something went wrong. Try again.';
}
