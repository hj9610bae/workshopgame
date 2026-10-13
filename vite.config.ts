import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // GitHub Pages 는 https://<user>.github.io/<repo>/ 하위 경로로 배포되므로 상대 경로 사용
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        board: resolve(import.meta.dirname, 'board.html'),
        host: resolve(import.meta.dirname, 'host.html'),
        play: resolve(import.meta.dirname, 'play.html'),
      },
    },
  },
});
