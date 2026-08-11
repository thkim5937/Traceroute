import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/Traceroute/',
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        devDemo: fileURLToPath(new URL('./dev-demo.html', import.meta.url)),
      },
    },
  },
});
