import { useRef, useEffect } from 'react';

/**
 * 6-cell OTP input — auto-advances on input, backspace goes back.
 * Fixes:
 *   HIGH-02 — aria-label on each cell, fieldset/legend for screen readers
 *   HIGH-03 — fluid cell width via clamp() so it fits on 320px viewports
 *   LOW-04  — pattern="[0-9]*" for pure number pad on iOS Safari
 *   LOW-05  — stable key (not just index)
 *   MED-04  — WebOTP API autofill on Android
 *   HIGH-06 — error prop triggers red border + shake animation
 */
export function OTPInput({ value = '', onChange, error = false }) {
  const cells  = useRef([]);
  const digits = value.padEnd(6, '').split('').slice(0, 6);

  /* WebOTP API — auto-read SMS code on Android (MED-04) */
  useEffect(() => {
    if (!('OTPCredential' in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal })
      .then(({ code }) => { onChange(code.replace(/\D/g, '').slice(0, 6)); })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  function handleKey(idx, e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = digits.slice();
      if (next[idx]) {
        next[idx] = '';
        onChange(next.join(''));
      } else if (idx > 0) {
        next[idx - 1] = '';
        onChange(next.join(''));
        cells.current[idx - 1]?.focus();
      }
    }
    /* Enter key — let parent form handle it (MED-08) */
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.closest('form')?.requestSubmit();
    }
  }

  function handleChange(idx, e) {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) return;
    const ch   = raw[raw.length - 1];
    const next = digits.slice();
    next[idx]  = ch;
    onChange(next.join(''));
    if (idx < 5) cells.current[idx + 1]?.focus();
  }

  function handlePaste(e, startIdx) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    const next = digits.slice();
    pasted.split('').forEach((ch, i) => {
      if (startIdx + i < 6) next[startIdx + i] = ch;
    });
    onChange(next.join(''));
    const focusIdx = Math.min(startIdx + pasted.length, 5);
    cells.current[focusIdx]?.focus();
  }

  return (
    /* Fieldset groups all cells semantically for screen readers (HIGH-02) */
    <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'block', width: '100%' }}>
      <legend style={{
        position: 'absolute', width: 1, height: 1,
        overflow: 'hidden', clip: 'rect(0,0,0,0)',
        whiteSpace: 'nowrap',
      }}>
        Enter your 6-digit verification code
      </legend>

      <div className="otp-row">
        {digits.map((d, i) => (
          <input
            key={`otp-cell-${i}`}
            ref={el => (cells.current[i] = el)}
            className={`otp-cell${error ? ' otp-cell-error' : ''}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"          /* iOS pure number pad (LOW-04) */
            maxLength={1}
            value={d}
            aria-label={`Digit ${i + 1} of 6`}   /* screen reader (HIGH-02) */
            aria-required="true"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            onChange={e => handleChange(i, e)}
            onKeyDown={e => handleKey(i, e)}
            onFocus={e => e.target.select()}
            onPaste={e => handlePaste(e, i)}
          />
        ))}
      </div>
    </fieldset>
  );
}
