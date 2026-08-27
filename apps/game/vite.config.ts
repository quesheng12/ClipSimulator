import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 剧情文件位于仓库根目录，在 Vite 项目根之外，默认不会被监听。
// 显式加入 watcher，保存内容包后游戏端才会热更新，否则会一直吃到旧转换缓存。
const storyContentPath = fileURLToPath(new URL('../../content/test-story.json', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'watch-story-content',
      configureServer(server) {
        server.watcher.add(storyContentPath);
      },
    },
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
