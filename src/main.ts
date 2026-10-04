import { exposeEngineHooks, initDarkMode, whenDocumentElementReady } from './dark-mode';
import { exposeDeclutterHooks, initDeclutter } from './declutter';
import { exposeCopyHooks, initCopy } from './copy';
import { exposeReplyBtnHooks, initReplyBtn } from './reply-btn';
import { attachApiCache, exposeApiCacheHooks } from './comment-api-cache';
import { exposeCommentCardsHooks, initCommentCards } from './comment-cards';
import { mountControls } from './ui';

attachApiCache();

whenDocumentElementReady(() => {
  initDarkMode();
  initDeclutter();
  initCopy();
  initReplyBtn();
  initCommentCards();
  exposeEngineHooks();
  exposeDeclutterHooks();
  exposeCopyHooks();
  exposeReplyBtnHooks();
  exposeCommentCardsHooks();
  exposeApiCacheHooks();
  mountControls();
});
