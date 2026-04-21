import { useState } from 'react';

/* ── Shared styles injected once ── */
const STYLES = `
.btn{display:inline-flex;align-items:center;gap:.4rem;font-family:var(--sans);font-size:.8rem;font-weight:600;letter-spacing:.01em;padding:8px 18px;border-radius:6px;border:none;cursor:pointer;transition:all .15s;white-space:nowrap}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover:not(:disabled){background:var(--accent2);transform:translateY(-1px);box-shadow:0 4px 12px rgba(232,23,93,.3)}
.btn-secondary{background:var(--bg4);color:var(--text2);border:1px solid var(--border2)}.btn-secondary:hover:not(:disabled){background:var(--bg5);color:var(--text)}
.btn-ghost{background:transparent;color:var(--text3);border:1px solid var(--border)}.btn-ghost:hover:not(:disabled){color:var(--text2);border-color:var(--border2)}
.btn-green{background:#14532d;color:var(--green);border:1px solid #166534}.btn-green:hover:not(:disabled){background:#166534}
.btn-danger{background:#3d0a0a;color:#f87171;border:1px solid #5a1010}.btn-danger:hover:not(:disabled){background:#4a1010}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none!important;box-shadow:none!important}
.btn-sm{padding:5px 12px;font-size:.67rem}
.btn-xs{padding:3px 10px;font-size:.62rem}

.card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:1.75rem;box-shadow:0 2px 12px rgba(0,0,0,.2)}
.card-label{font-size:.62rem;letter-spacing:.1em;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:.6rem}

.badge{display:inline-flex;align-items:center;font-size:.58rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:2px 8px;border-radius:3px;white-space:nowrap}
.badge-new{background:#0f1a2e;color:#60a5fa;border:1px solid #1a3050}
.badge-analyzing{background:#1e1800;color:var(--yellow);border:1px solid #3a3000}
.badge-fix_generated,.badge-completed{background:#0a1f0a;color:var(--green);border:1px solid #1a3a1a}
.badge-pr_created,.badge-approved{background:#0a1a0a;color:var(--green);border:1px solid #1a4020}
.badge-rejected{background:#200a0a;color:#f87171;border:1px solid #3a1010}
.badge-investigating{background:#1e1800;color:var(--yellow);border:1px solid #3a3000}
.badge-unknown{background:#141420;color:var(--text3);border:1px solid var(--border2)}
.badge-high{background:#250a0a;color:#f87171;border:1px solid #3a1212}
.badge-medium{background:#1e1200;color:var(--orange);border:1px solid #3a2000}
.badge-low{background:#1e1800;color:var(--yellow);border:1px solid #3a3000}
.badge-critical{background:#300a0a;color:#ff4444;border:1px solid #500a0a}
.badge-open{background:#0f1a2e;color:#60a5fa;border:1px solid #1a3050}
.badge-merged{background:#0a1f0a;color:var(--green);border:1px solid #1a3a1a}
.badge-closed{background:#141420;color:var(--text3);border:1px solid var(--border2)}
.badge-skipped{background:#141420;color:var(--text3);border:1px solid var(--border2)}
.badge-failed{background:#200a0a;color:#f87171;border:1px solid #3a1010}
.badge-paused{background:#1e1800;color:var(--yellow);border:1px solid #3a3000}
.badge-structured\\ error{background:#1a0e2e;color:var(--purple);border:1px solid #2a1a40}
.badge-infrastructure\\ noise{background:#1e1800;color:var(--yellow);border:1px solid #3a3000}

.form-group{margin-bottom:1.1rem}
.form-label{font-size:.62rem;letter-spacing:.08em;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:.5rem;display:block}
.form-input{width:100%;font-family:var(--sans);font-size:.82rem;color:var(--text);background:var(--bg3);border:1px solid var(--border2);border-radius:6px;padding:10px 14px;outline:none;transition:border-color .15s,box-shadow .15s}
.form-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(232,23,93,.1)}
.form-hint{font-size:.65rem;color:var(--text3);margin-top:.4rem;line-height:1.6}
.form-hint code{color:var(--accent)}
.form-error{font-size:.68rem;color:#f87171;margin-top:.35rem}

.section-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:1.75rem;margin-bottom:1.25rem;box-shadow:0 2px 12px rgba(0,0,0,.2)}
.section-title{font-family:var(--sans);font-size:1.1rem;font-weight:700;color:var(--text);letter-spacing:-.02em;margin-bottom:.3rem}
.section-desc{font-size:.72rem;color:var(--text3);line-height:1.7;margin-bottom:1.25rem}

.divider{height:1px;background:var(--border);margin:1.1rem 0}

.toggle{position:relative;width:36px;height:20px;cursor:pointer;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0;position:absolute}
.toggle-slider{position:absolute;inset:0;background:var(--bg5);border-radius:20px;border:1px solid var(--border2);transition:.2s}
.toggle-slider::before{content:"";position:absolute;width:14px;height:14px;left:2px;top:2px;background:var(--text3);border-radius:50%;transition:.2s}
.toggle input:checked+.toggle-slider{background:var(--accent);border-color:var(--accent)}
.toggle input:checked+.toggle-slider::before{transform:translateX(16px);background:#fff}

.code-block{background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:.75rem;font-size:.67rem;color:var(--text2);overflow-x:auto;line-height:1.7;white-space:pre-wrap;word-break:break-all}

.spinner{width:16px;height:16px;border:2px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}

.pulse{animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}

.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:300;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
.modal{background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:2rem;width:520px;max-width:92vw;max-height:90vh;overflow-y:auto}
.modal-title{font-family:var(--sans);font-size:1.1rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.4rem}
.modal-desc{font-size:.7rem;color:var(--text3);margin-bottom:1.4rem;line-height:1.6}
.modal-footer{display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.4rem}

.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{font-size:.62rem;letter-spacing:.09em;color:var(--text3);text-transform:uppercase;font-weight:700;padding:.9rem 1.25rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;cursor:pointer;user-select:none}
th:hover{color:var(--text2)}
td{padding:.9rem 1.25rem;border-bottom:1px solid var(--border);font-size:.78rem;color:var(--text2);vertical-align:middle}
tr:hover td{background:var(--bg3)}
tr:last-child td{border-bottom:none}
tr.clickable{cursor:pointer}

.tag{display:inline-flex;align-items:center;font-size:.55rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:3px}

.progress-bar{height:6px;background:var(--bg5);border-radius:3px;overflow:hidden}
.progress-fill{height:100%;background:var(--accent);border-radius:3px;transition:width .3s}

.back-link{display:inline-flex;align-items:center;gap:.35rem;font-size:.68rem;color:var(--text3);cursor:pointer;margin-bottom:1.1rem;transition:color .15s}
.back-link:hover{color:var(--text2)}

.filter-select{font-family:var(--sans);font-size:.8rem;color:var(--text2);background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px 30px 8px 12px;cursor:pointer;outline:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2355556a'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;transition:border-color .15s}
.filter-select:focus{border-color:var(--border2)}
.filter-select:hover{border-color:var(--border2)}

.search-input{font-family:var(--sans);font-size:.8rem;color:var(--text);background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px 12px 8px 32px;outline:none;width:220px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' fill='none' stroke='%2355556a' stroke-width='2'%3E%3Ccircle cx='5.5' cy='5.5' r='3.5'/%3E%3Cpath d='M9 9l2.5 2.5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:10px center;transition:border-color .15s}
.search-input::placeholder{color:var(--text3)}
.search-input:focus{border-color:var(--border2)}

.collapsible-hdr{display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:.8rem 1rem;border:1px solid var(--border);border-radius:4px;background:var(--bg3);transition:background .15s;font-size:.68rem;font-weight:600;letter-spacing:.07em;color:var(--text2)}
.collapsible-hdr:hover{background:var(--bg4)}
.collapsible-body{border:1px solid var(--border);border-top:none;border-radius:0 0 4px 4px;overflow:hidden}

.page{padding:2.5rem 3rem;max-width:1440px}
.page-title{font-family:var(--sans);font-size:2.2rem;font-weight:800;letter-spacing:-.04em;margin-bottom:.3rem;text-transform:capitalize}
.page-sub{font-size:.68rem;color:var(--text3);letter-spacing:.06em;margin-bottom:1.75rem}

.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.25rem}
.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:1.25rem}

.flex{display:flex}.flex-1{flex:1}.ic{align-items:center}.jb{justify-content:space-between}.g2{gap:.5rem}.g3{gap:.75rem}.g4{gap:1rem}
.mb1{margin-bottom:.25rem}.mb2{margin-bottom:.5rem}.mb3{margin-bottom:.75rem}.mb4{margin-bottom:1rem}.mb5{margin-bottom:1.25rem}.mb6{margin-bottom:1.5rem}
.mt2{margin-top:.5rem}.mt3{margin-top:.75rem}.mt4{margin-top:1rem}
.fs-xs{font-size:.62rem}.fs-sm{font-size:.7rem}
.text-accent{color:var(--accent)}.text-green{color:var(--green)}.text-yellow{color:var(--yellow)}.text-muted{color:var(--text3)}.text-dim{color:var(--text2)}.text-red{color:#f87171}
.fw-bold{font-weight:700}

.toast-wrap{position:fixed;bottom:1.5rem;right:1.5rem;z-index:500;display:flex;flex-direction:column;gap:.5rem}
.toast{background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:.65rem 1rem;font-size:.7rem;display:flex;align-items:center;gap:.5rem;min-width:220px;animation:slideIn .2s ease}
.toast-success{border-color:#166534;color:var(--green)}
.toast-error{border-color:#5a1010;color:#f87171}
.toast-info{border-color:var(--border2);color:var(--text2)}
@keyframes slideIn{from{transform:translateX(30px);opacity:0}to{transform:translateX(0);opacity:1}}

.detail-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--border);border-radius:8px;overflow:hidden}
.dc{padding:1.1rem 1.4rem;border-right:1px solid var(--border)}
.dc:last-child{border-right:none}
.dc-label{font-size:.6rem;letter-spacing:.1em;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:.45rem}
.dc-val{font-size:.85rem;color:var(--text);font-weight:500}

.settings-tabs{display:flex;gap:.5rem;margin-bottom:1.75rem;flex-wrap:wrap}
.stab{font-size:.65rem;letter-spacing:.08em;font-weight:700;text-transform:uppercase;padding:7px 16px;border-radius:6px;cursor:pointer;border:1px solid transparent;display:flex;align-items:center;gap:.4rem;transition:all .15s}
.stab:not(.active){color:var(--text3);border-color:var(--border)}.stab:not(.active):hover{color:var(--text2);background:var(--bg3)}
.stab.active{background:var(--accent);color:#fff;border-color:var(--accent);box-shadow:0 2px 8px rgba(232,23,93,.25)}
.dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
.dot-green{background:var(--green)}.dot-red{background:var(--accent)}.dot-yellow{background:var(--yellow)}.dot-gray{background:var(--text3)}

.timeline-step{display:flex;gap:.65rem;padding:.65rem .85rem;border-bottom:1px solid var(--border);font-size:.68rem}
.tl-dot{width:10px;height:10px;border-radius:50%;margin-top:3px;flex-shrink:0}
.tl-label{font-size:.57rem;letter-spacing:.1em;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:.25rem;display:flex;align-items:center;gap:.4rem}
.tl-badge{display:inline-flex;align-items:center;font-size:.58rem;background:var(--bg4);border:1px solid var(--border2);border-radius:3px;padding:1px 6px;color:var(--yellow);font-weight:600}

.repo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem}
.repo-card{background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:.75rem .9rem;display:flex;align-items:center;justify-content:space-between;transition:border-color .15s}
.repo-card:hover{border-color:var(--border2)}
.repo-card.enabled{border-color:#1a3020}

.stat-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:1.6rem 1.75rem;box-shadow:0 2px 12px rgba(0,0,0,.2);transition:transform .15s,box-shadow .15s}
.stat-card:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(0,0,0,.3)}
.stat-line{height:3px;width:2.5rem;margin-bottom:1.1rem;border-radius:2px}
.stat-val{font-family:var(--sans);font-size:2.6rem;font-weight:800;letter-spacing:-.05em;line-height:1}
.stat-label{font-size:.62rem;letter-spacing:.1em;color:var(--text3);text-transform:uppercase;margin-top:.5rem;font-weight:700}

.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5rem 2rem;color:var(--text3);font-size:.78rem;gap:.85rem;text-align:center}
.empty-icon{font-size:3rem;opacity:.25}

.notify-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 1.5s infinite}

.checkbox-row{display:flex;align-items:center;gap:.5rem;font-size:.73rem;color:var(--text2);cursor:pointer;margin-bottom:.5rem}
.checkbox-row input{accent-color:var(--accent)}
.checkbox-hint{font-size:.62rem;color:var(--text3)}
`;

if (typeof document !== 'undefined' && !document.getElementById('ui-styles')) {
  const s = document.createElement('style');
  s.id = 'ui-styles';
  s.textContent = STYLES;
  document.head.appendChild(s);
}

export function Badge({ status, children }) {
  const s = (status || '').toLowerCase().replace(/ /g, '_');
  return <span className={`badge badge-${s}`}>{children || status}</span>;
}

export function Btn({ variant = 'primary', size = '', onClick, disabled, children, style }) {
  return (
    <button
      className={`btn btn-${variant}${size ? ' btn-' + size : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={{ ...(disabled ? { opacity: 0.38, cursor: 'not-allowed', pointerEvents: 'none' } : {}), ...style }}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 16 }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function Toast({ toasts }) {
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'} {t.msg}
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = (msg, type = 'info') => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };
  return { toasts, success: (m) => add(m, 'success'), error: (m) => add(m, 'error'), info: (m) => add(m, 'info') };
}

export function Collapsible({ label, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb3">
      <div className="collapsible-hdr" onClick={() => setOpen((o) => !o)}>
        <span>
          {label}
          {badge !== undefined && (
            <span style={{ background: 'var(--bg5)', borderRadius: 3, padding: '1px 6px', marginLeft: 8, fontSize: '.6rem', color: 'var(--text3)' }}>
              {badge}
            </span>
          )}
        </span>
        <span style={{ color: 'var(--text3)', fontSize: '.6rem', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform .2s' }}>▼</span>
      </div>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

export function StatusDot({ connected }) {
  return <span className={`dot dot-${connected ? 'green' : 'red'}`} />;
}

export function EmptyState({ icon = '📭', title, sub }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '.8rem', color: 'var(--text2)' }}>{title}</div>
      {sub && <div>{sub}</div>}
    </div>
  );
}

export function Modal({ title, desc, onClose, children, footer }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal">
        <div className="modal-title">{title}</div>
        {desc && <div className="modal-desc">{desc}</div>}
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
}

export function timeAgo(s) {
  if (!s) return '—';
  const diff = (Date.now() - new Date(s)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
