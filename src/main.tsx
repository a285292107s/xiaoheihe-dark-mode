import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { exposeEngineHooks, initDarkMode, whenDocumentElementReady } from './dark-mode';

const uiCss = `
:host { all: initial; }
#heybox-dark-toggle {
  position: fixed;
  right: 16px;
  bottom: 24px;
  z-index: 2147483646;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #14191e;
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
  transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  pointer-events: auto;
  -webkit-tap-highlight-color: transparent;
}
#heybox-dark-toggle:hover { transform: scale(1.06); }
#heybox-dark-toggle:active { transform: scale(0.96); }
#heybox-dark-toggle svg { width: 20px; height: 20px; display: block; }
`;

/**
 * 切换按钮挂在 Shadow DOM 里，与站点样式彻底隔离，
 * 并打上 data-hb-own 让深色引擎跳过它（否则按钮自身也会被重映射）。
 */
function mount(): void {
  if (document.getElementById('heybox-dark-mode-root')) return;

  const host = document.createElement('div');
  host.id = 'heybox-dark-mode-root';
  host.setAttribute('data-hb-own', '');
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = uiCss;
  shadow.appendChild(style);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

whenDocumentElementReady(() => {
  // 先起深色（类名 + 基础层尽早落到 <html>，避免首屏白闪），再挂 UI
  initDarkMode();
  exposeEngineHooks();
  mount();
});
