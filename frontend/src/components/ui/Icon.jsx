/**
 * REACH — Icon.jsx
 *
 * A-1: reach previously had no shared icon component — pages rolled their
 * own emoji or inline <svg> (see HubVolunteers.jsx's local <PeopleIcon/>,
 * MinisterVolunteers.jsx's own copy of the same glyph, ContactsList.jsx's
 * inline chevrons, etc.), so the same concept could render with a different
 * stroke width / size / color from page to page.
 *
 * Usage:
 *   <Icon name="people" size={20} />
 *   <Icon name="phone" size={16} className="contact-row-icon" />
 *
 * All icons share: 24x24 viewBox, currentColor stroke, round joins/caps —
 * so they inherit color/size from CSS the same way everywhere, and swapping
 * one glyph for another never changes visual weight.
 */
const PATHS = {
  people: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  person: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  empty: (
    <>
      <path d="M3 8l1.5 9A2 2 0 006.47 19h11.06A2 2 0 0019.5 17L21 8H3z" />
      <path d="M8 8V6a4 4 0 018 0v2" />
    </>
  ),
  filter: (
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  ),
  check: (
    <path d="M20 6L9 17l-5-5" />
  ),
  x: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  chevronRight: (
    <path d="M9 18l6-6-6-6" />
  ),
  chevronDown: (
    <path d="M6 9l6 6 6-6" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  bus: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M3 12h18" />
      <circle cx="7.5" cy="20" r="1.5" />
      <circle cx="16.5" cy="20" r="1.5" />
    </>
  ),
  flame: (
    <path d="M12 2c1 4-3 5-3 9a3 3 0 006 0c0-1-1-2-1-3 2 1 3 3 3 5a5 5 0 01-10 0c0-4 3-6 5-11z" />
  ),
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" />
  ),
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  arrowLeft: (
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <path d="M12 19l-7-7 7-7" />
    </>
  ),
  alert: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </>
  ),
};

export default function Icon({ name, size = 20, strokeWidth = 1.75, className = '', style, ...rest }) {
  const path = PATHS[name];
  if (!path) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`Icon: unknown name "${name}"`);
    }
    return null;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      {...rest}
    >
      {path}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS);
