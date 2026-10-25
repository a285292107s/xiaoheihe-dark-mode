import { ensureOwnStyle, removeOwnStyle } from './own-style';
import { isCommentCardsEnabled, onCommentCardsChange } from './comment-cards';
import { isReplyBtnEnabled, onReplyBtnChange } from './reply-btn';
import controlsCss from './controls.css?inline';
import rowDockCss from './row-dock.css?inline';
import tokensCss from './tokens.css?inline';

const TOKEN_STYLE_ID = 'hb-ui-tokens';
const FEATURE_STYLE_ID = 'hb-ui-feature';

function featureSheetsNeeded(): boolean {
  return isCommentCardsEnabled() || isReplyBtnEnabled();
}

function syncFeatureStyle(): void {
  if (featureSheetsNeeded()) ensureOwnStyle(FEATURE_STYLE_ID, `${rowDockCss}\n${controlsCss}`);
  else removeOwnStyle(FEATURE_STYLE_ID);
}

export function initSharedUi(): void {
  ensureOwnStyle(TOKEN_STYLE_ID, tokensCss);
  syncFeatureStyle();
  onCommentCardsChange(syncFeatureStyle);
  onReplyBtnChange(syncFeatureStyle);
}
