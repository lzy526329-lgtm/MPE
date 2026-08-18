import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'

// 原生模块和自带 WASM/可执行文件的依赖必须保持外部引用。
const nativeExternals = ['sharp', '7zip-bin', 'node-unrar-js']

export default defineConfig({
  plugins: [
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: { external: nativeExternals },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            rollupOptions: { external: nativeExternals },
          },
        },
      },
      renderer: {},
    }),
  ],
})
