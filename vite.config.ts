import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

/** 已发布的产物地址：@updateURL 与 @downloadURL 必须是同一个稳定 raw 链接 */
const RAW_BASE = 'https://raw.githubusercontent.com/a285292107s/xiaoheihe-dark-mode/main/dist';
const ARTIFACT_URL = `${RAW_BASE}/xiaoheihe-dark-mode.user.js`;

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: '小黑盒深色模式',
        namespace: 'xiaoheihe-dark-mode',
        version: '0.3.6',
        license: 'MIT',
        description:
          '为小黑盒网页版（xiaoheihe.cn）提供深色模式：按角色重映射站点 CSS 规则，覆盖伪元素与交互态，可一键切换并记住偏好。',
        author: '油猴脚本-小黑盒页面优化',
        icon: 'https://cdn.max-c.com/heybox/logo/app_251.png',
        homepageURL: 'https://github.com/a285292107s/xiaoheihe-dark-mode',
        // 装一次之后由管理器自动检查更新；改这两项等于改发布地址
        updateURL: ARTIFACT_URL,
        downloadURL: ARTIFACT_URL,
        match: ['https://www.xiaoheihe.cn/*', 'https://xiaoheihe.cn/*'],
        'run-at': 'document-start',
      },
      build: {
        fileName: 'xiaoheihe-dark-mode.user.js',
      },
    }),
  ],
});
