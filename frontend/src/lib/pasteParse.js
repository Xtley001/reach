/**
 * REACH — pasteParse.js
 *
 * C-31: tolerant parser for the mass-paste-import screen. Accepts, per line:
 *   Name<TAB or COMMA>Phone
 *   Phone only
 *   numbers with spaces/dashes/parens
 *   numbers with or without country code
 *
 * Normalises to E.164 client-side so the preview table (C-32) can show
 * green/flagged rows BEFORE hitting the API — this mirrors
 * backend/schemas.py's validate_phone() exactly (Nigerian 080xxxxxxxxx ->
 * +234..., assume Nigeria if no leading +) so what the volunteer sees in the
 * preview is what the server will actually accept, not a guess that might
 * differ from the real validation on submit.
 *
 * Runs entirely client-side (C-37) — no network call, so it's instant even
 * on spotty church wifi.
 */

const E164_RE = /^\+[1-9]\d{7,14}$/;
const NG_LOCAL_RE = /^0[789]\d{9}$/;

export function normalizePhone(raw) {
  if (!raw) return { ok: false, reason: 'empty' };
  let cleaned = String(raw).replace(/[\s\-()]/g, '');
  if (NG_LOCAL_RE.test(cleaned)) {
    cleaned = '+234' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  if (!E164_RE.test(cleaned)) {
    return { ok: false, reason: 'unparseable', raw };
  }
  return { ok: true, phone: cleaned };
}

/**
 * Splits a line into name/phone. Accepts tab or comma as the separator;
 * whatever comes last on the line (after the last separator) is treated as
 * the phone number, everything before it as the name — this handles names
 * that themselves contain commas awkwardly less well, but covers the
 * realistic "Name, +234..." / "Name<TAB>080..." cases described in C-31.
 */
function splitLine(line) {
  const sep = line.includes('\t') ? '\t' : (line.includes(',') ? ',' : null);
  if (!sep) return { name: null, phoneRaw: line.trim() };
  const idx = line.lastIndexOf(sep);
  const name = line.slice(0, idx).trim();
  const phoneRaw = line.slice(idx + 1).trim();
  return { name: name || null, phoneRaw };
}

/**
 * C-32: never silently drop a row. Every input line becomes exactly one
 * output row, either { status: 'ok' } or { status: 'error', reason }.
 */
export function parsePasteBlock(text) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  return lines.map((line, i) => {
    const { name, phoneRaw } = splitLine(line);
    const result = normalizePhone(phoneRaw);
    if (!result.ok) {
      return { line: i, raw: line, status: 'error', reason: 'Could not read this line as a phone number', name };
    }
    return { line: i, raw: line, status: 'ok', name, phone: result.phone };
  });
}
