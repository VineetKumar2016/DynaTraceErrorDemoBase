import { useState, useEffect } from 'react';
import {
  getSettings, saveGitHub, saveDynatrace, saveJira, saveAI, savePipeline,
  testGitHub, testDynatrace, testJira, getGitHubRepos, uploadErrorsFile,
  generateDynatraceToken, getHealth, generateFix,
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
  const [health, setHealth] = useState(null);
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoFilter, setRepoFilter] = useState('all');
  const [generatingFix, setGeneratingFix] = useState(false);
  const toast = useToast();

  // Local form state
  const [gh, setGh] = useState({ token: '', org: '', enabled_repos: [] });
  const [dt, setDt] = useState({ platform_token: '', api_token: '', environment_url: '' });
  const [generatingToken, setGeneratingToken] = useState(false);
  const [jira, setJira] = useState({ email: '', token: '', base_url: '', boards: [] });
  const [ai, setAi] = useState({ enable_agentic: true, investigation_provider: 'anthropic', investigation_model: 'claude-opus-4-6', investigation_api_key: '', triage_provider: 'anthropic', triage_model: 'claude-sonnet-4-6', triage_api_key: '' });
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
        const { investigation_api_key: _iak, triage_api_key: _tak, ...aiRest } = s.ai;
        setAi({ enable_agentic: true, investigation_provider: 'anthropic', investigation_model: 'claude-opus-4-6', investigation_api_key: '', triage_provider: 'anthropic', triage_model: 'claude-sonnet-4-6', triage_api_key: '', ...aiRest });
      }
      if (s.pipeline) setPipeline((p) => ({ ...p, ...s.pipeline }));
      setLoading(false);
      if (s.github?.token) {
        getGitHubRepos().then((res) => {
          if (!res.error) setRepos(res.repos || []);
        }).catch(() => {});
      }
    }).catch(() => setLoading(false));
    getHealth().then(setHealth).catch(() => {});
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

  const handleGenerateFix = async () => {
    setGeneratingFix(true);
    try {
      const fixData = {
        repo_name: 'Clone_Demo_Repo',
        error_message: 'plugin:vite:oxc] Transform failed with 3 errors: in src/App.jsx',
        prompt: 'create a branch from the main branch of provided repository, fix the issue mentioned in the error message and push the branch in git. After this raise the PR pointing to main branch. Newly created branch and PR should be visible in Git.'
      };
      
      const response = await generateFix(fixData);
      toast.success('Fix generation initiated! Check the fix details below.');
      console.log('Generated fix:', response);
    } catch (e) {
      toast.error(`Failed to generate fix: ${e.message}`);
    } finally {
      setGeneratingFix(false);
    }
  };

  const ghConnected   = !!settings?.github?.token;
  const dtConnected   = !!settings?.dynatrace?.platform_token || !!settings?.dynatrace?.api_token;
  const jiraConnected = !!settings?.jira?.token;
  const aiConnected = !!settings?.ai?.investigation_api_key || !!settings?.ai?.triage_api_key
    || settings?.ai?.investigation_provider === 'bedrock' || settings?.ai?.triage_provider === 'bedrock';

  // Buttons enabled only when the user has typed a credential in the field
  const ghTokenEntered   = gh.token.trim().length > 0;
  const dtTokenEntered   = dt.platform_token.trim().length > 0 || dt.api_token.trim().length > 0;
  const jiraTokenEntered = jira.token.trim().length > 0;
  const invKeyEntered = ai.investigation_provider === 'bedrock' || ai.investigation_api_key.trim().length > 0;
  const triKeyEntered = ai.triage_provider === 'bedrock' || ai.triage_api_key.trim().length > 0;
  const aiKeyEntered  = invKeyEntered && triKeyEntered;
  const pipelineOk = true;

  const tabs = [
    { id: 'config', label: 'Configuration' },
    { id: 'github', label: 'GitHub & Repos', dot: ghConnected ? 'green' : null },
    { id: 'dynatrace', label: 'Dynatrace', dot: dtConnected ? 'green' : null },
    { id: 'ai', label: 'AI Models', dot: aiConnected ? 'green' : null },
    { id: 'jira', label: 'Jira Boards', dot: jiraConnected ? 'green' : null },
    { id: 'pipeline', label: 'Pipeline' },
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
              {[
                ['API Status', health?.status?.toUpperCase() ?? '…', health ? 'var(--green)' : 'var(--text3)'],
                ['Store', health?.store ?? '…', 'var(--green)'],
                ['Polling', health?.poll ?? '…', health?.poll === 'running' ? 'var(--green)' : 'var(--accent)'],
              ].map(([label, val, c]) => (
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
              <Btn variant="secondary" size="sm" onClick={loadRepos} disabled={reposLoading || (!ghTokenEntered && !ghConnected)}>
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
              <Btn onClick={() => save('github', saveGitHub, gh)} disabled={saving.github || (!ghTokenEntered && !ghConnected)}>
                {saving.github ? <><span className="pulse">●</span> saving…</> : 'save repo selection'}
              </Btn>
              <Btn onClick={handleGenerateFix} disabled={generatingFix} style={{ marginLeft: '0.75rem' }}>
                {generatingFix ? <><span className="pulse">●</span> generating…</> : 'generate fix'}
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
            <a className="fs-xs text-accent" href="https://docs.dynatrace.com/docs/manage/access-control/access-tokens" target="_blank" rel="noreferrer">Token docs →</a>
          </div>
          <div className="section-desc">Enter your API Token to auto-generate a scoped platform token, or paste a platform token directly.</div>

          {/* Environment URL */}
          <div className="form-group">
            <label className="form-label">Environment URL</label>
            <input className="form-input" value={dt.environment_url} onChange={(e) => setDt((d) => ({ ...d, environment_url: e.target.value }))} placeholder="https://xxx.live.dynatrace.com" />
            <div className="form-hint">Your Dynatrace environment base URL.</div>
          </div>

          {/* API Token + Fetch Platform Token button */}
          <div className="form-group">
            <label className="form-label">API Token</label>
            <div className="flex ic g3">
              <input
                className="form-input"
                type="password"
                style={{ flex: 1 }}
                value={dt.api_token}
                onChange={(e) => setDt((d) => ({ ...d, api_token: e.target.value }))}
                placeholder="dt0c01.…"
              />
              {dt.api_token.trim() && (
                <Btn
                  variant="secondary"
                  disabled={!dt.environment_url.trim() || generatingToken}
                  onClick={async () => {
                    setGeneratingToken(true);
                    try {
                      const res = await generateDynatraceToken({ pat: dt.api_token, environment_url: dt.environment_url });
                      setDt((d) => ({ ...d, platform_token: res.token }));
                      toast.success(res.generated ? 'Platform token generated — save to apply' : 'PAT copied as platform token — save to apply');
                    } catch (e) {
                      toast.error(e.message);
                    }
                    setGeneratingToken(false);
                  }}
                >
                  {generatingToken ? <><span className="pulse">●</span> generating…</> : 'Fetch Platform Token'}
                </Btn>
              )}
            </div>
            <div className="form-hint">Needs <code>apiTokens.write</code> scope to generate a platform token.</div>
          </div>

          {/* Platform token (auto-filled or manual) */}
          <div className="form-group">
            <label className="form-label">Platform Token</label>
            <input
              className="form-input"
              type="password"
              value={dt.platform_token}
              onChange={(e) => setDt((d) => ({ ...d, platform_token: e.target.value }))}
              placeholder="auto-filled after Fetch Platform Token, or paste manually"
            />
            <div className="form-hint">
              Scopes auto-created: <code>logs.ingest</code> <code>logs.read</code> <code>metrics.read</code> <code>entities.read</code> <code>problems.read</code>
            </div>
            {dtConnected && !dtTokenEntered && (
              <div style={{ fontSize: '.65rem', color: 'var(--yellow)', marginTop: '.4rem' }}>
                A token is already saved. Generate or paste a new one to update.
              </div>
            )}
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
      {tab === 'ai' && (() => {
        const ANTHROPIC_MODELS = [
          { id: 'claude-opus-4-6',              label: 'Claude Opus 4.6' },
          { id: 'claude-sonnet-4-6',            label: 'Claude Sonnet 4.6' },
          { id: 'claude-haiku-4-5-20251001',    label: 'Claude Haiku 4.5' },
          { id: 'claude-3-7-sonnet-20250219',   label: 'Claude 3.7 Sonnet' },
          { id: 'claude-3-5-sonnet-20241022',   label: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-5-haiku-20241022',    label: 'Claude 3.5 Haiku' },
          { id: 'claude-3-opus-20240229',       label: 'Claude 3 Opus' },
        ];
        const OPENAI_MODELS = [
          { id: 'gpt-4o',       label: 'GPT-4o' },
          { id: 'gpt-4o-mini',  label: 'GPT-4o Mini' },
          { id: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
          { id: 'o1',           label: 'o1' },
          { id: 'o1-mini',      label: 'o1 Mini' },
          { id: 'o3-mini',      label: 'o3 Mini' },
          { id: 'o4-mini',      label: 'o4 Mini' },
        ];
        const GOOGLE_MODELS = [
          { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro' },
          { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
          { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash' },
          { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
          { id: 'gemini-1.5-pro',        label: 'Gemini 1.5 Pro' },
          { id: 'gemini-1.5-flash',      label: 'Gemini 1.5 Flash' },
        ];
        const MODEL_OPTIONS = { anthropic: ANTHROPIC_MODELS, openai: OPENAI_MODELS, google: GOOGLE_MODELS };
        const PROVIDERS = [['anthropic', 'Anthropic'], ['openai', 'OpenAI'], ['google', 'Google']];

        const ModelSection = ({ title, providerKey, modelKey, apiKeyKey, keyHint, modelPlaceholder }) => {
          const prov   = ai[providerKey] || 'anthropic';
          const apiKey = ai[apiKeyKey]   || '';
          const isSaved = prov === 'bedrock'
            ? false
            : prov === 'anthropic' ? !!settings?.ai?.[apiKeyKey] : !!settings?.ai?.[apiKeyKey];
          return (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 5, padding: '1.1rem', marginBottom: '1rem' }}>
              <div className="card-label mb3">{title}</div>
              {/* Provider */}
              <div className="form-group">
                <label className="form-label">Provider</label>
                <div className="flex ic g4">
                  {PROVIDERS.map(([v, l]) => (
                    <label key={v} className="flex ic g2" style={{ cursor: 'pointer', fontSize: '.73rem', color: prov === v ? 'var(--text)' : 'var(--text2)' }}>
                      <input type="radio" name={providerKey} value={v} checked={prov === v} onChange={() => setAi((a) => ({ ...a, [providerKey]: v }))} style={{ accentColor: 'var(--accent)' }} />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
              {/* Model */}
              <div className="form-group">
                <label className="form-label">Model</label>
                {MODEL_OPTIONS[prov] ? (
                  <select className="form-input" value={ai[modelKey]} onChange={(e) => setAi((a) => ({ ...a, [modelKey]: e.target.value }))}>
                    {MODEL_OPTIONS[prov].map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                ) : (
                  <input className="form-input" value={ai[modelKey]} onChange={(e) => setAi((a) => ({ ...a, [modelKey]: e.target.value }))} placeholder={modelPlaceholder} />
                )}
              </div>
              {/* API Key (not needed for Bedrock) */}
              {prov !== 'bedrock' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">API Key</label>
                  <input className="form-input" type="password" value={apiKey} onChange={(e) => setAi((a) => ({ ...a, [apiKeyKey]: e.target.value }))}
                    placeholder={prov === 'openai' ? 'sk-…' : prov === 'google' ? 'AIzaSy…' : 'sk-ant-…'} />
                  <div className="form-hint">{keyHint}</div>
                  {isSaved && !apiKey.trim() && (
                    <div style={{ fontSize: '.65rem', color: 'var(--yellow)', marginTop: '.4rem' }}>
                      A key is already saved. Enter it again to update or enable actions.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="section-card">
            <div className="section-title mb1">ai models</div>
            <div className="section-desc">Each model can use a different provider and API key.</div>
            <label className="checkbox-row mb4">
              <input type="checkbox" checked={ai.enable_agentic} onChange={(e) => setAi((a) => ({ ...a, enable_agentic: e.target.checked }))} />
              <span>Enable agentic pipeline</span>
              <span className="checkbox-hint">(tool-calling investigation)</span>
            </label>
            <ModelSection
              title="Investigation Model"
              providerKey="investigation_provider"
              modelKey="investigation_model"
              apiKeyKey="investigation_api_key"
              keyHint="Used for deep root-cause analysis."
              modelPlaceholder={ai.investigation_provider === 'bedrock' ? 'anthropic.claude-opus-4-6-v1:0' : 'claude-opus-4-6'}
            />
            <ModelSection
              title="Triage Model"
              providerKey="triage_provider"
              modelKey="triage_model"
              apiKeyKey="triage_api_key"
              keyHint="Used for fast error classification."
              modelPlaceholder={ai.triage_provider === 'bedrock' ? 'anthropic.claude-sonnet-4-6-v1:0' : 'claude-sonnet-4-6'}
            />
            <SaveRow onSave={() => save('ai', saveAI, ai)} saving={saving.ai} disabled={!aiKeyEntered} />
          </div>
        );
      })()}

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
