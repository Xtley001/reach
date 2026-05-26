import { useRef } from 'react';

/**
 * 6-cell OTP input — auto-advances on input, backspace goes back.
 * P3-3.9: Paste fills from the focused cell index, not always cell 0.
 */
export function OTPInput({ value = '', onChange }) {
  const cells  = useRef([]);
  const digits = value.padEnd(6, '').split('').slice(0, 6);

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
    // Fill from the cell that received the paste
    pasted.split('').forEach((ch, i) => {
      if (startIdx + i < 6) next[startIdx + i] = ch;
    });
    onChange(next.join(''));
    // Focus the cell after the last pasted digit
    const focusIdx = Math.min(startIdx + pasted.length, 5);
    cells.current[focusIdx]?.focus();
  }

  return (
    <div className="otp-row">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => (cells.current[i] = el)}
          className="otp-cell"
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onFocus={e => e.target.select()}
          onPaste={e => handlePaste(e, i)}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
        />
      ))}
    </div>
  );
}
