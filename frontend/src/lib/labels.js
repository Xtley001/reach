/**
 * REACH — Unified Label Map
 * All code values map to human-readable labels here.
 * Import this module wherever a label is needed — never derive inline.
 */

export const STATUS_LABELS = {
  coming:          'Coming',
  undecided:       'Undecided',
  not_coming:      'Not Coming',
  no_answer:       'No Answer',
  needs_transport: 'Needs Bus',
  wrong_number:    'Wrong Number',
  message_sent:    'Msg Sent',
  unreachable:     'Unreachable',
  // Aliased full Python enum paths
  'ContactStatusCode.coming':          'Coming',
  'ContactStatusCode.undecided':       'Undecided',
  'ContactStatusCode.not_coming':      'Not Coming',
  'ContactStatusCode.no_answer':       'No Answer',
  'ContactStatusCode.needs_transport': 'Needs Bus',
  'ContactStatusCode.wrong_number':    'Wrong Number',
  'ContactStatusCode.message_sent':    'Msg Sent',
  'ContactStatusCode.unreachable':     'Unreachable',
};

export const STATUS_CLASSES = {
  coming:          'badge-green',
  undecided:       'badge-amber',
  not_coming:      'badge-red',
  no_answer:       '',
  needs_transport: 'badge-amber',
  wrong_number:    'badge-red',
  message_sent:    'badge-blue',
  unreachable:     'badge-red',
};

export const DECISION_LABELS = {
  salvation:    'Gave Their Life',
  rededication: 'Rededicated',
  holy_spirit:  'Received the Holy Spirit',
  healing:      'Healing / Testimony',
  prayer:       'Prayer / Counselling',
  other:        'Other',
};

export const DECISION_CLASSES = {
  salvation:    'badge-gold',
  rededication: 'badge-green',
  holy_spirit:  'badge-blue',
  healing:      'badge-green',
  prayer:       'badge-amber',
  other:        '',
};

export const SOURCE_LABELS = {
  volunteer:       'Logged by Volunteer',
  'walk-in':       'Walk-In',
  paper_form:      'Paper Form',
  'pre-registered':'Pre-Registered',
};

export const PIPELINE_LABELS = {
  entered:          'New',
  assigned:         'Assigned',
  first_contact:    'First Contact Made',
  church_connected: 'Church Connected',
  confirmed_active: 'Active',
};

export const HOW_HEARD_OPTIONS = [
  'Friend / Family',
  'Flyer / Poster',
  'Social media',
  'Radio / TV',
  'A volunteer spoke to me',
  'Passing by / saw the crowd',
  'Other',
];

export const DECISION_TYPE_OPTIONS = [
  { value: 'salvation',    label: 'Gave Their Life to Christ' },
  { value: 'rededication', label: 'Rededicated Their Life' },
  { value: 'holy_spirit',  label: 'Received the Holy Spirit' },
  { value: 'healing',      label: 'Healing / Miracle Testimony' },
  { value: 'prayer',       label: 'Wants Prayer or Counselling' },
  { value: 'other',        label: 'Other' },
];

export const AGE_RANGE_OPTIONS = ['Under 18', '18–25', '26–35', '36–50', '51+'];

/**
 * Look up a label from a map. Returns fallback if not found.
 */
export function label(map, key, fallback = key) {
  if (!key) return fallback;
  const k = String(key).split('.').pop(); // strip "ContactStatusCode." prefix
  return map[k] ?? map[key] ?? fallback;
}

/**
 * Strip Python enum prefix from a status string.
 */
export function stripEnumPrefix(s) {
  if (!s) return s;
  return String(s).split('.').pop();
}
