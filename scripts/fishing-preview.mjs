import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Isolated renderer preview: no Electron bridge or real save files are used.
const client = `
import '/src/style.css';
import { mountFishingPage } from '/src/fishingPage.ts';
import { navigateToPage } from '/src/appNavigation.ts';
import { createDefaultGameState, toGameViewState } from '/electron/game/gameEngine.ts';
import { createFishingSessionManager } from '/electron/fishing/fishingSession.ts';
const game = createDefaultGameState(Date.now());
game.wallet.coins = 17531; game.inventory.baits.basic = 12; game.inventory.baits.premium = 7;
game.fishing.discoveredFish = ['crucian', 'carp', 'grassCarp'];
const sessions = createFishingSessionManager({now:Date.now,randomUUID:()=>crypto.randomUUID()});
window.electronAPI = {
 fishingGetState: async()=>toGameViewState(game),
 fishingCast: async(bait)=>({ok:true,state:toGameViewState(game),session:sessions.start(1,bait)}),
 fishingReel: async(token)=> { const outcome=sessions.reel(1,token); return ['continue','caught'].includes(outcome.status) ? {ok:true,...outcome,fight:outcome,state:toGameViewState(game)} : {ok:false,...outcome,message:'鱼线断了',state:toGameViewState(game)}; },
 fishingCancel: async(token)=>sessions.cancel(1,token)
};
navigateToPage('fishing-page'); mountFishingPage();
`;
const root = fileURLToPath(new URL('..', import.meta.url));
const document = (script, style = '') => `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>鱼塘预览</title><style>${style}</style></head><body style="margin:0;padding:24px"><section class="tool-page tool-page--fishing" id="fishing-page"><header><div><p class="eyebrow">桌宠玩法</p><h1>鱼塘</h1></div></header><div class="panel" id="fishing-root"></div></section><script type="module">${script}</script></body></html>`;
if (process.argv.includes('--static')) {
 const assets = {};
 const encode = (relative) => {
  if (!assets[relative]) assets[relative] = `data:image/${relative.endsWith('.svg') ? 'svg+xml' : 'png'};base64,${readFileSync(path.join(root,'public',relative)).toString('base64')}`;
 };
 for (const name of ['pond-bg.svg','bobber.svg','bait-basic.svg','bait-premium.svg']) encode('/fishing/'+name);
 const catalog = JSON.parse(readFileSync(path.join(root,'electron/fishing/fishCatalog.json'),'utf8'));
 for (const fish of Object.values(catalog.fish)) encode(fish.image.startsWith('/') ? fish.image : '/fishing/'+fish.image);
 const result = await build({stdin:{contents:client,resolveDir:root,loader:'ts'},bundle:true,write:false,format:'iife',minify:true,plugins:[{
  name:'offline-preview',setup(b){
   b.onResolve({filter:/^\/(src|electron)\//},args=>({path:path.join(root,args.path)}));
   b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
   b.onLoad({filter:/fishingAssets\.ts$/},args=>({contents:readFileSync(args.path,'utf8') + `\nconst embedded = ${JSON.stringify(assets)};FISHING_ASSETS.pond=embedded[FISHING_ASSETS.pond];FISHING_ASSETS.bobber=embedded[FISHING_ASSETS.bobber];`,loader:'ts'}));
  }
 }]});
 const assetObserver = `const assets=${JSON.stringify(assets)};new MutationObserver(()=>{for(const img of document.images){const src=img.getAttribute('src');if(assets[src])img.src=assets[src];}}).observe(document.body,{childList:true,subtree:true});`;
 const output = path.join(root, 'fishing-preview.html');
 writeFileSync(output,document(result.outputFiles[0].text + assetObserver,readFileSync(path.join(root,'src/style.css'),'utf8')));
 console.log(output);
} else {
const server = await createServer({
 root,
 configFile:false, server:{host:'127.0.0.1',port:5175},
 plugins:[{name:'pond-preview',configureServer(server){server.middlewares.use((req,res,next)=>{
  if(req.url !== '/__fishing-preview') return next();
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(document(client));
 });}}]
});
await server.listen();
console.log('Pond preview: '+server.resolvedUrls.local[0]+'__fishing-preview');
}
