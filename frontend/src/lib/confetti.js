/**
 * REACH — Gold confetti burst (CSS-only, no library)
 */
export function confettiBurst(originEl) {
  const colors = ['var(--gold)', 'var(--amber)', '#E8C46A', '#C9A84C', '#F0D080'];
  const rect = originEl
    ? originEl.getBoundingClientRect()
    : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top  + rect.height / 2;

  for (let i = 0; i < 18; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-particle';
    el.style.cssText = `
      left: ${cx + (Math.random() - 0.5) * 80}px;
      top:  ${cy + (Math.random() - 0.5) * 40}px;
      width: ${4 + Math.random() * 6}px;
      height: ${4 + Math.random() * 6}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration: ${0.8 + Math.random() * 0.5}s;
      animation-delay: ${Math.random() * 0.15}s;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
}
