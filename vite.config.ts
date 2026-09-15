import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    react(),
    monkey({
      entry: 'src/main.tsx',
      userscript: {
        name: '小黑盒深色模式',
        namespace: 'xiaoheihe-dark-mode',
        version: '0.2.0',
        description:
          '为小黑盒网页版（xiaoheihe.cn）提供深色模式：按角色重映射站点 CSS 规则，覆盖伪元素与交互态，可一键切换并记住偏好。',
        author: '油猴脚本-小黑盒页面优化',
        icon: 'https://cdn.max-c.com/heybox/logo/app_251.png',
        match: ['https://www.xiaoheihe.cn/*', 'https://xiaoheihe.cn/*'],
        'run-at': 'document-start',
      },
      build: {
        fileName: 'xiaoheihe-dark-mode.user.js',
      },
    }),
  ],
});
