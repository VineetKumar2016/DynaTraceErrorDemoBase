const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// Dashboard
export const getDashboard = () => req('/dashboard/');

// Errors
export const getErrors = (params = {}) => {
  const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  return req(`/errors/?${q}`);
};
export const getError = (id) => req(`/errors/${id}`);
export const getErrorStats = () => req('/errors/stats/summary');
export const deleteError = (id) => req(`/errors/${id}`, { method: 'DELETE' });

// Fixes
export const getFixes = (params = {}) => {
  const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  return req(`/fixes/?${q}`);
};
export const getFix = (id) => req(`/fixes/${id}`);
export const getFixByError = (errorId) => req(`/fixes/by-error/${errorId}`);
export const generateFix = (data) =>
  req("/fixes/generate", { method: "POST", body: JSON.stringify(data) });

// PRs
export const getPRs = () => req('/prs/');

// Scans
export const getScans = () => req('/scans/');
export const triggerScan = () => req('/scans/trigger', { method: 'POST' });
export const triggerScanSync = () => req('/scans/trigger-sync', { method: 'POST' });

// Analysis
export const approveFix = (data) => req('/analysis/approve', { method: 'POST', body: JSON.stringify(data) });
export const rejectFix = (fixId) => req('/analysis/reject', { method: 'POST', body: JSON.stringify({ fix_id: fixId }) });

// Settings
export const getSettings = () => req('/settings/');
export const saveGitHub = (data) => req('/settings/github', { method: 'POST', body: JSON.stringify(data) });
export const saveDynatrace = (data) => req('/settings/dynatrace', { method: 'POST', body: JSON.stringify(data) });
export const saveJira = (data) => req('/settings/jira', { method: 'POST', body: JSON.stringify(data) });
export const saveAI = (data) => req('/settings/ai', { method: 'POST', body: JSON.stringify(data) });
export const savePipeline = (data) => req('/settings/pipeline', { method: 'POST', body: JSON.stringify(data) });
export const testGitHub = (data = {}) => req('/settings/test/github', { method: 'POST', body: JSON.stringify(data) });
export const testDynatrace = (data = {}) => req('/settings/test/dynatrace', { method: 'POST', body: JSON.stringify(data) });
export const generateDynatraceToken = (data) =>
  req("/settings/dynatrace/generate-token", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const testJira = (data = {}) => req('/settings/test/jira', { method: 'POST', body: JSON.stringify(data) });
export const getGitHubRepos = () => req('/settings/github/repos');
export const updateRepoEnabled = (data) => req('/settings/github', { method: 'POST', body: JSON.stringify(data) });

// Dynatrace ingest
export const fetchFromDynatrace = (params = {}) => {
  const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  return req(`/ingest/from-dynatrace${q.toString() ? '?' + q : ''}`);
};
export const getIngestStatus = () => req('/ingest/status');

// Upload errors file
export async function uploadErrorsFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/errors/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// Health
export const getHealth = () => req('/health');

// SSE streaming analysis
export function streamAnalysis(errorId, onEvent) {
  const es = new EventSource(`${BASE}/analysis/analyze`, { withCredentials: false });
  // EventSource doesn't support POST, so we use fetch with ReadableStream
  es.close();

  const ctrl = new AbortController();
  fetch(`${BASE}/analysis/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error_id: errorId }),
    signal: ctrl.signal,
  }).then(async (res) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) { onEvent({ type: 'done' }); break; }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { onEvent(JSON.parse(line.slice(6))); } catch {}
        }
      }
    }
  }).catch((e) => {
    if (e.name !== 'AbortError') onEvent({ type: 'error', message: e.message });
  });

  return () => ctrl.abort();
}
