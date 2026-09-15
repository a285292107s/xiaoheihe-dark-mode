import { exposeEngineHooks, initDarkMode, whenDocumentElementReady } from './dark-mode';
import { exposeDeclutterHooks, initDeclutter } from './declutter';
import { mountControls } from './ui';

whenDocumentElementReady(() => {
  // 先起两层的状态（类名 + 样式尽早落到 <html>，避免首屏闪一下浅色/侧栏），再挂 UI
  initDarkMode();
  initDeclutter();
  exposeEngineHooks();
  exposeDeclutterHooks();
  mountControls();
});
