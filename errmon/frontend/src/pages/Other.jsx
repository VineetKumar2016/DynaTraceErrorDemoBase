import { useState, useEffect } from 'react';
import { getFixes, getPRs, getScans, triggerScanSync } from '../api';
import { Badge, Btn, Spinner, EmptyState, timeAgo, fmtDate, useToast, Toast } from '../ui';

/* ── FIXES LIST ── */
export function FixesList({ onViewFix }) {
  const [data, setData] = useState({ fixes: [], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFixes().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-title mb5">fixes</div>
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
        ) : data.fixes.length === 0 ? (
          <EmptyState icon="🔧" title="No fixes yet" sub="Analyze an error to generate AI fixes" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Error Type</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>PR</th>
                  <th>Jira</th>
                  <th>Cost</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.fixes.map((f) => (
                  <tr key={f.id} className="clickable" onClick={() => onViewFix(f)}>
                    <td><code style={{ fontSize: '.7rem', color: 'var(--text)' }}>{f.error_type || 'Unknown'}</code></td>
                    <td><Badge status={f.severity}>{f.severity}</Badge></td>
                    <td><Badge status={f.status}>{f.status}</Badge></td>
                    <td>
                      <span className={`badge badge-${f.pr_status === 'created' ? 'fix_generated' : 'analyzing'}`}>
                        {f.pr_status?.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${f.jira_status === 'created' ? 'fix_generated' : 'analyzing'}`}>
                        {f.jira_status?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ color: 'var(--accent)', fontWeight: 700 }}>${(f.cost_usd || 0).toFixed(4)}</td>
                    <td className="text-muted">{timeAgo(f.created_at)}</td>
                    <td><button className="btn btn-ghost btn-sm">view →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── PULL REQUESTS ── */
export function PullRequests() {
  const [data, setData] = useState({ prs: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPRs().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-title mb5">pull requests</div>
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
        ) : data.prs.length === 0 ? (
          <EmptyState icon="🔀" title="No pull requests yet" sub="Approve a fix to create a GitHub PR" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PR</th>
                  <th>Title</th>
                  <th>Repository</th>
                  <th>Jira</th>
                  <th>Cost</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.prs.map((pr) => (
                  <tr key={pr.fix_id}>
                    <td>
                      {pr.pr_number ? (
                        <a href={pr.pr_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                          #{pr.pr_number}
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                      {pr.title}
                    </td>
                    <td className="text-muted fs-xs">{pr.repo}</td>
                    <td>
                      {pr.jira_id ? (
                        <a href={pr.jira_url} target="_blank" rel="noreferrer" className="text-accent fs-xs">{pr.jira_id}</a>
                      ) : '—'}
                    </td>
                    <td style={{ color: 'var(--accent)', fontWeight: 700 }}>${(pr.cost || 0).toFixed(4)}</td>
                    <td><Badge status="open">open</Badge></td>
                    <td className="text-muted fs-xs">{timeAgo(pr.created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── SCANS ── */
export function Scans() {
  const [data, setData] = useState({ scans: [] });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const toast = useToast();

  const load = () => getScans().then(setData).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await triggerScanSync();
      toast.success(`Scan complete — ${res.new_errors} new, ${res.updated_errors} updated`);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="page">
      <Toast toasts={toast.toasts} />
      <div className="flex ic jb mb5">
        <div className="page-title">scans</div>
        <Btn onClick={handleScan} disabled={scanning}>
          {scanning ? <><span className="pulse">●</span> scanning…</> : 'trigger scan'}
        </Btn>
      </div>

      {scanning && (
        <div className="card mb4" style={{ border: '1px solid var(--border2)' }}>
          <div className="flex ic g3 mb3">
            <span className="pulse" style={{ color: 'var(--accent)' }}>●</span>
            <span style={{ fontSize: '.75rem', fontWeight: 600 }}>Scan in progress</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill pulse" style={{ width: '60%' }} />
          </div>
          <div className="fs-xs text-muted mt2">Polling Dynatrace for new errors…</div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
        ) : data.scans.length === 0 ? (
          <EmptyState icon="📡" title="No scans yet" sub="Trigger a scan to start monitoring" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Repos</th>
                  <th>Errors Found</th>
                  <th>New</th>
                  <th>Updated</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {data.scans.map((s, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text)' }}>{fmtDate(s.started_at)}</td>
                    <td className="text-muted">{s.duration_seconds ? `${s.duration_seconds.toFixed(1)}s` : '—'}</td>
                    <td className="text-dim">{s.repos_scanned ?? '—'}</td>
                    <td><span style={{ fontWeight: 700, color: (s.errors_found || 0) > 0 ? 'var(--accent)' : 'var(--text3)' }}>{s.errors_found ?? 0}</span></td>
                    <td><span style={{ fontWeight: 700, color: (s.new_errors || 0) > 0 ? 'var(--yellow)' : 'var(--text3)' }}>{s.new_errors ?? 0}</span></td>
                    <td className="text-muted">{s.updated_errors ?? 0}</td>
                    <td><Badge status={s.status}>{s.status}</Badge></td>
                    <td className="text-muted fs-xs">{s.error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── ARCHITECTURE ── */
export function Architecture() {
  const nodes = [
    { label: 'Dynatrace', sub: 'Error Source', color: 'var(--yellow)' },
    { label: 'Polling Service', sub: 'Every N min', color: 'var(--blue)' },
    { label: 'Error Processing', sub: 'Dedup + Normalize', color: 'var(--purple)' },
    { label: 'AI Analysis Agent', sub: 'Claude / GPT / Bedrock', color: 'var(--accent)' },
    { label: 'Git Worktree', sub: 'Isolated Changes', color: 'var(--green)' },
    { label: 'Build & Validate', sub: 'Compile + Test', color: 'var(--orange)' },
    { label: 'UI Dashboard', sub: 'Human Review', color: 'var(--blue)' },
    { label: 'GitHub PR', sub: 'Code Integration', color: 'var(--green)' },
    { label: 'Jira Ticket', sub: 'Issue Tracking', color: 'var(--blue)' },
  ];
  const ArchNode = ({ n }) => (
    <div style={{ background: 'var(--bg3)', border: `1px solid ${n.color}30`, borderRadius: 6, padding: '.8rem 1rem', textAlign: 'center' }}>
      <div style={{ width: 26, height: 26, background: `${n.color}18`, border: `1px solid ${n.color}40`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto .4rem', fontSize: '.6rem', color: n.color }}>●</div>
      <div style={{ fontWeight: 600, fontSize: '.73rem', marginBottom: '.15rem' }}>{n.label}</div>
      <div style={{ fontSize: '.6rem', color: 'var(--text3)' }}>{n.sub}</div>
    </div>
  );
  const Arrow = ({ label = '→' }) => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '.7rem' }}>{label}</div>;

  return (
    <div className="page">
      <div className="page-title mb2">architecture</div>
      <div className="page-sub mb5">System flow and component relationships</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', gap: '.6rem', alignItems: 'center', marginBottom: '.6rem' }}>
        {nodes.slice(0, 5).map((n, i) => [
          <ArchNode key={n.label} n={n} />,
          i < 4 ? <Arrow key={`a${i}`} /> : null
        ])}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', gap: '.6rem', alignItems: 'center', marginBottom: '.6rem' }}>
        <ArchNode n={nodes[5]} />
        <Arrow />
        <ArchNode n={nodes[6]} />
        <div />
        <div />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '.6rem', alignItems: 'center', maxWidth: 480, marginBottom: '2rem' }}>
        <ArchNode n={nodes[7]} />
        <Arrow label="+" />
        <ArchNode n={nodes[8]} />
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-label mb3">Design Principles</div>
          {['Human-in-the-Loop: AI suggestions require developer approval', 'Deduplication First: Fingerprinting reduces repeated analysis', 'Context Optimization: Only relevant code snippets sent to AI', 'Manual Control: Auto scanning on, auto fixing off'].map((p) => (
            <div key={p} className="flex g2 mb2" style={{ fontSize: '.7rem', color: 'var(--text2)', lineHeight: 1.6 }}>
              <span className="text-accent" style={{ flexShrink: 0 }}>→</span>{p}
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-label mb3">Technology Stack</div>
          {[['Frontend', 'React + Vite', 'var(--blue)'], ['Backend', 'Python FastAPI', 'var(--yellow)'], ['Database', 'JSON File', 'var(--green)'], ['AI', 'Claude / GPT / Bedrock', 'var(--purple)'], ['Monitoring', 'Dynatrace Grail API', 'var(--orange)'], ['VCS', 'GitHub REST API', 'var(--text2)']].map(([k, v, c]) => (
            <div key={k} className="flex jb mb2" style={{ fontSize: '.7rem' }}>
              <span className="text-muted">{k}</span>
              <span style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
