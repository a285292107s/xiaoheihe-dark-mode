import { useCallback, useState } from 'react';
import { applyDark, isDarkEnabled } from './dark-mode';

const ICON_MOON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z" />
  </svg>
);

const ICON_SUN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export function App() {
  const [dark, setDark] = useState(() => isDarkEnabled());

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      applyDark(next);
      return next;
    });
  }, []);

  return (
    <button
      id="heybox-dark-toggle"
      type="button"
      title={dark ? '切换到浅色模式' : '切换到深色模式'}
      aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
      onClick={toggle}
    >
      {dark ? ICON_SUN : ICON_MOON}
    </button>
  );
}

export default App;
