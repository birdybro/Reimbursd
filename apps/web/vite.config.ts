// SPDX-License-Identifier: GPL-3.0-only
import react from '@vitejs/plugin-react';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

const proxyTarget = process.env.REIMBURSD_WEB_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

if (!/^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(proxyTarget)) {
  throw new Error('The development API proxy target must be an explicit loopback HTTP URL.');
}

export default defineConfig(({ command }) => ({
  build: { sourcemap: false },
  plugins: [
    react(),
    {
      name: 'reimbursd-development-csp',
      transformIndexHtml(html) {
        return command === 'serve'
          ? html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
          : html;
      },
    },
  ],
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd())] },
    host: '127.0.0.1',
    port: 4173,
    proxy: {
      '/api': {
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        target: proxyTarget,
      },
    },
    strictPort: true,
  },
}));
