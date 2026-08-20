import path from 'node:path'
import fs from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import electron from 'vite-plugin-electron/simple'
import { PET_CHARACTERS_URL, scanPetCharacters } from './electron/petCharacters'

// 原生模块和自带 WASM/可执行文件的依赖必须保持外部引用。
const nativeExternals = ['sharp', '7zip-bin', 'node-unrar-js']

function petCharactersPlugin(): Plugin {
  const root = path.resolve(__dirname, 'donghua')
  const prefix = `${PET_CHARACTERS_URL}/`

  const sendFile = (rel: string, res: { setHeader: (k: string, v: string) => void; statusCode: number; end: (body?: string) => void }, next: () => void) => {
    if (rel === 'catalog.json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(scanPetCharacters(root)))
      return
    }
    const file = path.resolve(root, rel)
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      next()
      return
    }
    const ext = path.extname(file)
    const types: Record<string, string> = {
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.atlas': 'text/plain; charset=utf-8',
      '.skel': 'application/octet-stream',
      '.json': 'application/octet-stream',
    }
    res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream')
    fs.createReadStream(file).pipe(res as NodeJS.WritableStream)
  }

  return {
    name: 'pet-characters',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (!url?.startsWith(prefix)) return next()
        sendFile(decodeURIComponent(url.slice(prefix.length)), res, next)
      })
    },
    closeBundle() {
      const dest = path.resolve(__dirname, 'dist/pet/characters')
      fs.mkdirSync(dest, { recursive: true })
      if (fs.existsSync(root)) fs.cpSync(root, dest, { recursive: true })
      fs.writeFileSync(path.join(dest, 'catalog.json'), JSON.stringify(scanPetCharacters(root), null, 2))
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      url: path.resolve(__dirname, 'src/shims/node-url.ts'),
    },
  },
  optimizeDeps: {
    include: ['pixi.js', 'pixi-spine'],
  },
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        pet: path.resolve(__dirname, 'pet.html'),
      },
    },
  },
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
    petCharactersPlugin(),
    {
      name: 'browser-url-shim',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'url' || id.includes('.vite-electron-renderer/url')) {
          return path.resolve(__dirname, 'src/shims/node-url.ts')
        }
      },
    },
  ],
})
