import { useEffect } from 'react';

/**
 * AvatarLightbox — tap avatar thumbnail to see full-size with gold ring.
 * editable=true shows "Change photo" button.
 */
export function AvatarLightbox({ src, name, open, onClose, editable, onEdit }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ alignItems: 'center', background: 'rgba(0,0,0,0.72)' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)',
            background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: 'var(--radius)',
            color: 'white', width: 36, height: 36, fontSize: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >×</button>

        {src ? (
          <img
            src={src}
            alt={name}
            style={{
              width: 'min(320px, 80vw)', height: 'min(320px, 80vw)',
              borderRadius: '50%',
              border: '2px solid var(--gold)',
              boxShadow: '0 0 40px var(--gold-glow)',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div style={{
            width: 'min(280px, 70vw)', height: 'min(280px, 70vw)',
            borderRadius: '50%',
            border: '2px solid var(--gold)',
            background: 'var(--bg-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 'clamp(48px, 10vw, 80px)',
            color: 'var(--text-2)',
          }}>
            {name?.[0]?.toUpperCase() || '?'}
          </div>
        )}

        {name && (
          <div style={{ color: 'white', fontSize: 18, fontWeight: 600, textAlign: 'center' }}>
            {name}
          </div>
        )}

        {editable && onEdit && (
          <button className="btn btn-outline" onClick={onEdit} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
            Change Photo
          </button>
        )}
      </div>
    </div>
  );
}

export function Avatar({ src, name, size = 40, className = '', onClick }) {
  const initials = name?.[0]?.toUpperCase() || '?';
  return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: '50%',
        border: '1px solid var(--border)',
        background: 'var(--bg-3)',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        fontSize: size * 0.4,
        color: 'var(--text-2)',
      }}
      className={className}
    >
      {src
        ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials
      }
    </div>
  );
}
