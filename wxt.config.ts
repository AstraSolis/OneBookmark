import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OneBookmark',
    description: '跨浏览器书签同步插件',
    permissions: ['bookmarks', 'storage'],
    browser_specific_settings: {
      gecko: {
        id: '{8a7c3e2d-4f1b-4a9c-b5e6-7d8f9a0b1c2e}',
        strict_min_version: '142.0',
        data_collection_permissions: {
          required: ['none'],
        },
      } as any,
    },
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      64: '/icon/64.png',
      96: '/icon/96.png',
      128: '/icon/128.png',
      256: '/icon/256.png',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
  }),
});
