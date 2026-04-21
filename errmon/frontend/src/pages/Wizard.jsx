import { useState } from 'react';
import { Btn } from '../ui';

const STEPS = [
  { key: 'github', icon: '🐙', name: 'GitHub Personal Access Token', hint: 'Required to read source code and create pull requests', required: true },
  { key: 'dynatrace', icon: '⚡', name: 'Dynatrace Connection', hint: 'Required to pull production error logs via Grail API', required: true },
  { key: 'ai', icon: '🤖', name: 'AI Model (Anthropic / Bedrock)', hint: 'Required for AI-powered root cause analysis', required: true },
  { key: 'jira', icon: '📋', name: 'Jira Board', hint: 'Optional — create tickets when fixes are approved', required: false },
];

export default function SetupWizard({ onComplete, onGoToSettings }) {
  const [step, setStep] = useState(0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.96)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 10, padding: '2.4rem', width: 560, maxWidth: '92vw' }}>
        <div style={{ fontSize: '.6rem', letterSpacing: '.1em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '.6rem' }}>
          Setup Wizard — Step {step + 1} of {STEPS.length}
        </div>
        <div style={{ fontFamily: 'var(--sans)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-.03em', marginBottom: '.4rem' }}>
          Welcome to AI Error Monitor
        </div>
        <div style={{ fontSize: '.72rem', color: 'var(--text3)', lineHeight: 1.7, marginBottom: '1.4rem' }}>
          Let's connect your tools to start monitoring production errors.
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: '.3rem', marginBottom: '1.4rem' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--border)' }} />
          ))}
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', marginBottom: '1.4rem' }}>
          {STEPS.slice(0, step + 1).map((s, i) => (
            <div key={s.key} style={{
              background: 'var(--bg3)', border: `1px solid ${i < step ? 'var(--green)' : 'var(--border)'}30`,
              borderRadius: 6, padding: '.9rem 1.1rem', display: 'flex', alignItems: 'center', gap: '.9rem'
            }}>
              <span style={{ fontSize: '1.1rem' }}>{s.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text)', marginBottom: '.1rem' }}>
                  {s.name}{' '}
                  {s.required && <span style={{ color: 'var(--accent)', fontSize: '.58rem', fontWeight: 700 }}>REQUIRED</span>}
                </div>
                <div style={{ fontSize: '.62rem', color: 'var(--text3)' }}>{s.hint}</div>
              </div>
              {i < step ? (
                <span style={{ color: 'var(--green)', fontSize: '1rem' }}>✓</span>
              ) : (
                <span style={{ fontSize: '.62rem', color: 'var(--accent)', cursor: 'pointer' }} onClick={() => onGoToSettings(s.key)}>
                  configure →
                </span>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end' }}>
          {step > 0 && <Btn variant="ghost" onClick={() => setStep((s) => s - 1)}>back</Btn>}
          {step < STEPS.length - 1 ? (
            <Btn onClick={() => setStep((s) => s + 1)}>continue →</Btn>
          ) : (
            <Btn onClick={onComplete}>finish setup →</Btn>
          )}
          <Btn variant="ghost" onClick={onComplete}>skip for now</Btn>
        </div>
      </div>
    </div>
  );
}
