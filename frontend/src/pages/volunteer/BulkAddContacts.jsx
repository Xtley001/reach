import { useState, useRef } from 'react';
import { api } from '../../lib/api';
import { invalidateAll } from '../../lib/cache';
import { toast } from '../../lib/toast';
import { Modal } from '../../components/UI';

export default function BulkAddContacts({ onDone }) {
  const [mode, setMode] = useState('form'); // 'form' or 'csv'
  const [contacts, setContacts] = useState(Array(10).fill(null).map(() => ({ 
    name: '', phone: '', location: '', notes: '', needs_transport: false 
  })));
  const [lastLocation, setLastLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const fileInputRef = useRef();

  function updateContact(idx, field, value) {
    const newContacts = [...contacts];
    newContacts[idx][field] = value;
    setContacts(newContacts);
    if (field === 'location' && value.trim()) {
      setLastLocation(value);
    }
  }

  function applyLocationToBelow(idx) {
    const location = contacts[idx].location.trim();
    if (!location) {
      toast('Enter a location first', 'error');
      return;
    }
    const newContacts = [...contacts];
    for (let i = idx + 1; i < newContacts.length; i++) {
      newContacts[i].location = location;
    }
    setContacts(newContacts);
    toast(`Applied to ${newContacts.length - idx - 1} rows below`, 'success');
  }

  function addRow() {
    setContacts(c => [...c, { name: '', phone: '', location: lastLocation, notes: '', needs_transport: false }]);
  }

  function removeRow(idx) {
    if (contacts.length > 1) {
      setContacts(c => c.filter((_, i) => i !== idx));
    } else {
      toast('Keep at least one row', 'info');
    }
  }

  function addRow() {
    setContacts(c => [...c, { name: '', phone: '', location: '', notes: '', needs_transport: false }]);
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
      toast('Add at least one contact', 'error');
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
      
      if (continueMode) {
        // Reset form but keep last location
        const newContacts = Array(10).fill(null).map(() => ({ 
          name: '', phone: '', location: lastLocation, notes: '', needs_transport: false 
        }));
        setContacts(newContacts);
        toast(`Added ${result.created} contacts! Ready for more.`, 'success');
      } else {
        setResults(result);
        invalidateAll('contacts:');
      }
    } catch (e) {
      toast(e.message || 'Failed to add contacts', 'error');
    }
    setLoading(false);
  }

  function handleCSVUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target.result;
        const lines = csv.split('\n').filter(l => l.trim());
        const newContacts = [];

        lines.forEach(line => {
          const parts = line.split(',').map(s => s.trim());
          if (parts.length >= 3 && parts[0] && parts[1]) {
            newContacts.push({
              name: parts[0],
              phone: parts[1],
              location: parts[2] || '',
              notes: parts[3] || '',
              needs_transport: parts[4]?.toLowerCase() === 'yes',
            });
          }
        });

        if (newContacts.length === 0) {
          toast('No valid contacts found in CSV', 'error');
        } else {
          setContacts(newContacts);
          setMode('form');
          toast(`Loaded ${newContacts.length} contacts`, 'success');
        }
      } catch (err) {
        toast('Failed to parse CSV', 'error');
      }
    };
    reader.readAsText(file);
  }

  if (results) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">Bulk Add Complete</div>
        </div>
        <div className="page-body">
          <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
            <div style={{ fontSize: 28, marginBottom: 'var(--space-3)' }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              {results.created} contacts added
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
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-5)' }}>
          <button
            className={`filter-tag${mode === 'form' ? ' active' : ''}`}
            onClick={() => setMode('form')}
          >
            Manual Entry
          </button>
          <button
            className={`filter-tag${mode === 'csv' ? ' active' : ''}`}
            onClick={() => setMode('csv')}
          >
            Import CSV
          </button>
        </div>

        {mode === 'csv' ? (
          <div>
            <div className="form-group">
              <label className="field-label">Upload CSV File</label>
              <div
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 'var(--space-6)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'var(--bg-2)',
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={{ fontSize: 32, marginBottom: 'var(--space-2)' }}>📁</div>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  Click to upload CSV file
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 'var(--space-2)' }}>
                  Format: Name, Phone, Location, Notes (optional), Needs Transport (yes/no)
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        ) : (
          <div>
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
                          onClick={() => applyLocationToBelow(idx)}
                          style={{
                            fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none',
                            cursor: 'pointer', padding: 0, fontWeight: 500,
                          }}
                        >
                          Apply to below ↓
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

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={contact.needs_transport}
                      onChange={e => updateContact(idx, 'needs_transport', e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <label style={{ fontSize: 12, cursor: 'pointer', color: 'var(--text-2)' }}>
                      Needs transport
                    </label>
                  </div>
                </div>
              ))}
            </div>

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
        )}
      </div>
    </div>
  );
}
