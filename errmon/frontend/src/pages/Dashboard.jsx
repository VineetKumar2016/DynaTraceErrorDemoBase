import { useState, useEffect } from 'react';
import { getDashboard, triggerScan } from '../api';
import { Spinner, Btn, timeAgo, useToast, Toast } from '../ui';

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const toast = useToast();

  const load = () => getDashboard().then(setData).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      await triggerScan();
      toast.success('Scan triggered — running in background');
      setTimeout(() => { load(); setScanning(false); }, 4000);
    } catch (e) {
      toast.error(e.message);
      setScanning(false);
    }
  };

  if (!data) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <Spinner size={24} />
    </div>
  );

  const totalClass = Object.values(data.by_classification || {}).reduce((a, b) => a + b, 0) || 1;
  const maxSvc = Math.max(...(data.top_services || []).map((s) => s.count), 1);

  return (
    <div className="page">
      <Toast toasts={toast.toasts} />
      <div className="flex ic jb mb5">
        <div>
          <div className="page-title">dashboard</div>
          <div className="page-sub">
            {data.last_scan ? `LAST SCAN ${timeAgo(data.last_scan).toUpperCase()}` : 'NO SCANS YET'}
          </div>
        </div>
        <Btn onClick={handleScan} disabled={scanning}>
          {scanning ? <><span className="pulse">●</span> scanning…</> : 'trigger scan'}
        </Btn>
      </div>

      {/* Stat cards */}
      <div className="grid-4 mb5">
        {[
          { label: 'Total Errors', val: data.total_errors, color: 'var(--accent)' },
          { label: 'Pending Review', val: data.pending_review, color: 'var(--yellow)' },
          { label: 'Open PRs', val: data.open_prs, color: 'var(--blue)' },
          { label: 'Resolved Today', val: data.resolved_today, color: 'var(--green)' },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-line" style={{ background: s.color }} />
            <div className="stat-val">{s.val ?? 0}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        {/* Classification */}
        <div className="card">
          <div className="card-label mb3">Error Classification</div>
          {Object.keys(data.by_classification || {}).length === 0 ? (
            <div className="text-muted fs-xs">No data yet — trigger a scan to populate</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {Object.entries(data.by_classification || {}).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                  <span style={{ fontSize: '.68rem', color: 'var(--text2)', minWidth: 150 }}>{k}</span>
                  <div className="progress-bar flex-1">
                    <div className="progress-fill" style={{
                      width: `${(v / totalClass) * 100}%`,
                      background: k === 'unknown' ? 'var(--text3)' : k.includes('infra') ? 'var(--yellow)' : 'var(--purple)'
                    }} />
                  </div>
                  <span style={{ fontSize: '.68rem', color: 'var(--text3)', minWidth: 70, textAlign: 'right' }}>
                    {v} ({Math.round((v / totalClass) * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Services */}
        <div className="card">
          <div className="card-label mb3">Top Erroring Services</div>
          {(data.top_services || []).length === 0 ? (
            <div className="text-muted fs-xs">No services found yet</div>
          ) : (
            (data.top_services || []).map((s, i) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.65rem' }}>
                <span style={{ fontSize: '.68rem', color: 'var(--text3)', minWidth: 14 }}>{i + 1}</span>
                <span
                  style={{ fontSize: '.75rem', color: i < 2 ? 'var(--accent)' : 'var(--text)', fontWeight: 500, flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => onNavigate('errors')}
                >
                  {s.name}
                </span>
                <div style={{ width: 140 }}>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(s.count / maxSvc) * 100}%` }} />
                  </div>
                </div>
                <span style={{ fontSize: '.68rem', color: 'var(--text2)', minWidth: 36, textAlign: 'right' }}>{s.count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
