import { useState, useEffect } from 'react';
import { getFix } from '../api';
import { approveFix, rejectFix } from '../api';
import { getSettings } from '../api';
import { Badge, Btn, Spinner, Collapsible, fmtDate, timeAgo, useToast, Toast, Modal } from '../ui';

export default function FixReview({ fix: initialFix, onBack, onViewError }) {
  const [fix, setFix] = useState(initialFix);
  const [settings, setSettings] = useState({});
  const [showApprove, setShowApprove] = useState(false);
  const [approving, setApproving] = useState(false);
  const [jiraBoard, setJiraBoard] = useState('');
  const [jiraEpic, setJiraEpic] = useState('');
  const toast = useToast();

  useEffect(() => {
    // Reload fix for fresh data
    if (fix?.id) {
      getFix(fix.id).then(setFix).catch(() => {});
    }
    getSettings().then((s) => {
      setSettings(s);
      const boards = s?.jira?.boards || [];
      const def = boards.find((b) => b.is_default) || boards[0];
      if (def) {
        setJiraBoard(def.key);
        const defEpic = (def.epics || []).find((e) => e.is_default) || (def.epics || [])[0];
        if (defEpic) setJiraEpic(defEpic.key);
      }
    }).catch(() => {});
  }, []);

  const jiraBoards = settings?.jira?.boards || [];

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await approveFix({ fix_id: fix.id, jira_board_key: jiraBoard, jira_epic_key: jiraEpic || null });
      setShowApprove(false);
      // Refresh fix
      const updated = await getFix(fix.id);
      setFix(updated);
      if (res.pr?.success) toast.success(`PR #${res.pr.pr_number} created!`);
      else if (res.pr?.error) toast.error(`PR: ${res.pr.error}`);
      if (res.jira?.success) toast.success(`Jira ${res.jira.jira_id} created!`);
      else if (res.jira?.error) toast.error(`Jira: ${res.jira.error}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('Reject this fix?')) return;
    try {
      await rejectFix(fix.id);
      const updated = await getFix(fix.id);
      setFix(updated);
      toast.success('Fix rejected');
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!fix) return <div className="page"><Spinner size={20} /></div>;

  const isApproved = fix.status === 'approved';
  const isRejected = fix.status === 'rejected';
  const isInvestigating = fix.status === 'investigating';

  return (
    <div className="page">
      <Toast toasts={toast.toasts} />

      {showApprove && (
        <Modal
          title="Confirm Approval"
          desc="This will mark the fix as approved and attempt to create a GitHub PR and JIRA ticket."
          onClose={() => setShowApprove(false)}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setShowApprove(false)}>cancel</Btn>
              <Btn variant="green" onClick={handleApprove} disabled={approving}>
                {approving ? <><span className="pulse">●</span> approving…</> : '✓ approve & create PR'}
              </Btn>
            </>
          }
        >
          {jiraBoards.length > 0 && (
            <>
              <div className="form-group">
                <label className="form-label">Jira Board</label>
                <select className="form-input filter-select" style={{ width: '100%', backgroundPosition: 'right 14px center' }}
                  value={jiraBoard} onChange={(e) => setJiraBoard(e.target.value)}>
                  {jiraBoards.map((b) => (
                    <option key={b.key} value={b.key}>{b.name} ({b.key}){b.is_default ? ' — default' : ''}</option>
                  ))}
                </select>
              </div>
              {jiraBoards.find((b) => b.key === jiraBoard)?.epics?.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Epic</label>
                  <select className="form-input filter-select" style={{ width: '100%', backgroundPosition: 'right 14px center' }}
                    value={jiraEpic} onChange={(e) => setJiraEpic(e.target.value)}>
                    {jiraBoards.find((b) => b.key === jiraBoard).epics.map((ep) => (
                      <option key={ep.key} value={ep.key}>{ep.name} ({ep.key}){ep.is_default ? ' — default' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          {jiraBoards.length === 0 && (
            <div className="form-hint" style={{ marginBottom: '.75rem' }}>No Jira boards configured — only GitHub PR will be created.</div>
          )}
        </Modal>
      )}

      <div className="back-link" onClick={onBack}>← back</div>

      {/* Header badges */}
      <div className="flex ic g3 mb4" style={{ flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--sans)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-.03em' }}>fix review</span>
        <Badge status={fix.severity}>{fix.severity}</Badge>
        <Badge status={fix.status}>{fix.status}</Badge>
        <span className={`badge badge-${fix.pr_status === 'created' ? 'fix_generated' : 'analyzing'}`}>
          PR: {fix.pr_status?.toUpperCase()}
        </span>
        <span className={`badge badge-${fix.jira_status === 'created' ? 'fix_generated' : 'analyzing'}`}>
          JIRA: {fix.jira_status?.toUpperCase()}
        </span>
      </div>

      {/* PR & Jira links */}
      {fix.pr_url && (
        <div style={{ background: '#061a0e', border: '1px solid #1a4020', borderRadius: 5, padding: '.8rem 1rem', marginBottom: '.6rem', fontSize: '.72rem' }}>
          <span style={{ color: 'var(--green)', fontWeight: 700 }}>PR #{fix.pr_number} created</span>{' '}
          <a href={fix.pr_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{fix.pr_url}</a>
        </div>
      )}
      {fix.jira_url && (
        <div style={{ background: '#1a060e', border: '1px solid #3a1020', borderRadius: 5, padding: '.8rem 1rem', marginBottom: '1rem', fontSize: '.72rem' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>JIRA {fix.jira_id}</span>{' '}
          <a href={fix.jira_url} target="_blank" rel="noreferrer">{fix.jira_url}</a>
        </div>
      )}

      {/* RCA + Explanation */}
      {(fix.rca || fix.explanation) && (
        <div className="grid-2 mb4">
          {fix.rca && (
            <div className="section-card">
              <div className="card-label mb3">Root Cause Analysis</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text2)', lineHeight: 1.8 }}>{fix.rca}</div>
            </div>
          )}
          {fix.explanation && (
            <div className="section-card">
              <div className="card-label mb3">Explanation</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text2)', lineHeight: 1.8 }}>{fix.explanation}</div>
            </div>
          )}
        </div>
      )}

      {/* Proposed Changes */}
      {fix.proposed_changes?.length > 0 && (
        <div className="section-card mb4">
          <div className="card-label mb3">Proposed Changes</div>
          {fix.proposed_changes.map((change, i) => (
            <div key={i} style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                <span style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                  PROPOSED CHANGE {i + 1}
                </span>
                <code style={{ fontSize: '.68rem', color: 'var(--blue)' }}>{change.file}</code>
              </div>
              {change.description && (
                <div style={{ fontSize: '.7rem', color: 'var(--text3)', marginBottom: '.4rem', lineHeight: 1.6 }}>{change.description}</div>
              )}
              {change.diff && (
                <div className="code-block" style={{ fontSize: '.65rem' }}>
                  {change.diff.split('\n').map((line, li) => (
                    <div key={li} style={{
                      color: line.startsWith('+') ? 'var(--green)' : line.startsWith('-') ? '#f87171' : 'var(--text2)',
                      background: line.startsWith('+') ? '#0a1f0a' : line.startsWith('-') ? '#2a1010' : 'transparent',
                      padding: '0 .25rem', margin: '0 -.5rem'
                    }}>
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Model & Cost */}
      <div className="section-card mb4">
        <div className="card-label mb3">Model & Cost</div>
        <div className="flex ic g4" style={{ flexWrap: 'wrap', fontSize: '.72rem' }}>
          <code style={{ color: 'var(--text)', fontWeight: 600 }}>{fix.model || '—'}</code>
          <span className="text-muted">{(fix.tokens_in || 0).toLocaleString()} in / {(fix.tokens_out || 0).toLocaleString()} out</span>
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '1rem' }}>${(fix.cost_usd || 0).toFixed(4)}</span>
          <span className="text-muted">{fix.tool_calls || 0} tool calls</span>
          <span className="text-muted">{timeAgo(fix.created_at)}</span>
        </div>
      </div>

      {/* Testing Notes */}
      {fix.testing_notes && (
        <div className="section-card mb4">
          <div className="card-label mb3">Testing Notes</div>
          <div style={{ fontSize: '.72rem', color: 'var(--text2)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{fix.testing_notes}</div>
        </div>
      )}

      {/* Timeline */}
      {fix.timeline?.length > 0 && (
        <Collapsible label="AI INVESTIGATION TIMELINE" badge={fix.timeline.length}>
          {fix.timeline.map((step, i) => (
            <div className="timeline-step" key={i}>
              <div className="tl-dot" style={{ background: step.label === 'Result' ? 'var(--green)' : step.label === 'Error' ? 'var(--accent)' : 'var(--yellow)' }} />
              <div style={{ flex: 1 }}>
                <div className="tl-label">
                  {step.label}
                  {step.badge && <span className="tl-badge">{step.badge}</span>}
                  {step.time && <span style={{ marginLeft: 'auto', fontSize: '.58rem', color: 'var(--text3)' }}>{step.time}</span>}
                </div>
                {step.content && <div className="code-block" style={{ marginTop: '.25rem' }}>{step.content}</div>}
              </div>
            </div>
          ))}
        </Collapsible>
      )}

      {/* Review Decision */}
      <div className="section-card">
        <div className="card-label mb4">Review Decision</div>
        {isApproved ? (
          <div className="flex ic g3">
            <Badge status="approved">approved</Badge>
            <span className="fs-xs text-muted">Fix approved. PR and Jira ticket creation attempted.</span>
          </div>
        ) : isRejected ? (
          <div className="flex ic g3">
            <Badge status="rejected">rejected</Badge>
            <span className="fs-xs text-muted">Fix was rejected.</span>
          </div>
        ) : isInvestigating ? (
          <div className="flex ic g3">
            <span className="pulse" style={{ color: 'var(--accent)' }}>●</span>
            <span className="fs-xs text-yellow">AI is still investigating…</span>
          </div>
        ) : (
          <div className="flex g3" style={{ flexWrap: 'wrap' }}>
            <Btn variant="green" onClick={() => setShowApprove(true)}>✓ approve &amp; create PR</Btn>
            <Btn variant="secondary" onClick={() => toast.info('Re-analysis: click "generate fix" on the error detail page')}>↻ revise</Btn>
            <Btn variant="danger" onClick={handleReject}>✕ reject</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
