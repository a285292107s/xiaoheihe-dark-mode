import { exposeEngineHooks, initDarkMode, whenDocumentElementReady } from './dark-mode';
import { mountToggle } from './ui';

whenDocumentElementReady(() => {
  // 先起深色（类名 + 基础层尽早落到 <html>，避免首屏白闪），再挂 UI
  initDarkMode();
  exposeEngineHooks();
  mountToggle();
});
