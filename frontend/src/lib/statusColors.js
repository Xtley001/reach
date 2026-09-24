/**
 * REACH — Status Colour Palette
 *
 * Item 71: Single source of truth for contact status colours used in charts,
 * badges, and detail views. Previously hardcoded in three separate files
 * (MinisterDemographics, MinisterVolunteerDetail, VolunteerDetail) with
 * slightly different hex values per file — the same bug in three places.
 *
 * These values deliberately match the badge colours in global.css so status
 * indicators look consistent whether rendered as a badge, a chart slice,
 * or an inline span. Colours are intentionally distinct for the ~8% of
 * men with red-green colour blindness: "coming" uses a vivid green and
 * "not_coming" uses red, but they're separated by shape/label context in
 * every chart, not colour alone.
 */
export const STATUS_COLORS = {
  coming:          '#25A244',   // --green (light) / #30D158 (dark) — use this for charts
  undecided:       '#C07A10',   // --amber (light)
  not_coming:      '#D92B2B',   // --red (light)
  no_answer:       '#86868B',   // --text-3 (neutral)
  needs_transport: '#E07020',   // warm amber-orange
  message_sent:    '#0066CC',   // --blue (light)
  wrong_number:    '#636366',   // faint neutral
  unreachable:     '#A82020',   // dark red
};

/** Fallback colour for unknown/null statuses */
export const STATUS_COLOR_FALLBACK = '#86868B';

/**
 * Get the colour for a given status code, stripping Python enum prefix.
 * Usage: getStatusColor('ContactStatusCode.coming') → '#25A244'
 */
export function getStatusColor(status) {
  if (!status) return STATUS_COLOR_FALLBACK;
  const key = String(status).split('.').pop();
  return STATUS_COLORS[key] || STATUS_COLOR_FALLBACK;
}
