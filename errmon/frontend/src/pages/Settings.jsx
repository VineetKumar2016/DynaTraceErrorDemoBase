import { useState, useEffect } from 'react';
import {
  getSettings, saveGitHub, saveDynatrace, saveJira, saveAI, savePipeline,
  testGitHub, testDynatrace, testJira, getGitHubRepos, uploadErrorsFile
} from '../api';
import { Btn, Spinner, useToast, Toast, StatusDot } from '../ui';

function SaveRow({ onSave, onTest, saving, testing, testResult, disabled }) {
  return (
    <div className="flex ic g3 mt3">
      <Btn onClick={onSave} disabled={saving || disabled}>{saving ? <><span className="pulse">●</span> saving…</> : 'save'}</Btn>
      {onTest && <Btn variant="secondary" onClick={onTest} disabled={testing || disabled}>{testing ? <><span className="pulse">●</span> testing…</> : 'test connection'}</Btn>}
      {testResult && (
        <span style={{ fontSize: '.68rem', color: testResult.ok ? 'var(--green)' : '#f87171' }}>
          {testResult.ok ? '✓ ' : '✕ '}{testResult.msg}
        </span>
      )}
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('config');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [testing, setTesting] = useState({});
  const [testResults, setTestResults] = useState({});
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoFilter, setRepoFilter] = useState('all');
  const toast = useToast();

  // Local form state
  const [gh, setGh] = useState({ token: '', org: '', enabled_repos: [] });
  const [dt, setDt] = useState({ platform_token: '', api_token: '', environment_url: '' });
  const [jira, setJira] = useState({ email: '', token: '', base_url: '', boards: [] });
  const [ai, setAi] = useState({ provider: 'anthropic', investigation_model: 'claude-sonnet-4-6', triage_model: 'claude-sonnet-4-6', api_key: '', enable_agentic: true });
  const [pipeline, setPipeline] = useState({ enable_polling: true, pause_scanning: false, pause_fix_generation: false, poll_interval_minutes: 5, max_errors_per_scan: 20, agent_max_tool_calls: 30, agent_max_cost_usd: 15, target_environments: 'prod', environment_prefixes: 'prod-,staging-,dev-,qa-' });

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      if (s.github) {
        const { token: _masked, ...ghRest } = s.github;
        setGh({ token: '', org: '', enabled_repos: [], ...ghRest });
      }
      if (s.dynatrace) {
        const { platform_token: _pt, api_token: _at, ...dtRest } = s.dynatrace;
        setDt({ platform_token: '', api_token: '', environment_url: '', ...dtRest });
      }
      if (s.jira) {
        const { token: _jt, ...jiraRest } = s.jira;
        setJira({ email: '', token: '', base_url: '', boards: [], ...jiraRest });
      }
      if (s.ai) {
        const { api_key: _ak, ...aiRest } = s.ai;
        setAi({ provider: 'anthropic', investigation_model: 'claude-sonnet-4-6', triage_model: 'claude-sonnet-4-6', api_key: '', enable_agentic: true, ...aiRest });
      }
      if (s.pipeline) setPipeline((p) => ({ ...p, ...s.pipeline }));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async (key, fn, data) => {
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await fn(data);
      toast.success('Saved!');
      const fresh = await getSettings();
      setSettings(fresh);
    } catch (e) { toast.error(e.message); }
    setSaving((s) => ({ ...s, [key]: false }));
  };

  const test = async (key, fn) => {
    setTesting((t) => ({ ...t, [key]: true }));
    setTestResults((r) => ({ ...r, [key]: null }));
    try {
      const res = await fn();
      setTestResults((r) => ({ ...r, [key]: { ok: true, msg: res.user ? `Connected as ${res.user}` : 'Connected!' } }));
    } catch (e) {
      setTestResults((r) => ({ ...r, [key]: { ok: false, msg: e.message?.slice(0, 100) } }));
    }
    setTesting((t) => ({ ...t, [key]: false }));
  };

  const loadRepos = async () => {
    setReposLoading(true);
    try {
      const res = await getGitHubRepos();
      if (res.error) {
        toast.error(res.error);
        setRepos([]);
      } else {
        const list = res.repos || [];
        setRepos(list);
        toast.success(`Loaded ${list.length} repo${list.length !== 1 ? 's' : ''}`);
      }
    } catch (e) { toast.error(e.message); }
    setReposLoading(false);
  };

  const toggleRepo = (name, enabled) => {
    const updated = enabled
      ? [...new Set([...(gh.enabled_repos || []), name])]
      : (gh.enabled_repos || []).filter((r) => r !== name);
    setGh((g) => ({ ...g, enabled_repos: updated }));
  };

  const ghConnected   = !!settings?.github?.token;
  const dtConnected   = !!settings?.dynatrace?.platform_token;
  const jiraConnected = !!settings?.jira?.token;
  const aiConnected   = !!settings?.ai?.api_key;

  // Buttons enabled only when the user has typed a credential in the field
  const ghTokenEntered   = gh.token.trim().length > 0;
  const dtTokenEntered   = dt.platform_token.trim().length > 0;
  const jiraTokenEntered = jira.token.trim().length > 0;
  // AI: Anthropic requires API key; other providers have no key field
  const aiKeyEntered = ai.provider !== 'anthropic' || ai.api_key.trim().length > 0;
  const pipelineOk = true;

  const tabs = [
    { id: 'config', label: 'Configuration' },
    { id: 'github', label: 'GitHub & Repos', dot: ghConnected ? 'green' : 'red' },
    { id: 'dynatrace', label: 'Dynatrace', dot: dtConnected ? 'green' : 'red' },
    { id: 'ai', label: 'AI Models', dot: aiConnected ? 'green' : 'red' },
    { id: 'jira', label: 'Jira Boards', dot: jiraConnected ? 'green' : 'gray' },
    { id: 'pipeline', label: 'Pipeline', dot: 'green' },
    { id: 'upload', label: 'Upload Errors' },
  ];

  const filteredRepos = repos.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(repoSearch.toLowerCase());
    if (repoFilter === 'enabled') return matchSearch && r.enabled;
    if (repoFilter === 'disabled') return matchSearch && !r.enabled;
    return matchSearch;
  });
  const enabledCount = (gh.enabled_repos || []).length;

  const addBoard = () => setJira((j) => ({ ...j, boards: [...(j.boards || []), { key: '', name: '', is_default: false, custom_fields: [], epics: [] }] }));
  const updateBoard = (i, field, val) => setJira((j) => {
    const boards = [...j.boards];
    boards[i] = { ...boards[i], [field]: val };
    return { ...j, boards };
  });
  const removeBoard = (i) => setJira((j) => ({ ...j, boards: j.boards.filter((_, idx) => idx !== i) }));

  if (loading) return <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}><Spinner size={24} /></div>;

  return (
    <div className="page">
      <Toast toasts={toast.toasts} />
      <div className="page-title mb5">settings</div>

      {/* Tabs */}
      <div className="settings-tabs">
        {tabs.map((t) => (
          <div key={t.id} className={`stab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.dot && <span className={`dot dot-${t.dot}`} />}
            {t.label}
          </div>
        ))}
      </div>

      {/* ── CONFIG ── */}
      {tab === 'config' && (
        <div className="grid-2">
          <div className="section-card">
            <div className="section-title mb2">Configuration</div>
            {[
              { label: 'GitHub & Repos', ok: ghConnected },
              { label: 'Dynatrace', ok: dtConnected },
              { label: 'AI Models', ok: aiConnected },
              { label: 'Jira Board', ok: jiraConnected },
              { label: 'Pipeline', ok: pipelineOk },
            ].map((c) => (
              <div key={c.label} className="flex ic jb" style={{ padding: '.6rem 0', borderBottom: '1px solid var(--border)' }}>
                <div className="flex ic g2"><StatusDot connected={c.ok} /><span style={{ fontSize: '.73rem' }}>{c.label}</span></div>
                <span style={{ fontSize: '.62rem', color: c.ok ? 'var(--green)' : 'var(--accent)' }}>{c.ok ? 'connected' : 'not connected'}</span>
              </div>
            ))}
          </div>
          <div className="section-card">
            <div className="section-title mb2">Connection Status</div>
            <div className="grid-3 mb3">
              {[['API Status', 'OK', 'var(--green)'], ['MongoDB', 'OK', 'var(--green)'], ['Uptime', '—', 'var(--text)']].map(([label, val, c]) => (
                <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 5, padding: '.75rem .9rem' }}>
                  <div className="card-label">{label}</div>
                  <div style={{ fontFamily: 'var(--sans)', fontSize: '1.1rem', fontWeight: 700, color: c }}>● {val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── GITHUB ── */}
      {tab === 'github' && (
        <>
          <div className="section-card mb4">
            <div className="flex ic jb mb1">
              <div className="section-title">github connection</div>
              <a className="fs-xs text-accent" href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">Create token on GitHub →</a>
            </div>
            <div className="section-desc">Provide a GitHub Personal Access Token to read source code and create pull requests.</div>
            <div className="form-group">
              <label className="form-label">Personal Access Token</label>
              <input className="form-input" type="password" value={gh.token} onChange={(e) => setGh((g) => ({ ...g, token: e.target.value }))} placeholder="ghp_…" />
              <div className="form-hint">Needs <code>repo</code> and <code>read:packages</code> scopes.</div>
              {ghConnected && !ghTokenEntered && (
                <div style={{ fontSize: '.65rem', color: 'var(--yellow)', marginTop: '.4rem' }}>
                  A token is already saved. Enter your PAT to update it or enable actions.
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Organization (optional)</label>
              <input className="form-input" value={gh.org} onChange={(e) => setGh((g) => ({ ...g, org: e.target.value }))} placeholder="my-org" />
              <div className="form-hint">Leave blank to use your personal repos.</div>
            </div>
            <SaveRow
              onSave={() => save('github', saveGitHub, gh)}
              onTest={() => test('github', () => testGitHub({ token: gh.token }))}
              saving={saving.github}
              testing={testing.github}
              testResult={testResults.github}
              disabled={!ghTokenEntered}
            />
          </div>

          <div className="section-card">
            <div className="flex ic jb mb1">
              <div className="section-title">monitored repositories</div>
              <Btn variant="secondary" size="sm" onClick={loadRepos} disabled={reposLoading || !ghTokenEntered}>
                {reposLoading ? <Spinner size={12} /> : 'sync from github'}
              </Btn>
            </div>
            <div className="section-desc" style={{ marginBottom: '1rem' }}>
              Select which repositories to monitor. <span style={{ color: 'var(--accent)' }}>Only enabled repos will be scanned.</span>
            </div>

            {repos.length > 0 && (
              <>
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 5, padding: '1rem', marginBottom: '1rem' }}>
                  <div className="flex ic g2 mb2">
                    <span style={{ fontFamily: 'var(--sans)', fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent)' }}>{enabledCount}</span>
                    <span className="text-muted fs-xs">of {repos.length} repos enabled</span>
                    <span style={{ marginLeft: 'auto', fontSize: '.62rem', color: 'var(--text3)' }}>{repos.length > 0 ? Math.round((enabledCount / repos.length) * 100) : 0}%</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${repos.length > 0 ? (enabledCount / repos.length) * 100 : 0}%` }} /></div>
                </div>

                <div className="flex ic g3 mb3" style={{ flexWrap: 'wrap' }}>
                  {['all', 'enabled', 'disabled'].map((f) => (
                    <span key={f} onClick={() => setRepoFilter(f)} style={{
                      fontSize: '.62rem', fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', cursor: 'pointer',
                      color: repoFilter === f ? 'var(--text)' : 'var(--text3)',
                      borderBottom: repoFilter === f ? '1px solid var(--accent)' : 'none', paddingBottom: 2
                    }}>
                      {f.toUpperCase()} {f === 'all' ? repos.length : f === 'enabled' ? enabledCount : repos.length - enabledCount}
                    </span>
                  ))}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '.75rem' }}>
                    <span className="fs-xs text-accent" style={{ cursor: 'pointer' }}
                      onClick={() => { const names = repos.map((r) => r.name); setGh((g) => ({ ...g, enabled_repos: names })); setRepos((rs) => rs.map((r) => ({ ...r, enabled: true }))); }}>
                      ENABLE ALL
                    </span>
                    <span className="fs-xs text-muted" style={{ cursor: 'pointer' }}
                      onClick={() => { setGh((g) => ({ ...g, enabled_repos: [] })); setRepos((rs) => rs.map((r) => ({ ...r, enabled: false }))); }}>
                      DISABLE ALL
                    </span>
                  </div>
                </div>

                <input className="search-input" style={{ width: 220, marginBottom: '1rem' }} placeholder="search repos…"
                  value={repoSearch} onChange={(e) => setRepoSearch(e.target.value)} />

                <div className="repo-grid">
                  {filteredRepos.map((r) => {
                    const enabled = (gh.enabled_repos || []).includes(r.name);
                    return (
                      <div key={r.name} className={`repo-card${enabled ? ' enabled' : ''}`}>
                        <div>
                          <div style={{ fontSize: '.73rem', color: 'var(--text)', fontWeight: 500 }}>{r.name}</div>
                          <div className="flex ic g2 mt2" style={{ fontSize: '.62rem', color: 'var(--text3)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.language === 'C#' ? '#9B5CDB' : r.language === 'TypeScript' ? '#3178C6' : r.language === 'Python' ? '#3776AB' : 'var(--text3)', display: 'inline-block' }} />
                            {r.language || 'Unknown'}
                          </div>
                          {r.description && <div style={{ fontSize: '.6rem', color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{r.description}</div>}
                        </div>
                        <label className="toggle">
                          <input type="checkbox" checked={enabled} onChange={(e) => { toggleRepo(r.name, e.target.checked); setRepos((rs) => rs.map((rx) => rx.name === r.name ? { ...rx, enabled: e.target.checked } : rx)); }} />
                          <span className="toggle-slider" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {repos.length === 0 && (
              <div style={{ fontSize: '.72rem', color: 'var(--text3)', padding: '1.5rem 0' }}>
                Save your GitHub token and click <strong style={{ color: 'var(--text2)' }}>sync from github</strong> to load repositories.
              </div>
            )}

            <div className="mt3">
              <Btn onClick={() => save('github', saveGitHub, gh)} disabled={saving.github || !ghTokenEntered}>
                {saving.github ? <><span className="pulse">●</span> saving…</> : 'save repo selection'}
              </Btn>
            </div>
          </div>
        </>
      )}

      {/* ── DYNATRACE ── */}
      {tab === 'dynatrace' && (
        <div className="section-card">
          <div className="flex ic jb mb1">
            <div className="section-title">dynatrace connection</div>
            <div className="flex g3">
              <a className="fs-xs text-accent" href="https://YOUR_ENV.apps.dynatrace.com/ui/access-tokens" target="_blank" rel="noreferrer">Platform tokens →</a>
              <a className="fs-xs text-accent" href="https://YOUR_ENV.live.dynatrace.com/#settings/integration/apikeys" target="_blank" rel="noreferrer">API tokens →</a>
            </div>
          </div>
          <div className="section-desc">Provide Dynatrace tokens to query error logs via the Grail API.</div>
          <div className="form-group">
            <label className="form-label">Environment URL</label>
            <input className="form-input" value={dt.environment_url} onChange={(e) => setDt((d) => ({ ...d, environment_url: e.target.value }))} placeholder="https://xxx.live.dynatrace.com" />
            <div className="form-hint">Your Dynatrace environment base URL.</div>
          </div>
          <div className="form-group">
            <label className="form-label">Platform Token</label>
            <input className="form-input" type="password" value={dt.platform_token} onChange={(e) => setDt((d) => ({ ...d, platform_token: e.target.value }))} placeholder="dt0e01.…" />
            <div className="form-hint">Scopes: <code>storage:logs:read</code> <code>storage:buckets:read</code> <code>storage:metrics:read</code></div>
            {dtConnected && !dtTokenEntered && (
              <div style={{ fontSize: '.65rem', color: 'var(--yellow)', marginTop: '.4rem' }}>
                A token is already saved. Enter your platform token to update it or enable actions.
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">API Token (Optional)</label>
            <input className="form-input" type="password" value={dt.api_token} onChange={(e) => setDt((d) => ({ ...d, api_token: e.target.value }))} placeholder="dt0c01.…" />
            <div className="form-hint" style={{ color: 'var(--accent)' }}>For Environment API v2 (Problems). Scope: <code>problems.read</code>. Optional.</div>
          </div>
          <SaveRow
            onSave={() => save('dynatrace', saveDynatrace, dt)}
            onTest={() => test('dynatrace', () => testDynatrace({ platform_token: dt.platform_token, environment_url: dt.environment_url }))}
            saving={saving.dynatrace}
            testing={testing.dynatrace}
            testResult={testResults.dynatrace}
            disabled={!dtTokenEntered}
          />
        </div>
      )}

      {/* ── AI MODELS ── */}
      {tab === 'ai' && (
        <div className="section-card">
          <div className="section-title mb1">ai provider</div>
          <div className="section-desc">Configure the AI model used for triage and deep agentic investigation.</div>
          <div className="flex ic g4 mb4">
            {[['anthropic', 'Anthropic API'], ['bedrock', 'AWS Bedrock'], ['github', 'GitHub Copilot']].map(([v, l]) => (
              <label key={v} className="flex ic g2" style={{ cursor: 'pointer', fontSize: '.73rem', color: ai.provider === v ? 'var(--text)' : 'var(--text2)' }}>
                <input type="radio" name="provider" value={v} checked={ai.provider === v} onChange={() => setAi((a) => ({ ...a, provider: v }))} style={{ accentColor: 'var(--accent)' }} />
                {l}
              </label>
            ))}
          </div>
          <label className="checkbox-row mb4">
            <input type="checkbox" checked={ai.enable_agentic} onChange={(e) => setAi((a) => ({ ...a, enable_agentic: e.target.checked })) } />
            <span>Enable agentic pipeline</span>
            <span className="checkbox-hint">(tool-calling investigation)</span>
          </label>
          <div className="grid-2 mb3">
            <div className="form-group">
              <label className="form-label">Investigation Model ID</label>
              <input className="form-input" value={ai.investigation_model} onChange={(e) => setAi((a) => ({ ...a, investigation_model: e.target.value }))} />
              <div className="form-hint">Deep agentic analysis model (e.g. claude-opus-4-6).</div>
            </div>
            <div className="form-group">
              <label className="form-label">Triage Model ID</label>
              <input className="form-input" value={ai.triage_model} onChange={(e) => setAi((a) => ({ ...a, triage_model: e.target.value }))} />
              <div className="form-hint">Fast classification model.</div>
            </div>
          </div>
          {ai.provider === 'anthropic' && (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 5, padding: '1.1rem', marginBottom: '1rem' }}>
              <div className="flex ic jb mb3">
                <div className="card-label" style={{ margin: 0 }}>Anthropic Configuration</div>
                <a className="fs-xs text-accent" href="https://console.anthropic.com/keys" target="_blank" rel="noreferrer">Anthropic Console →</a>
              </div>
              <div className="form-group">
                <label className="form-label">API Key</label>
                <input className="form-input" type="password" value={ai.api_key} onChange={(e) => setAi((a) => ({ ...a, api_key: e.target.value }))} placeholder="sk-ant-…" />
                <div className="form-hint">Your Anthropic API key for Claude models.</div>
                {aiConnected && !ai.api_key.trim() && (
                  <div style={{ fontSize: '.65rem', color: 'var(--yellow)', marginTop: '.4rem' }}>
                    An API key is already saved. Enter your key to update it or enable actions.
                  </div>
                )}
              </div>
            </div>
          )}
          <SaveRow onSave={() => save('ai', saveAI, ai)} saving={saving.ai} disabled={!aiKeyEntered} />
        </div>
      )}

      {/* ── JIRA ── */}
      {tab === 'jira' && (
        <>
          <div className="section-card mb4">
            <div className="flex ic jb mb1">
              <div className="section-title">jira connection</div>
              <a className="fs-xs text-accent" href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">Create API token →</a>
            </div>
            <div className="section-desc">Connect to Jira Cloud to create bug tickets when fixes are approved. Optional.</div>
            <div className="form-group">
              <label className="form-label">User Email</label>
              <input className="form-input" value={jira.email} onChange={(e) => setJira((j) => ({ ...j, email: e.target.value }))} placeholder="you@company.com" />
            </div>
            <div className="form-group">
              <label className="form-label">API Token</label>
              <input className="form-input" type="password" value={jira.token} onChange={(e) => setJira((j) => ({ ...j, token: e.target.value }))} placeholder="ATATT3x…" />
              {jiraConnected && !jiraTokenEntered && (
                <div style={{ fontSize: '.65rem', color: 'var(--yellow)', marginTop: '.4rem' }}>
                  A token is already saved. Enter your API token to update it or enable actions.
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Jira Base URL</label>
              <input className="form-input" value={jira.base_url} onChange={(e) => setJira((j) => ({ ...j, base_url: e.target.value }))} placeholder="https://mycompany.atlassian.net" />
            </div>
            <SaveRow
              onSave={() => save('jira', saveJira, jira)}
              onTest={() => test('jira', () => testJira({ token: jira.token, email: jira.email, base_url: jira.base_url }))}
              saving={saving.jira}
              testing={testing.jira}
              testResult={testResults.jira}
              disabled={!jiraTokenEntered}
            />
          </div>

          <div className="section-card">
            <div className="flex ic jb mb3">
              <div className="section-title">jira boards</div>
              <Btn variant="secondary" size="sm" onClick={addBoard}>+ add board</Btn>
            </div>
            <div className="section-desc" style={{ marginBottom: '1rem' }}>Configure boards with custom fields and epics for fix approvals.</div>
            {(jira.boards || []).map((board, bi) => (
              <div key={bi} style={{ border: '1px solid var(--border2)', borderRadius: 5, padding: '1.1rem', marginBottom: '.75rem' }}>
                <div className="grid-2 mb3">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Project Key</label>
                    <input className="form-input" value={board.key} onChange={(e) => updateBoard(bi, 'key', e.target.value)} placeholder="LS" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div className="flex ic jb mb1">
                      <label className="form-label" style={{ margin: 0 }}>Board Name</label>
                      <label className="flex ic g2" style={{ fontSize: '.65rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={board.is_default} onChange={(e) => updateBoard(bi, 'is_default', e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                        default
                      </label>
                    </div>
                    <input className="form-input" value={board.name} onChange={(e) => updateBoard(bi, 'name', e.target.value)} placeholder="Engineering" />
                  </div>
                </div>
                {/* Epics */}
                <div className="form-label mb2">Epics</div>
                {(board.epics || []).map((ep, ei) => (
                  <div key={ei} className="flex ic g2 mb2">
                    <input className="form-input" style={{ width: 110 }} value={ep.key} onChange={(e) => {
                      const epics = [...board.epics]; epics[ei] = { ...epics[ei], key: e.target.value };
                      updateBoard(bi, 'epics', epics);
                    }} placeholder="ENG-1" />
                    <input className="form-input flex-1" value={ep.name} onChange={(e) => {
                      const epics = [...board.epics]; epics[ei] = { ...epics[ei], name: e.target.value };
                      updateBoard(bi, 'epics', epics);
                    }} placeholder="Epic name" />
                    <label className="flex ic g2 fs-xs" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={ep.is_default} onChange={(e) => {
                        const epics = [...board.epics]; epics[ei] = { ...epics[ei], is_default: e.target.checked };
                        updateBoard(bi, 'epics', epics);
                      }} style={{ accentColor: 'var(--accent)' }} />default
                    </label>
                    <span className="fs-xs text-accent" style={{ cursor: 'pointer' }} onClick={() => {
                      updateBoard(bi, 'epics', board.epics.filter((_, i) => i !== ei));
                    }}>remove</span>
                  </div>
                ))}
                <div className="flex ic g3 mt2">
                  <span className="fs-xs text-accent" style={{ cursor: 'pointer' }} onClick={() => updateBoard(bi, 'epics', [...(board.epics || []), { key: '', name: '', is_default: false }])}>+ add epic</span>
                  <span style={{ flex: 1 }} />
                  <span className="fs-xs text-accent" style={{ cursor: 'pointer' }} onClick={() => removeBoard(bi)}>remove board</span>
                </div>
              </div>
            ))}
            <Btn onClick={() => save('jira', saveJira, jira)} disabled={saving.jira || !jiraTokenEntered}>
              {saving.jira ? <><span className="pulse">●</span> saving…</> : 'save boards'}
            </Btn>
          </div>
        </>
      )}

      {/* ── UPLOAD ERRORS ── */}
      {tab === 'upload' && (
        <div className="section-card">
          <div className="section-title mb1">upload errors</div>
          <div className="section-desc">
            Upload a <strong>JSON</strong> or <strong>CSV</strong> file to inject errors directly into the error monitor.
            Duplicates are skipped automatically via fingerprint deduplication.
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              setUploadResult(null);
              const f = e.dataTransfer.files[0];
              if (f) setUploadFile(f);
            }}
            onClick={() => document.getElementById('err-file-input').click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border2)'}`,
              borderRadius: 6,
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? 'var(--bg3)' : 'transparent',
              marginTop: '1.25rem',
              marginBottom: '1rem',
              transition: 'border-color .15s, background .15s',
            }}
          >
            <input
              id="err-file-input"
              type="file"
              accept=".json,.csv,.log,.txt"
              style={{ display: 'none' }}
              onChange={(e) => {
                setUploadResult(null);
                setUploadFile(e.target.files[0] || null);
              }}
            />
            <div style={{ fontSize: '1.5rem', marginBottom: '.4rem' }}>&#8679;</div>
            <div style={{ fontSize: '.73rem', color: 'var(--text2)' }}>
              {uploadFile ? uploadFile.name : 'Drop a file here or click to browse'}
            </div>
            <div className="form-hint" style={{ marginTop: '.3rem' }}>Accepted: .log, .txt, .json, .csv</div>
          </div>

          {/* Format hint */}
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 5, padding: '1rem', marginBottom: '1.25rem', fontSize: '.68rem', color: 'var(--text2)' }}>
            <div style={{ fontWeight: 700, marginBottom: '.4rem', color: 'var(--text)' }}>Expected format</div>
            <div style={{ marginBottom: '.2rem' }}><strong>Log file (.log / .txt)</strong> — standard log output, e.g.:</div>
            <pre style={{ margin: '.3rem 0 .7rem', color: 'var(--text3)', overflowX: 'auto' }}>{`2024-01-15 10:23:45 [ERROR] api-gateway - NullReferenceException: Object not set
  at MyService.Process() in MyService.cs:line 42
2024-01-15 10:24:01 [ERROR] auth-service - TimeoutException: DB timeout`}</pre>
            <div style={{ marginBottom: '.2rem' }}><strong>JSON</strong> — array: <code>{`[{"error_type":"...","message":"...","service":"..."}]`}</code></div>
            <div style={{ marginBottom: '.2rem' }}><strong>CSV</strong> — headers: <code>error_type, message, service, container, repo, classification</code></div>
          </div>

          {/* Result banner */}
          {uploadResult && (
            <div style={{
              padding: '.75rem 1rem', borderRadius: 5, marginBottom: '1rem', fontSize: '.72rem',
              background: uploadResult.error ? 'rgba(248,113,113,.1)' : 'rgba(52,211,153,.1)',
              border: `1px solid ${uploadResult.error ? '#f87171' : 'var(--green)'}`,
              color: uploadResult.error ? '#f87171' : 'var(--green)',
            }}>
              {uploadResult.error
                ? `Error: ${uploadResult.error}`
                : `Inserted ${uploadResult.inserted} error${uploadResult.inserted !== 1 ? 's' : ''} — ${uploadResult.skipped} duplicate${uploadResult.skipped !== 1 ? 's' : ''} skipped (${uploadResult.total} total in file)`}
            </div>
          )}

          <Btn
            onClick={async () => {
              if (!uploadFile) { toast.error('Select a file first'); return; }
              setUploading(true);
              setUploadResult(null);
              try {
                const res = await uploadErrorsFile(uploadFile);
                setUploadResult(res);
                if (res.inserted > 0) toast.success(`${res.inserted} error${res.inserted !== 1 ? 's' : ''} uploaded`);
                else toast.error('No new errors — all duplicates');
              } catch (e) {
                setUploadResult({ error: e.message });
                toast.error(e.message);
              }
              setUploading(false);
            }}
            disabled={uploading || !uploadFile}
          >
            {uploading ? <><span className="pulse">●</span> uploading…</> : 'upload'}
          </Btn>
        </div>
      )}

      {/* ── PIPELINE ── */}
      {tab === 'pipeline' && (
        <div className="section-card">
          <div className="section-title mb1">pipeline settings</div>
          <div className="section-desc">Configure scanning behavior, AI budget limits, and polling schedule.</div>
          <div className="form-label mb2 mt3">Scanning Controls</div>
          <label className="checkbox-row"><input type="checkbox" checked={pipeline.enable_polling} onChange={(e) => setPipeline((p) => ({ ...p, enable_polling: e.target.checked }))} /><span>Enable automatic polling</span></label>
          <label className="checkbox-row"><input type="checkbox" checked={pipeline.pause_scanning} onChange={(e) => setPipeline((p) => ({ ...p, pause_scanning: e.target.checked }))} /><span>Pause scanning</span><span className="checkbox-hint">(stops all Dynatrace queries)</span></label>
          <label className="checkbox-row mb4"><input type="checkbox" checked={pipeline.pause_fix_generation} onChange={(e) => setPipeline((p) => ({ ...p, pause_fix_generation: e.target.checked }))} /><span>Pause fix generation</span><span className="checkbox-hint">(scan continues, no AI analysis)</span></label>
          <div className="grid-2 mb3">
            {[
              ['Polling Interval (Minutes)', 'poll_interval_minutes', 'How often to check for new errors', 'number'],
              ['Max Errors Per Scan', 'max_errors_per_scan', 'Cap on errors per scan cycle', 'number'],
              ['Agent Max Tool Calls', 'agent_max_tool_calls', 'Max tool calls per investigation', 'number'],
              ['Agent Max Cost (USD)', 'agent_max_cost_usd', 'Budget cap per investigation', 'number'],
              ['Target Environments', 'target_environments', 'Comma-separated (e.g. prod, staging)', 'text'],
              ['Environment Prefixes', 'environment_prefixes', 'Prefixes stripped from container names', 'text'],
            ].map(([label, key, hint, type]) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" type={type} value={pipeline[key]} onChange={(e) => setPipeline((p) => ({ ...p, [key]: type === 'number' ? +e.target.value : e.target.value }))} />
                <div className="form-hint">{hint}</div>
              </div>
            ))}
          </div>
          <Btn onClick={() => save('pipeline', savePipeline, pipeline)} disabled={saving.pipeline}>
            {saving.pipeline ? <><span className="pulse">●</span> saving…</> : 'save'}
          </Btn>
        </div>
      )}
    </div>
  );
}
