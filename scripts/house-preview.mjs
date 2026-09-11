import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'

// Separate preview storage: never reads or writes the Electron player's save.
const client = `
import '/src/style.css';
import { mountPetHomePage } from '/src/petHomePage.ts';
import { createDefaultGameState, toGameViewState } from '/electron/game/gameEngine.ts';
import { placeHouseDecor, removeHouseDecor, saveHouseDecors } from '/electron/house/houseEngine.ts';
let game = JSON.parse(localStorage.getItem('house-art-preview') || 'null') || createDefaultGameState(Date.now());
for (const id of ['stool', 'bench', 'carpet', 'flowerpot', 'flowers', 'sign', 'light']) {
  if (!(id in (JSON.parse(localStorage.getItem('house-art-preview') || 'null')?.inventory.furniture || {}))) game.inventory.furniture[id] = 3;
}
const mutate = (fn) => {
  const outcome = fn(game, toGameViewState(game));
  if (outcome.ok) { game = outcome.game; localStorage.setItem('house-art-preview', JSON.stringify(game)); }
  return { ...outcome, state: toGameViewState(game) };
};
window.electronAPI = {
  houseGetState: async () => toGameViewState(game),
  housePlaceDecor: async (r) => mutate((s, v) => placeHouseDecor(s, r.decorId, r.surface, v)),
  houseRemoveDecor: async (r) => mutate((s, v) => removeHouseDecor(s, r.instanceId, v)),
  houseSaveDecors: async (items) => mutate((s, v) => saveHouseDecors(s, items, v)),
};
mountPetHomePage();
`;
const document = (script, css = '') => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>个人小屋预览</title><style>${css}\nbody { margin:0; padding:24px; background:#f3f6f3; } .tool-page--home { max-width:1200px; margin:auto; } @media(max-width:600px) { body { padding:12px; } }</style></head><body><section class="tool-page tool-page--home" id="pet-home-page"><header><div><p class="eyebrow">MY PET</p><h1>个人小屋</h1></div></header><div class="panel home-panel" id="pet-home-root"></div></section><script type="module">${script}</script></body></html>`;
const root = fileURLToPath(new URL('..', import.meta.url));
if (process.argv.includes('--static')) {
  const catalog = JSON.parse(readFileSync(path.join(root, 'electron/game/decorCatalog.json'), 'utf8'));
  const images = {};
  for (const src of ['house/room.png', ...Object.values(catalog.decors).map((item) => 'farm/' + item.src)]) {
    const key = './' + src.split('/').map(encodeURIComponent).join('/');
    images[key] = 'data:image/png;base64,' + readFileSync(path.join(root, 'public', src)).toString('base64');
  }
  const bundled = await build({ stdin: { contents: client, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'iife', plugins: [{ name: 'offline', setup(b) {
    b.onResolve({ filter: /^\/(src|electron)\// }, (args) => ({ path: path.join(root, args.path) }));
    b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
  } }] });
  const embed = `const images=${JSON.stringify(images)};new MutationObserver(()=>{for(const img of document.images){const src=img.getAttribute('src');if(images[src])img.src=images[src];}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});`;
  const output = path.join(root, 'house-preview.html');
  writeFileSync(output, document(embed + bundled.outputFiles[0].text, readFileSync(path.join(root, 'src/style.css'), 'utf8')));
  console.log(output);
} else {
const server = await createServer({
  root,
  configFile: false,
  server: { host: '127.0.0.1', port: 5176 },
  plugins: [{ name: 'house-preview', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url !== '/__house-preview') return next();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(document(client));
    });
  } }],
});
await server.listen();
console.log(server.resolvedUrls.local[0] + '__house-preview');
}
