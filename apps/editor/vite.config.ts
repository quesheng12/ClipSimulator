import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 剧情文件位于仓库根目录，在 Vite 项目根之外，默认不会被监听。
// 编辑器保存内容包时也会改动它，加入 watcher 保证两端都能拿到最新转换。
const storyContentPath = fileURLToPath(new URL('../../content/test-story.json', import.meta.url));

export default defineConfig({
  publicDir: fileURLToPath(new URL('../game/public', import.meta.url)),
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
