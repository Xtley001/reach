import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { invalidateAll } from '../../lib/cache';
import { toast, toastError } from '../../lib/toast';
import { parsePasteBlock } from '../../lib/pasteParse';
import { Icon } from '../../components/UI';

const MAX_ROWS = 500; // C-36, mirrors backend MAX_PASTE_ROWS

/**
 * REACH — PasteImportContacts.jsx
 *
 * C-30 through C-38: paste a block of phone numbers (optionally with
 * names), get an instant client-side preview (green = parsed, flagged =
 * couldn't read), confirm, create minimal "incomplete" records, then land
 * straight in ContactsList filtered to "Finish these {n} contacts" —
 * never a dead-end success screen.
 */
export default function PasteImportContacts({ onDone }) {
  const navigate = useNavigate();
  const [text, setText]         = useState('');
  const [rows, setRows]         = useState(null); // null = not previewed yet
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]     = useState(null);

  const overCap = useMemo(() => {
    const lineCount = text.split(/\r?\n/).filter(l => l.trim()).length;
    return lineCount > MAX_ROWS;
  }, [text]);

  function handlePreview() {
    if (!text.trim()) {
      toastError('Paste some phone numbers first.');
      return;
    }
    if (overCap) {
      toastError(`That's a lot at once — split into batches of ${MAX_ROWS} or fewer.`);
      return;
    }
    // C-37: parsing runs entirely client-side, instant, no network round trip.
    setRows(parsePasteBlock(text));
  }

  async function handleConfirm() {
    const okRows = (rows || []).filter(r => r.status === 'ok');
    if (okRows.length === 0) {
      toastError('Nothing valid to import yet — fix the flagged lines first.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.bulkPasteImport(okRows.map(r => ({ name: r.name, phone: r.phone })));
      setResult(res);
      invalidateAll('contacts:');
    } catch (e) {
      toastError(e.message || 'Import failed — nothing was saved. Try again.');
    }
    setSubmitting(false);
  }

  function goFinishThese() {
    // C-38: deep-link straight into ContactsList filtered to "incomplete" —
    // the volunteer's very next tap is "start filling these in."
    navigate('/vol/contacts', { state: { initialFilter: 'incomplete' } });
  }

  if (result) {
    return (
      <div className="page">
        <div className="page-header"><div className="page-title">Import Complete</div></div>
        <div className="page-body">
          <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
            <Icon name="check" size={28} style={{ color: 'var(--green)', marginBottom: 'var(--space-3)' }} />
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              {result.saved} contact{result.saved === 1 ? '' : 's'} added
            </div>
            {result.skipped > 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 'var(--space-4)' }}>
                {result.skipped} skipped as duplicates
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 'var(--space-4)' }}>
              These were saved with just a name and phone — finish adding location and details when you get a chance.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => { setResult(null); setRows(null); setText(''); }}>
                Import More
              </button>
              <button className="btn btn-primary" onClick={goFinishThese}>
                Finish These {result.saved}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Paste Contacts</div>
        <div className="page-subtitle">Paste a list — one per line. Names optional.</div>
      </div>

      <div className="page-body">
        {!rows ? (
          <>
            <textarea
              className="field-input"
              style={{ minHeight: 220, fontFamily: 'var(--font-mono)', fontSize: 13, resize: 'vertical' }}
              placeholder={'Amaka, 08011112222\n07022223333\nChidi Okoro\t+2348033334444'}
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <div style={{ fontSize: 11, color: overCap ? 'var(--red)' : 'var(--text-3)', marginTop: 6, marginBottom: 16 }}>
              {overCap
                ? `Too many lines at once — max ${MAX_ROWS} per paste.`
                : 'One number per line. "Name, phone" or "Name<tab>phone" both work — or just paste the numbers alone.'}
            </div>
            <button className="btn btn-primary btn-full" style={{ height: 44 }} onClick={handlePreview} disabled={overCap}>
              Preview
            </button>
          </>
        ) : (
          <>
            <PastePreview rows={rows} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
              <button className="btn btn-outline" style={{ height: 44 }} onClick={() => setRows(null)}>
                Back
              </button>
              <button
                className="btn btn-primary"
                style={{ height: 44 }}
                onClick={handleConfirm}
                disabled={submitting || rows.filter(r => r.status === 'ok').length === 0}
              >
                {submitting ? 'Creating…' : `Create ${rows.filter(r => r.status === 'ok').length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PastePreview({ rows }) {
  const ok = rows.filter(r => r.status === 'ok');
  const errors = rows.filter(r => r.status === 'error');

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
        {ok.length} parsed{errors.length > 0 ? `, ${errors.length} need fixing` : ''}
      </div>

      {ok.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {ok.map(r => (
            <div key={r.line} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 10px', borderRadius: 'var(--radius-sm)',
              background: 'color-mix(in srgb, var(--green) 10%, var(--bg))',
              marginBottom: 4, fontSize: 12,
            }}>
              <span style={{ color: 'var(--text)' }}>{r.name || <em style={{ color: 'var(--text-3)' }}>Unnamed contact</em>}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{r.phone}</span>
            </div>
          ))}
        </div>
      )}

      {/* C-32: never silently drop a row — flagged lines shown with what to fix. */}
      {errors.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Couldn't read these — fix or they'll be skipped
          </div>
          {errors.map(r => (
            <div key={r.line} style={{
              padding: '8px 10px', borderRadius: 'var(--radius-sm)',
              background: 'color-mix(in srgb, var(--red) 8%, var(--bg))',
              border: '1px solid color-mix(in srgb, var(--red) 30%, var(--border))',
              marginBottom: 4, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)',
            }}>
              {r.raw}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
