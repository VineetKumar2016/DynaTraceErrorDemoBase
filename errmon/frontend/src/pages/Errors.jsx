import { useState, useEffect, useCallback } from 'react';
import { getErrors, getErrorStats, deleteError, getSettings, fetchFromDynatrace, getIngestStatus } from '../api';
import { Badge, Spinner, EmptyState, timeAgo, useToast, Toast } from '../ui';

export default function Errors({ onViewError }) {
  const [data, setData] = useState({ errors: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [classification, setClassification] = useState('');
  const [repo, setRepo] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('last_seen');
  const [sortDir, setSortDir] = useState(-1);
  const [page, setPage] = useState(1);
  const [classifications, setClassifications] = useState([]);
  const [enabledRepos, setEnabledRepos] = useState([]);
  const [dtReady, setDtReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFrom, setSyncFrom] = useState('now-1h');
  const toast = useToast();

  useEffect(() => {
    getErrorStats().then((s) => {
      if (s.by_classification) setClassifications(Object.keys(s.by_classification).sort());
    }).catch(() => {});
    getSettings().then((s) => {
      setEnabledRepos(s?.github?.enabled_repos || []);
    }).catch(() => {});
    getIngestStatus().then((s) => setDtReady(s?.ready || false)).catch(() => {});
  }, []);

  const handleSyncDynatrace = async () => {
    setSyncing(true);
    try {
      const r = await fetchFromDynatrace({ from_time: syncFrom });
      toast.success(`${r.inserted} new errors synced from Dynatrace (${r.skipped} duplicates skipped)`);
      load();
    } catch (e) {
      toast.error(`Dynatrace sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    getErrors({ status, classification, repo, search, sort_by: sortBy, sort_dir: sortDir, page, limit: 50 })
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, classification, repo, search, sortBy, sortDir, page]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === -1 ? 1 : -1));
    else { setSortBy(col); setSortDir(-1); }
  };

  const sortIcon = (col) => sortBy === col ? (sortDir === -1 ? ' ↓' : ' ↑') : '';

  const handleDelete = async (e, err) => {
    e.stopPropagation();
    if (!window.confirm(`Delete error "${err.error_type}"?`)) return;
    try {
      await deleteError(err.id);
      toast.success('Error deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  const handleAnalyze = (e, err) => {
    e.stopPropagation();
    onViewError(err);
  };

  return (
    <div className="page">
      <Toast toasts={toast.toasts} />
      <div className="page-title mb3">errors</div>

      {/* Filters */}
      <div className="flex ic g3 mb4" style={{ flexWrap: 'wrap' }}>
        <select className="filter-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">all statuses</option>
          <option value="new">new</option>
          <option value="analyzing">analyzing</option>
          <option value="fix_generated">fix generated</option>
          <option value="pr_created">pr created</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>

        <select className="filter-select" value={classification} onChange={(e) => { setClassification(e.target.value); setPage(1); }}>
          <option value="">all classifications</option>
          {classifications.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select className="filter-select" value={repo} onChange={(e) => { setRepo(e.target.value); setPage(1); }}>
          <option value="">all errors</option>
          <option value="monitored">monitored repos only</option>
          {enabledRepos.length > 0 && <option disabled>──────────</option>}
          {enabledRepos.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <input
          className="search-input"
          placeholder="search errors…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />

        <span style={{ marginLeft: 'auto', fontSize: '.62rem', color: 'var(--text3)', letterSpacing: '.06em' }}>
          {data.total} ERRORS
        </span>

        {dtReady && (
          <div className="flex ic g2" style={{ marginLeft: '1rem' }}>
            <select
              className="filter-select"
              value={syncFrom}
              onChange={(e) => setSyncFrom(e.target.value)}
              title="Fetch logs from this time window"
            >
              <option value="now-15m">last 15 min</option>
              <option value="now-1h">last 1 hour</option>
              <option value="now-6h">last 6 hours</option>
              <option value="now-24h">last 24 hours</option>
              <option value="now-7d">last 7 days</option>
            </select>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleSyncDynatrace}
              disabled={syncing}
              title="Fetch error logs from Dynatrace and add to this list"
            >
              {syncing ? <Spinner size={12} /> : '⬇ Dynatrace'}
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading && !data.errors.length ? (
          <div style={{ padding: '3rem', display: 'flex', justifyContent: 'center' }}><Spinner size={20} /></div>
        ) : data.errors.length === 0 ? (
          <EmptyState icon="🔍" title="No errors found" sub="Trigger a scan or adjust your filters" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th onClick={() => handleSort('service')}>Service{sortIcon('service')}</th>
                  <th onClick={() => handleSort('error_type')}>Error{sortIcon('error_type')}</th>
                  <th>Message</th>
                  <th onClick={() => handleSort('occurrences')}>#  {sortIcon('occurrences')}</th>
                  <th onClick={() => handleSort('last_seen')}>Last Seen{sortIcon('last_seen')}</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.errors.map((e) => (
                  <tr key={e.id} className="clickable" onClick={() => onViewError(e)}>
                    <td>
                      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{e.service}</span>
                      {e.source === 'dynatrace' && (
                        <span style={{
                          marginLeft: 5, fontSize: '.58rem', fontWeight: 700, letterSpacing: '.04em',
                          background: 'color-mix(in srgb,#1a73e8 15%,var(--bg2))',
                          color: '#1a73e8', border: '1px solid color-mix(in srgb,#1a73e8 30%,var(--bg2))',
                          borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle',
                        }}>DT</span>
                      )}
                    </td>
                    <td>
                      <code style={{ fontSize: '.7rem', color: 'var(--text)' }}>{e.error_type}</code>{' '}
                      <span className={`tag badge-${e.classification}`} style={{ marginLeft: 4 }}>
                        {e.classification === 'unknown' ? 'UNK' : e.classification === 'structured error' ? 'STR' : 'INF'}
                      </span>
                    </td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.message}
                    </td>
                    <td>
                      <span style={{
                        background: 'var(--bg4)', padding: '2px 8px', borderRadius: 12,
                        fontSize: '.68rem', fontWeight: 700,
                        color: e.occurrences > 50 ? 'var(--accent)' : 'var(--text2)'
                      }}>
                        {e.occurrences}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text3)' }}>{timeAgo(e.last_seen)}</td>
                    <td><Badge status={e.status}>{e.status?.replace('_', ' ')}</Badge></td>
                    <td onClick={(ev) => ev.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                        <button className="btn btn-primary btn-xs" onClick={(ev) => handleAnalyze(ev, e)}>Analyze</button>
                        <button className="btn btn-danger btn-xs" onClick={(ev) => handleDelete(ev, e)} title="Delete">✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data.pages > 1 && (
          <div className="flex ic jb" style={{ padding: '.75rem 1rem', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← prev</button>
            <span className="fs-xs text-muted">page {page} / {data.pages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page === data.pages} onClick={() => setPage((p) => p + 1)}>next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
