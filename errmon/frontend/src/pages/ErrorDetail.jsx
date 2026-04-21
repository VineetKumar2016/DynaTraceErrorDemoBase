import { useState, useEffect, useRef } from 'react';
import { getFixByError, streamAnalysis } from '../api';
import { Badge, Btn, Spinner, Collapsible, fmtDate, useToast, Toast } from '../ui';

export default function ErrorDetail({ error, onBack, onViewFix }) {
  const [fix, setFix] = useState(null);
  const [loadingFix, setLoadingFix] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [currentFixId, setCurrentFixId] = useState(null);
  const toast = useToast();
  const stopRef = useRef(null);

  useEffect(() => {
    getFixByError(error.id)
      .then((f) => { setFix(f); setLoadingFix(false); })
      .catch(() => setLoadingFix(false));
    return () => stopRef.current?.();
  }, [error.id]);

  const handleAnalyze = () => {
    setAnalyzing(true);
    setTimeline([]);
    setCurrentFixId(null);

    stopRef.current = streamAnalysis(error.id, (event) => {
      if (event.type === 'fix_created') {
        setCurrentFixId(event.fix_id);
      } else if (event.type === 'timeline') {
        setTimeline((t) => [...t, event.step]);
      } else if (event.type === 'complete') {
        setAnalyzing(false);
        setFix(event.analysis);
        setCurrentFixId(event.fix_id);
        toast.success('Analysis complete!');
        // Navigate to fix view
        setTimeout(() => onViewFix({ id: event.fix_id, ...event.analysis }), 800);
      } else if (event.type === 'error') {
        toast.error(event.message || 'Analysis failed');
        setAnalyzing(false);
      } else if (event.type === 'done') {
        setAnalyzing(false);
      }
    });
  };

  const logs = error.raw_logs || [];

  return (
    <div className="page">
      <Toast toasts={toast.toasts} />
      <div className="back-link" onClick={onBack}>← errors</div>

      <div className="flex ic g3 mb3" style={{ flexWrap: 'wrap' }}>
        <code style={{ fontFamily: 'var(--mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>
          {error.error_type}
        </code>
        <Badge status={error.status}>{error.status?.replace('_', ' ')}</Badge>
        {error.classification && (
          <span className={`badge badge-${error.classification}`}>{error.classification}</span>
        )}
      </div>

      {/* Metadata grid */}
      <div className="detail-grid mb4">
        <div className="dc"><div className="dc-label">Service</div><div className="dc-val" style={{ color: 'var(--accent)' }}>{error.service}</div></div>
        <div className="dc"><div className="dc-label">Container</div><div className="dc-val">{error.container || error.service}</div></div>
        <div className="dc"><div className="dc-label">Repository</div><div className="dc-val" style={{ color: 'var(--accent)' }}>{error.repo || '—'}</div></div>
        <div className="dc"><div className="dc-label">Classification</div><div className="dc-val">{error.classification}</div></div>
      </div>

      <div className="detail-grid mb4">
        <div className="dc"><div className="dc-label">First Seen</div><div className="dc-val" style={{ fontSize: '.75rem' }}>{fmtDate(error.first_seen)}</div></div>
        <div className="dc"><div className="dc-label">Last Seen</div><div className="dc-val" style={{ fontSize: '.75rem' }}>{fmtDate(error.last_seen)}</div></div>
        <div className="dc"><div className="dc-label">Occurrences</div><div className="dc-val" style={{ color: 'var(--accent)', fontWeight: 700 }}>{error.occurrences}</div></div>
        <div className="dc"><div className="dc-label">Status</div><div className="dc-val"><Badge status={error.status}>{error.status?.replace('_', ' ')}</Badge></div></div>
      </div>

      {/* Message */}
      <div className="mb4">
        <div className="card-label mb2">Error Message</div>
        <div className="code-block">{error.message}</div>
      </div>

      {/* Raw logs */}
      {logs.length > 0 && (
        <Collapsible label="RAW LOGS" badge={logs.length}>
          {logs.map((log, i) => (
            <div key={i} className="code-block" style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border)' }}>
              {typeof log === 'string' ? log : JSON.stringify(log, null, 2)}
            </div>
          ))}
        </Collapsible>
      )}

      {/* Live analysis timeline */}
      {(analyzing || timeline.length > 0) && (
        <div className="section-card mb4">
          <div className="flex ic g3 mb3">
            <span className="card-label" style={{ margin: 0 }}>AI Investigation</span>
            {analyzing && <><span className="pulse" style={{ color: 'var(--accent)' }}>●</span><span className="fs-xs text-yellow">live</span></>}
            <span className="fs-xs text-muted">{timeline.length} steps</span>
          </div>
          <div>
            {timeline.map((step, i) => (
              <div className="timeline-step" key={i}>
                <div className="tl-dot" style={{ background: step.label === 'Error' ? 'var(--accent)' : step.label === 'Result' ? 'var(--green)' : 'var(--yellow)' }} />
                <div style={{ flex: 1 }}>
                  <div className="tl-label">
                    {step.label}
                    {step.badge && <span className="tl-badge">{step.badge}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: '.58rem', color: 'var(--text3)' }}>{step.time}</span>
                  </div>
                  <div className="code-block" style={{ marginTop: '.25rem' }}>{step.content}</div>
                </div>
              </div>
            ))}
            {analyzing && (
              <div className="timeline-step">
                <div className="tl-dot pulse" style={{ background: 'var(--accent)' }} />
                <span className="fs-xs text-muted">investigating…</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex g3" style={{ flexWrap: 'wrap' }}>
        {loadingFix ? (
          <Spinner />
        ) : fix ? (
          <Btn variant="secondary" onClick={() => onViewFix({ id: currentFixId, ...fix })}>
            view existing fix →
          </Btn>
        ) : null}

        {!analyzing && (
          <Btn onClick={handleAnalyze} disabled={analyzing}>
            {fix ? 're-analyze' : 'generate fix'}
          </Btn>
        )}

        {analyzing && (
          <Btn variant="danger" onClick={() => { stopRef.current?.(); setAnalyzing(false); }}>
            stop
          </Btn>
        )}
      </div>
    </div>
  );
}
