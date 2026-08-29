import { useState } from 'react';
import { api } from '../../lib/api';
import { invalidateAll } from '../../lib/cache';
import { toast } from '../../lib/toast';
import { Icon } from '../../components/UI';
import PasteImportContacts from './PasteImportContacts';

/**
 * C-40: paste-import (PasteImportContacts) is the primary "mass upload"
 * flow now — this manual 5-row grid stays available as a secondary "add a
 * few with full detail right now" option, not deleted.
 */
export default function BulkAddContacts({ onDone }) {
  const [mode, setMode] = useState('paste'); // 'paste' | 'manual'
  const [contacts, setContacts] = useState(Array(5).fill(null).map(() => ({
    name: '', phone: '', location: '', notes: '', needs_transport: false, saved: false
  })));
  const [lastLocation, setLastLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  function updateContact(idx, field, value) {
    setContacts(cs => {
      const copy = [...cs];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
    if (field === 'location' && value.trim()) {
      setLastLocation(value.trim());
    }
  }

  function addRows(n = 5) {
    setContacts(cs => [
      ...cs,
      ...Array(n).fill(null).map(() => ({
        name: '', phone: '', location: lastLocation, notes: '', needs_transport: false, saved: false
      }))
    ]);
  }

  function applyLocationToAll(loc) {
    if (!loc) return;
    setContacts(cs => cs.map(c => ({ ...c, location: loc })));
    toast('Location applied to all', 'success');
  }

  function applyLocationToBelow(idx, loc) {
    if (!loc) return;
    setContacts(cs => cs.map((c, i) => i >= idx ? { ...c, location: loc } : c));
    toast('Location applied to rows below', 'success');
  }

  function removeRow(idx) {
    if (contacts.length > 1) {
      setContacts(c => c.filter((_, i) => i !== idx));
    } else {
      toast('Keep at least one row', 'info');
    }
  }

  async function handleSubmit(continueMode = false) {
    const filled = contacts.filter(c => c.name.trim() || c.phone.trim());

    if (filled.length === 0) {
      toast('Please enter at least one contact with name or phone', 'error');
      return;
    }

    const invalid = filled.filter(c => !c.name.trim() || !c.phone.trim());
    if (invalid.length > 0) {
      toast('Each contact must have both a name and a phone number', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload = filled.map(c => ({
        name: c.name.trim(),
        phone: c.phone.trim(),
        location: c.location.trim() || 'Unknown',
        notes: c.notes.trim() || null,
        needs_transport: c.needs_transport,
        transport_location: c.needs_transport ? c.location.trim() : null,
      }));

      const result = await api.addContactsBulk(payload);

      const savedCount = result.saved ?? result.created ?? 0;
      const skippedCount = result.skipped ?? ((result.results?.length || 0) - savedCount);

      if (continueMode) {
        const newContacts = Array(5).fill(null).map(() => ({
          name: '', phone: '', location: lastLocation, notes: '', needs_transport: false, saved: false
        }));
        setContacts(newContacts);
        toast(`Added ${savedCount} contacts! Ready for more.`, 'success');
      } else {
        setResults({ ...result, saved: savedCount, skipped: skippedCount });
        invalidateAll('contacts:');
      }
    } catch (e) {
      toast(e.message || 'Failed to add contacts', 'error');
    }
    setLoading(false);
  }

  if (mode === 'paste') {
    return (
      <div className="page">
        <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
          <div className="filter-row">
            <button className="filter-tag active" disabled style={{ cursor: 'default' }}>Paste List</button>
            <button className="filter-tag" onClick={() => setMode('manual')}>Manual Entry</button>
            <button className="filter-tag" onClick={onDone} style={{ marginLeft: 'auto' }}>Cancel</button>
          </div>
        </div>
        <PasteImportContacts onDone={onDone} />
      </div>
    );
  }

  if (results) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">Bulk Add Complete</div>
        </div>
        <div className="page-body">
          <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
            <div style={{ color: 'var(--green)', marginBottom: 'var(--space-3)', display: 'flex', justifyContent: 'center' }}>
              <Icon name="check" size={32} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              {results.saved} contact{results.saved === 1 ? '' : 's'} added
            </div>
            {results.skipped > 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 'var(--space-4)' }}>
                {results.skipped} skipped (duplicates or invalid)
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setResults(null)}>
                Add More
              </button>
              <button className="btn btn-primary" onClick={onDone}>
                Done
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
        <div className="page-title">Bulk Add Contacts</div>
        <div className="page-subtitle">Add multiple contacts at once</div>
        <div className="filter-row" style={{ marginTop: 8 }}>
          <button className="filter-tag" onClick={() => setMode('paste')}>Paste List instead</button>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {contacts.filter(c => c.name.trim() || c.phone.trim()).length} of {contacts.length} filled
          </div>
          {lastLocation && (
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Last location: <strong>{lastLocation}</strong>
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto', marginBottom: 'var(--space-4)' }}>
          {contacts.map((contact, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: 'var(--space-3)',
                padding: 'var(--space-4)',
                background: 'var(--bg-2)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-3)', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600, minWidth: 24 }}>
                  {idx + 1}
                </div>
                <button
                  onClick={() => removeRow(idx)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 16 }}
                >×</button>
              </div>

              <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                <label className="field-label" style={{ fontSize: 12 }}>Name</label>
                <input
                  className="field-input"
                  placeholder="Full name"
                  value={contact.name}
                  onChange={e => updateContact(idx, 'name', e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                <label className="field-label" style={{ fontSize: 12 }}>Phone</label>
                <input
                  className="field-input"
                  placeholder="+234..."
                  inputMode="tel"
                  value={contact.phone}
                  onChange={e => updateContact(idx, 'phone', e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <label className="field-label" style={{ fontSize: 12, margin: 0 }}>Location</label>
                  {contact.location.trim() && idx < contacts.length - 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px', height: 'auto' }}
                      onClick={() => applyLocationToBelow(idx, contact.location)}
                    >
                      Apply to rows below
                    </button>
                  )}
                </div>
                <input
                  className="field-input"
                  placeholder="Area / City"
                  value={contact.location}
                  onChange={e => updateContact(idx, 'location', e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                <label className="field-label" style={{ fontSize: 12 }}>Notes</label>
                <input
                  className="field-input"
                  placeholder="Additional info (optional)"
                  value={contact.notes}
                  onChange={e => updateContact(idx, 'notes', e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>
                  <input
                    type="checkbox"
                    checked={contact.needs_transport}
                    onChange={e => updateContact(idx, 'needs_transport', e.target.checked)}
                  />
                  Needs bus
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}>
                  <input
                    type="checkbox"
                    checked={contact.saved}
                    onChange={e => {
                      updateContact(idx, 'saved', e.target.checked);
                      if (e.target.checked) updateContact(idx, 'notes', 'Gave their life to Christ');
                      else updateContact(idx, 'notes', '');
                    }}
                  />
                  Saved
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          className="btn btn-ghost btn-full"
          onClick={addRow}
          style={{ marginBottom: 12 }}
        >
          + Add Row
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            className="btn btn-outline"
            onClick={() => handleSubmit(true)}
            disabled={loading}
            style={{ height: 44 }}
          >
            {loading ? 'Adding...' : 'Add & Continue'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleSubmit(false)}
            disabled={loading}
            style={{ height: 44 }}
          >
            {loading ? 'Adding...' : `Add ${contacts.filter(c => c.name.trim() || c.phone.trim()).length} & Done`}
          </button>
        </div>
      </div>
    </div>
  );
}
