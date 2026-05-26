/**
 * REACH — AvatarCropper
 * Twitter-style drag-to-crop. Uses react-easy-crop + browser Canvas API.
 * onCropComplete(blob) returns a 400×400 JPEG blob.
 */
import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';

export default function AvatarCropper({ imageSrc, onCropComplete, onCancel }) {
  const [crop,        setCrop]        = useState({ x: 0, y: 0 });
  const [zoom,        setZoom]        = useState(1);
  const [croppedArea, setCroppedArea] = useState(null);
  const [applying,    setApplying]    = useState(false);

  const onCropAreaChange = useCallback((_, areaPixels) => setCroppedArea(areaPixels), []);

  async function handleConfirm() {
    if (!croppedArea) return;
    setApplying(true);
    try {
      const blob = await cropToBlob(imageSrc, croppedArea, 400);
      onCropComplete(blob);
    } catch (e) {
      console.error('[AvatarCropper]', e);
    }
    setApplying(false);
  }

  return (
    <div>
      {/* Crop viewport */}
      <div style={{ position: 'relative', width: '100%', height: 300, background: '#111', borderRadius: 10, overflow: 'hidden' }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropAreaChange}
          style={{
            containerStyle: { borderRadius: 10 },
            cropAreaStyle: { border: '2px solid rgba(255,214,0,.7)', boxShadow: '0 0 0 9999px rgba(0,0,0,.65)' },
          }}
        />
      </div>

      {/* Zoom */}
      <div style={{ margin: '12px 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--tf)' }}>−</span>
        <input type="range" min={1} max={3} step={0.05} value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--ac)', height: 2 }} />
        <span style={{ fontSize: 11, color: 'var(--tf)' }}>+</span>
      </div>
      <p style={{ fontSize: 10, color: 'var(--tf)', textAlign: 'center', margin: '4px 0 16px' }}>
        Drag to reposition · Pinch or slide to zoom
      </p>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} className="btn btn-outline" style={{ flex: 1 }}>Cancel</button>
        <button onClick={handleConfirm} className="btn btn-primary" style={{ flex: 1 }} disabled={applying}>
          {applying ? 'Applying…' : 'Apply Photo'}
        </button>
      </div>
    </div>
  );
}

/* ── Canvas helper ── */
async function cropToBlob(src, pixelCrop, size = 400) {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, size, size);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Canvas toBlob failed')), 'image/jpeg', 0.92));
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
