import { useState, useEffect } from 'react';
import './index.css';
import { getHealth } from './api';
import Dashboard from './pages/Dashboard';
import Errors from './pages/Errors';
import ErrorDetail from './pages/ErrorDetail';
import FixReview from './pages/FixReview';
import { FixesList, PullRequests, Scans, Architecture } from './pages/Other';
import Settings from './pages/Settings';
import Wizard from './pages/Wizard';

const NAV = ['Dashboard', 'Errors', 'Fixes', 'Pull Requests', 'Scans', 'Architecture', 'Settings'];

const NAV_STYLE = `
  .nav{display:flex;align-items:center;gap:2rem;padding:0 2.5rem;height:62px;background:var(--bg2);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;box-shadow:0 1px 16px rgba(0,0,0,.25)}
  .nav-logo{font-family:var(--sans);font-weight:800;font-size:1.1rem;color:var(--accent);letter-spacing:-.01em;margin-right:1rem;white-space:nowrap}
  .nav-link{font-family:var(--sans);font-size:.82rem;font-weight:600;color:var(--text3);letter-spacing:.01em;cursor:pointer;padding:5px 0;border-bottom:2px solid transparent;transition:all .15s;white-space:nowrap}
  .nav-link:hover{color:var(--text2)}
  .nav-link.active{color:var(--text);border-bottom-color:var(--accent)}
  .health-dot{width:7px;height:7px;border-radius:50%;background:var(--text3)}
  .health-dot.ok{background:var(--green)}
  .health-dot.err{background:var(--accent)}
  .theme-select{font-family:var(--sans);font-size:.78rem;color:var(--text3);background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:5px 24px 5px 10px;cursor:pointer;outline:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%2355556a'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;transition:all .15s}
  .theme-select:hover{color:var(--text2);border-color:var(--accent)}
`;

const THEMES = [
  { value: 'dark', label: 'Dark' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'nord', label: 'Nord' },
  { value: 'light', label: 'Light' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [selectedError, setSelectedError] = useState(null);
  const [selectedFix, setSelectedFix] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [health, setHealth] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('errmon-theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('errmon-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Check if first time setup needed
    const visited = localStorage.getItem('errmon-visited');
    if (!visited) { setShowWizard(true); localStorage.setItem('errmon-visited', '1'); }
    // Health check
    getHealth().then(setHealth).catch(() => setHealth({ status: 'error' }));
    const t = setInterval(() => getHealth().then(setHealth).catch(() => setHealth({ status: 'error' })), 30000);
    return () => clearInterval(t);
  }, []);

  const navigate = (p) => {
    setPage(p.toLowerCase());
    setSelectedError(null);
    setSelectedFix(null);
  };

  const isActive = (n) => {
    const nl = n.toLowerCase();
    if (nl === 'errors' && (page === 'errors' || page === 'error-detail')) return true;
    if (nl === 'fixes' && (page === 'fixes' || page === 'fix-detail')) return true;
    return page === nl;
  };

  return (
    <>
      <style>{NAV_STYLE}</style>

      {showWizard && (
        <Wizard
          onComplete={() => setShowWizard(false)}
          onGoToSettings={(tab) => { setShowWizard(false); setPage('settings'); }}
        />
      )}

      <nav className="nav">
        <div className="nav-logo">◈ Errmon</div>
        {NAV.map((n) => (
          <span key={n} className={`nav-link${isActive(n) ? ' active' : ''}`} onClick={() => navigate(n)}>
            {n}
          </span>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <select className="theme-select" value={theme} onChange={(e) => setTheme(e.target.value)} title="Switch theme">
            {THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div className={`health-dot${health?.status === 'ok' ? ' ok' : health ? ' err' : ''}`} title={health ? `API: ${health.status} | Store: ${health.store}` : 'Checking…'} />
          <span style={{ fontSize: '.72rem', color: 'var(--text3)', cursor: 'pointer' }} onClick={() => setShowWizard(true)}>⚙ setup</span>
        </div>
      </nav>

      {page === 'dashboard' && <Dashboard onNavigate={navigate} />}

      {page === 'errors' && (
        <Errors onViewError={(e) => { setSelectedError(e); setPage('error-detail'); }} />
      )}
      {page === 'error-detail' && selectedError && (
        <ErrorDetail
          error={selectedError}
          onBack={() => setPage('errors')}
          onViewFix={(f) => { setSelectedFix(f); setPage('fix-detail'); }}
        />
      )}

      {page === 'fixes' && (
        <FixesList onViewFix={(f) => { setSelectedFix(f); setPage('fix-detail'); }} />
      )}
      {page === 'fix-detail' && selectedFix && (
        <FixReview
          fix={selectedFix}
          onBack={() => setPage('fixes')}
          onViewError={(e) => { setSelectedError(e); setPage('error-detail'); }}
        />
      )}

      {page === 'pull requests' && <PullRequests />}
      {page === 'scans' && <Scans />}
      {page === 'architecture' && <Architecture />}
      {page === 'settings' && <Settings />}
    </>
  );
}
