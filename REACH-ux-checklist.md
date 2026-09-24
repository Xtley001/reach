# REACH — 100-Point "Make It Feel Effortless" Checklist

Context this was written against: React 18 + Vite, plain CSS design system (`styles/global.css` +
CSS vars), existing `Spinner`/`SkeletonRow`/`SkeletonCard`/`PageSkeleton`/`Modal`/`ConfirmDialog`
in `components/UI.jsx`, `components/ui/*`, `lib/toast.js`, `lib/confetti.js`, `lib/offline.js`,
`hooks/useOfflineSync.js`, `hooks/useTheme.js`, role layouts (`VolunteerLayout`, `HubLeaderLayout`,
`MinisterLayout`, `AttendLayout`, `DecisionsLayout`). Core promise: volunteers log a contact in
under 30 seconds. Every item below should be judged against that promise first.

Feed this to your agent a section at a time — each item is independently actionable. Have it
report back file+line before/after for each change, not just "done."

---

## 1. First 10 seconds (Landing / Login / Signup / OTP)

1. Time the landing page's first meaningful paint on 3G throttle in devtools — anything over ~1.5s, find and cut the blocker.
2. Check `LandingPage.jsx` for a hero animation that plays once on load vs. one that re-triggers on every re-render (React StrictMode double-mount is a common culprit).
3. Audit `LoginPage.jsx` / `SignupPage.jsx`: does the phone/email input auto-focus on mount so the keyboard is already up?
4. On mobile, does tapping the phone input bring up the numeric keypad (`inputMode="tel"` / `type="tel"`), not the full alphabet keyboard?
5. In `OtpStep.jsx`, does focus auto-advance between the 6 OTP boxes, and does paste-from-SMS-autofill populate all boxes at once?
6. Does `AuthProgressBar.jsx` communicate "you're on step 2 of 3," or does it just look decorative? Steps reduce abandonment.
7. Check the OTP resend button: is there a visible countdown (30s/60s) so users don't rage-tap it, rather than just a disabled greyed button with no explanation?
8. Verify the `otp-shake` error animation (global.css) fires on wrong code but does NOT fire on every re-render or network hiccup — false shakes erode trust.
9. `ChannelToggle.jsx` (SMS vs email OTP) — is the currently-selected channel visually obvious at a glance, not just a subtle color shift?
10. After successful signup, is there a branded "you're in" moment (even 400ms) before dropping into `PendingScreen.jsx`, or does it feel abrupt?

## 2. The 30-Second Contact Log (core loop — highest leverage section)

11. In `AddContact.jsx`, count the taps/keystrokes from "tap add" to "contact saved." Every field that isn't strictly required should be optional or deferred.
12. Does the name field auto-capitalize each word without the user having to fix casing?
13. Phone number field: does it auto-format as you type (spacing/dashes) instead of showing a raw digit string?
14. Is there a single, unmissable primary "Save" action reachable without scrolling on a small phone (iPhone SE height, 667px)?
15. After saving, does the form clear and refocus the first field immediately so a volunteer can log the next contact without touching the screen twice?
16. Check `TagChecklist.jsx` — are tags tappable as single-touch toggles, not tiny checkboxes requiring precision taps?
17. `BulkAddContacts.jsx` / `PasteImportContacts.jsx` — does pasting a messy list (extra spaces, mixed delimiters) via `pasteParse.js` show a live preview before committing, so mistakes are caught pre-save not post-save?
18. Is there an undo (not just a confirm dialog) immediately after a contact save/delete, so speed-tapping doesn't feel risky?
19. Does the "Save" button show a micro loading state (not full-page spinner) so double-taps during the network round-trip can't create duplicate contacts?
20. Test the whole add-contact flow one-handed, thumb-only, on a real or simulated 375px-wide screen — flag any control that needs a second hand.

## 3. Loading States & Skeletons

21. Grep every `fetch`/`api.` call that isn't wrapped in a loading state — list them; each is a moment of "is this broken?"
22. Replace any bare `<Spinner />` full-page blocks on list views (hub/minister dashboards) with `SkeletonRow`/`SkeletonCard`/`PageSkeleton` matching the actual content shape, so the layout doesn't jump when data arrives.
23. Check skeleton shapes actually match final content proportions (e.g. `SkeletonCard`'s 40%-width bar vs. what a real stat card looks like) — mismatched skeletons feel more jarring than a plain spinner.
24. Add a minimum-display-time (~300-400ms) to skeletons so fast responses don't produce a one-frame flash/flicker.
25. For anything over ~2s (exports in `MinisterExports.jsx`, bulk imports), swap spinner for a progress indicator with real or estimated percentage, not indefinite spin.
26. Confirm the `shimmer` keyframe (global.css) direction reads left-to-right (or matches RTL if ever needed) and isn't too fast/strobing.
27. Does the call queue (`CallQueue.jsx`) show a skeleton for the next contact while it's being fetched, or a blank flash?
28. Check `RollupChart.jsx` charts — do they animate a skeleton/placeholder bar shape while data loads, rather than popping in fully formed?
29. On slow connections, does the app ever show a fully blank white screen with no skeleton/spinner at all during route transitions? (Check `Suspense` fallback in `App.jsx`.)
30. Add a lightweight branded loading screen (logo mark, not generic spinner) for the initial app boot only — first load is the one moment worth a tiny animation investment.

## 4. Motion & Micro-interactions

31. Audit every `transition`/`animation` in `global.css` for duration — anything over 300ms will feel sluggish on a "log contacts fast" app; most should be 100-200ms.
32. Ensure every interactive element (buttons, cards, list rows) has a pressed/active state, not just hover (hover doesn't exist on mobile touch).
33. Add a subtle scale-down (e.g. `transform: scale(0.97)`) on button `:active` across `Button.jsx` so taps feel physically acknowledged.
34. Check `pageIn` keyframe transition between routes — does it feel consistent in both directions (forward nav vs. back button), or does back navigation look wrong reversed?
35. Confetti (`confetti.js`) currently fires on decisions — audit whether it should also fire on volunteer's first contact logged, hub leader's first approval, or milestone counts (10th, 50th, 100th contact) for delight without overuse.
36. Make sure confetti/celebratory moments respect `prefers-reduced-motion` and skip/simplify for users who've set that OS preference.
37. Toasts (`toast.js`) — do success and error toasts use distinct enter/exit motion (not identical slide), so tone is legible even before reading text?
38. Check toast stacking behavior: if two fire in quick succession (e.g. offline sync + save), do they stack cleanly or overlap/flicker?
39. List rows (contacts, volunteers) — add a subtle stagger-fade-in on first render of a list, capped at ~5 items, so long lists don't feel like they're all animating individually and slowing perceived load.
40. Swipe gestures: does `ContactsList.jsx` / `CallQueue.jsx` support swipe-to-call or swipe-to-mark-status (common pattern for triage lists), or is everything tap-only?
41. Pull-to-refresh on mobile list views — present or missing? If missing, it's one of the highest-expectation mobile gestures.
42. Check the theme toggle (`ThemeToggle.jsx`) — does light/dark switch animate the color transition smoothly (the `0.2s ease` in global.css line ~187) across ALL elements, or do some components snap instantly while others transition, looking broken?
43. Modal open/close (`slideUp`/`fadeIn` keyframes) — does the backdrop fade in sync with the modal content, or does one lag?
44. Any drag-to-reorder anywhere (templates, tags)? If so, is there haptic-style visual feedback (lift shadow, scale) during drag?
45. Number changes (dashboard stat counters in `MinisterDashboard.jsx`/`HubDashboard.jsx`) — do they count up/tween when they update, or snap instantly? A tween makes updates feel alive rather than reload-triggered.

## 5. Feedback, Empty & Error States

46. `EmptyState` component exists — audit every list/table page to confirm it's actually used, not left as a blank `<div>` when data is empty (new hub with zero volunteers, new volunteer with zero contacts).
47. Empty state copy: is it encouraging + actionable ("Add your first contact" + button) rather than clinical ("No data")?
48. Check every `catch` block for API calls — does the user see a specific, human error ("Couldn't save — check your connection") or a raw stack trace / silent failure?
49. `ErrorBoundary.jsx` — does its fallback UI offer a "reload" or "go home" action, or does it dead-end the user?
50. Form validation errors — do they appear inline next to the specific field the instant it's invalid (on blur), or only on submit as a wall of errors?
51. Network-offline banner: does `useOfflineSync.js` surface a persistent but non-intrusive "you're offline, changes will sync" indicator, and does it clearly resolve (toast or checkmark) when back online?
52. When offline sync resolves, does the user see WHAT synced (e.g. "3 contacts synced"), or just a generic "synced" with no count?
53. Test the offline queue with a forced sync conflict (edit same contact on two devices) — what does the user see? Silent data loss is the worst-case here; even a basic "conflict, kept newest" toast is better than nothing.
54. Rate-limit / OTP-too-many-attempts errors — do they explain the wait time, or just say "error"?
55. 403/pending/rejected states (`PendingScreen.jsx`, `RejectedScreen.jsx`) — do they explain WHY and what happens next, or leave the user stuck with no path forward?
56. Duplicate contact detection (same phone number added twice) — does it warn before saving, or silently create a duplicate the volunteer discovers later?
57. Check every destructive action (delete contact, reject volunteer) uses `ConfirmDialog` consistently — none should use a raw `window.confirm()`.
58. Confirm dialogs — does the copy say what's actually being deleted by name ("Delete John Okafor?") rather than a generic "Are you sure?"

## 6. Touch, Layout & Mobile Ergonomics

59. Audit tap target sizes across all buttons/icons — anything under 44×44px (Apple HIG) or 48×48px (Material) should be padded up, even if the visible icon stays small.
60. Check spacing between adjacent tappable rows (contact list, volunteer list) — is there enough gap to prevent mis-taps on a moving bus/car (realistic usage context for a "logs contacts in the field" app)?
61. Bottom navigation / primary actions — are they within thumb reach on large phones (check against a 6.7" screen size, not just design-time desktop preview)?
62. Any critical action buried in a top-right corner menu that should be a bottom sheet or bottom-anchored button instead, given one-handed mobile use?
63. Verify `responsive.css` breakpoints actually get exercised — test at 320px (small Android), 375px (iPhone SE/mini), 428px (iPhone Pro Max), and a common tablet width (768px), not just desktop-then-shrink.
64. Check `AvatarCropper.jsx` on a touch device — does pinch-zoom/drag work naturally, or was it built mouse-first?
65. Long ministry names / long contact names — do they truncate gracefully with ellipsis, or break card layouts?
66. Landscape orientation — does the app lock portrait, or does rotating mid-form (common if phone drops in a pocket) break the layout?
67. Check safe-area insets on iOS (notch/home-indicator) — does bottom nav or a fixed footer sit under the home-indicator gesture bar?
68. Sticky headers on scroll (contact list, call queue) — do they stay pinned smoothly, or jitter/flicker during scroll on lower-end Android devices?
69. Form inputs near the bottom of the screen — when the mobile keyboard opens, does the input scroll into view above the keyboard, or get hidden behind it?
70. Test with a real slow Android device or CPU throttling in devtools (4x slowdown) — most polish work gets designed on fast dev machines and silently degrades on the hardware volunteers actually carry.

## 7. Visual System & Consistency

71. Audit `global.css` CSS custom properties (`--text-1/2/3`, `--border`, spacing scale) for actual consistent usage — grep for hardcoded hex colors or px values that should be tokens instead.
72. Check color contrast of `--text-3` (typically the lightest gray) against backgrounds in both light and dark theme — muted text is the most common WCAG AA failure.
73. Icon set (`Icon.jsx`) — confirm consistent stroke width and corner radius across all icons; mixed icon styles (some rounded, some sharp) read as sloppy even when users can't articulate why.
74. Button hierarchy — is it visually obvious across every screen which action is primary vs. secondary vs. destructive, using consistent classes (`btn-primary`/`btn-outline`/`btn-danger`), not one-off inline styles?
75. Card shadows/borders — audit for consistent elevation language; mixing heavy shadows on some cards and flat borders on others looks accidental.
76. Border radius — confirm one consistent scale (e.g. 8/12/16px) is used everywhere rather than ad hoc rounding per component.
77. Check dark mode specifically for: pure-black backgrounds (should usually be dark gray, not #000), inverted images/logos that don't have dark variants, and any hardcoded light-only colors that were missed.
78. Typography scale — count how many distinct font sizes are in use across the app; anything beyond ~6-7 sizes usually indicates drift and should be consolidated.
79. Status badges (`StatusBadge`, `DecisionBadge`) — do colors follow an intuitive convention (green=good, amber=pending, red=attention) consistently across volunteer, hub, and minister views?
80. Run the app through a colorblindness simulator (deuteranopia especially) — status badges/charts that rely purely on red/green will be unreadable to ~8% of men.

## 8. Performance Perception

81. Check bundle size with `npm run build` + analyze — flag any single dependency over ~50KB gzipped that could be lazy-loaded or swapped.
82. Confirm route-level code splitting (already partial via `lazy()` in `App.jsx`) covers ALL role layouts, not just some — each role should only download its own bundle.
83. Images (avatars especially) — are they served/resized appropriately, or is a full-resolution upload being rendered at 40×40px in a list?
84. Add `loading="lazy"` to any below-the-fold images.
85. Debounce search/filter inputs (contact search, volunteer search) so every keystroke isn't triggering a re-render or API call.
86. Virtualize long lists (contact lists with hundreds of entries) if not already — check `ContactsList.jsx` for a naive `.map()` over an unbounded array.
87. Check for layout shift (CLS) caused by web fonts loading late — use `font-display: swap` and verify no visible "flash of unstyled text" jump.
88. Cache (`lib/cache.js`) — confirm dashboard stats/charts use cached data for instant paint on revisit, then silently refresh in background, rather than blank-then-load every navigation.
89. Test app-switch behavior on mobile (backgrounding then returning after 10+ minutes) — does state survive gracefully, or does the user land on a stale/broken screen requiring manual refresh?
90. Prefetch the likely next screen (e.g. from `VolunteerHome.jsx`, prefetch `AddContact.jsx` chunk) so the most common next tap has zero load delay.

## 9. Accessibility (often skipped, cheap to fix now)

91. Every icon-only button (close, delete, menu) needs an `aria-label` — grep for `<button>` elements with no visible text and check each has one.
92. Confirm focus outlines aren't globally suppressed (`outline: none` with no replacement) — keyboard/switch-control users need a visible focus ring.
93. Form inputs need associated `<label>` elements (via `Label.jsx`), not just placeholder text as the only label (placeholders disappear on input, screen readers may skip them).
94. Modal/dialog focus trapping — when `Modal.jsx`/`ConfirmDialog` opens, does keyboard focus move into it and return to the trigger element on close?
95. Toast notifications — are they announced to screen readers (`aria-live="polite"` region), or purely visual?
96. Check minimum text size — nothing critical should render below 12px, and body text should generally be 14px+ on mobile.

## 10. Trust, Security & "This Feels Solid" Cues

97. Show a subtle "saved" / last-synced timestamp somewhere persistent (e.g. call queue, contact form) so users always know their data state without wondering.
98. Session expiry — when a JWT/refresh token expires mid-use, does the user get redirected to login with context ("Session expired, please log in again") and land back where they were after, or lose their place entirely?
99. Exports (`MinisterExports.jsx`) — show a clear "generating..." → "ready, download" two-step state for anything non-instant, with a toast/notification if they navigate away and it finishes later.
100. Do a full end-to-end "new volunteer's first 5 minutes" run-through — signup → OTP → pending → approved → first contact logged — timing it and noting every point of hesitation, confusion, or dead air; fix the worst 3 friction points first regardless of what else is on this list.

---

### How to use this with your agent
Don't hand all 100 at once. Suggested batching for a terminal agent session:
- **Session 1:** Section 2 (the core loop) — this is your highest-leverage 30-second promise.
- **Session 2:** Sections 3 + 4 (loading + motion) — biggest "feels expensive" wins per hour spent.
- **Session 3:** Sections 5 + 6 (error states + mobile ergonomics) — biggest "feels broken" risk reduction.
- **Session 4:** Sections 1 + 7 + 10 (first impressions + visual consistency + trust cues).
- **Session 5:** Sections 8 + 9 (performance + accessibility) — do last since they're cross-cutting and benefit from a stable UI to test against.

Ask the agent to log a before/after note per item, not just apply changes silently — you'll want a diff-reviewable trail given how many small touches this is.
