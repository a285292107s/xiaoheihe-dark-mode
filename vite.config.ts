import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

const RAW_BASE = 'https://raw.githubusercontent.com/a285292107s/xiaoheihe-dark-mode/main/dist';
const ARTIFACT_URL = `${RAW_BASE}/xiaoheihe-dark-mode.user.js`;

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: '小黑盒深色模式',
        namespace: 'xiaoheihe-dark-mode',
        version: '0.7.0',
        license: 'MIT',
        description:
          '为小黑盒网页版（xiaoheihe.cn）提供深色模式、页面精简、复制解锁、一级评论免打扰与楼中楼卡片化：按角色重映射站点 CSS 规则（含伪元素与交互态），可隐藏顶部「首页」入口与社区页右侧栏，可在站点回复编辑器夺焦毁掉选区、剪贴板数据被清空时把选中内容救回剪贴板，可把一级评论「回复此楼」的触发从「点整行」改成行内一个「回复」按钮 —— 点正文只选中、不弹框；楼中楼每条回复则排成卡片（第一行头像/用户名/回复对象/时间，第二行起正文），回复入口是卡片末尾的纸飞机图标，点它即展开站点回复框并引用这一条。深色、精简、免打扰、卡片化四项各自记忆偏好、可随时切换；复制解锁常驻开启，没有开关按钮。',
        author: '油猴脚本-小黑盒页面优化',
        icon: 'https://cdn.max-c.com/heybox/logo/app_251.png',
        homepageURL: 'https://github.com/a285292107s/xiaoheihe-dark-mode',
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
