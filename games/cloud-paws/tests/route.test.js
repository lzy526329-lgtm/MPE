import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/game.js';
import {containsPlatform, landingPoint} from '../src/level.js';
export async function crossEdge(id) {
 for (const phase of [0,1,2,3,4,5]) {
  const g=await createGame();g.start();
  for(let n=0;n<phase*60;n++)g.step();
  const p=g.platforms[id],q=g.platforms[id+1];
  const dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz);
  let launch={x:p.x,z:p.z};
  for(let d=.1;d<=1.6;d+=.1){const v={x:p.x+dx/len*d,z:p.z+dz/len*d};if(containsPlatform(p,v,-.25))launch=v;else break;}
  if(p.hazard){const a=g.time*1.3;launch={x:p.x+Math.sin(a)*1.2,z:p.z+Math.cos(a)*1.2};}
  g.body.setTranslation({...launch,y:p.y+.61},true);g.body.setLinvel({x:0,y:0,z:0},true);
  g.step();g.step();
  const initialFalls=g.falls;let ok=false;
  for(let n=0;n<100;n++){
   const pos=g.position,vel=g.body.linvel();
   const { x: tx, z: tz } = landingPoint(q);
   const vx=(tx-pos.x)*5-vel.x*.45,vz=(tz-pos.z)*5-vel.z*.45;
   const scale=Math.max(8,Math.hypot(vx,vz));
   g.step({x:vx/scale,z:vz/scale,jump:n===0,sprint:true});
   if(g.falls>initialFalls)break;
   if(g.lastPlatform===id+1){ok=true;break;}
   if(g.position.y<p.y-2)break;
  }
  g.world.free();if(ok)return phase;
 }
 return null;
}

// Place the player at each launch surface, then cross using ordinary movement and jump input.
// Moving obstacles may require waiting for a suitable phase; hazards remain enabled.
test('all 60 route transitions can be crossed with the live physics and hazards', async () => {
  for (let id = 0; id < 60; id++) {
    assert.notEqual(await crossEdge(id), null, `No traversable jump from ${id} to ${id + 1}`);
  }
});
