import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { createCloudPawsRooms } from '../server/rooms.js';
const members = Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1), name: `玩家${i + 1}`, animal: i % 2 ? 'bunny' : 'fox' }));

test('five distinct players share one physical world and push each other without respawning', async () => {
 const g = await createGame({ members });
 try {
  g.start(); const [a,b] = [...g.players.values()], p = g.platforms[0];
  a.body.setTranslation({x:p.x-.5,y:.65,z:p.z},true);b.body.setTranslation({x:p.x+.5,y:.65,z:p.z},true);
  for(let i=0;i<25;i++)g.stepPlayers(new Map([[a.id,{x:1,z:0}]]));
  assert.ok(b.body.translation().x > p.x+.6, 'moving into another player pushes them');
  assert.ok(Math.hypot(a.body.translation().x-b.body.translation().x,a.body.translation().z-b.body.translation().z) > .5, 'players cannot pass through each other');
  assert.equal(a.falls,0);assert.equal(b.falls,0);
  assert.equal(g.players.size,5);assert.equal(g.snapshot().players.length,5);
 }finally{g.world.free();}
});
test('checkpoints and falls belong to each player; finishes have a shared order',async()=>{
 const g=await createGame({members:members.slice(0,2)});
 try{
  g.start();const [a,b]=[...g.players.values()],flag=g.platforms[12],top=g.platforms.at(-1);
  a.body.setTranslation({x:flag.x,y:flag.y+.65,z:flag.z},true);
  for(let i=0;i<60;i++)g.stepPlayers();
  assert.equal(a.checkpoint,12);assert.equal(b.checkpoint,0);
  a.body.setTranslation({x:90,y:-30,z:90},true);g.stepPlayers();assert.equal(a.falls,1);assert.equal(b.falls,0);
  b.body.setTranslation({x:top.x,y:top.y+.65,z:top.z},true);
  for(let i=0;i<30;i++)g.stepPlayers();
  assert.equal(b.rank,1);assert.equal(a.won,false);
  a.body.setTranslation({x:top.x,y:top.y+.65,z:top.z},true);
  for(let i=0;i<30;i++)g.stepPlayers();
  assert.equal(a.rank,2);assert.ok(a.finishedAt>b.finishedAt);
  assert.deepEqual(g.finishOrder,[b.id,a.id]);
  assert.ok(!('collected' in g));
 }finally{g.world.free();}
});
function harness(){let now=0;const events=[];const service=createCloudPawsRooms({sendToUser:(id,e)=>events.push({id:String(id),...e}),clock:()=>now});
 return {service,events,advance:ms=>now+=ms,send:(id,action,fields={})=>service.handle(id,{type:`cloud_paws.${action}`,protocol:1,...fields}),room:()=>events.find(e=>e.room)?.room.code};}
test('five-person capacity, member isolation and readiness are enforced by the service',async()=>{
 const h=harness();try{
  await h.send(1,'create');const code=h.room();
  await Promise.all([2,3,4,5,6].map(id=>h.send(id,'join',{code})));
  assert.equal(h.service.inspect(code).members.length,5);
  assert.ok(h.events.some(e=>e.id==='6'&&e.type==='cloud_paws.error'));
  await h.send(6,'start');assert.equal(h.service.inspect(code).state,'waiting');
  await h.send(1,'start');assert.equal(h.service.inspect(code).state,'waiting');
  for(let id=1;id<=5;id++)await h.send(id,'ready',{ready:true});
  await h.send(2,'start');assert.equal(h.service.inspect(code).state,'waiting');
  await h.send(1,'start');assert.equal(h.service.inspect(code).state,'countdown');
  for(let i=0;i<181;i++){h.advance(1000/60);h.service.tick();}
  assert.equal(h.service.inspect(code).state,'playing');
  const before=h.service.inspect(code).snapshot.players[0].position;
  await h.send(1,'input',{seq:1,input:{x:1,z:0,jump:false,sprint:false}});
  for(let i=0;i<10;i++){h.advance(1000/60);h.service.tick();}
  assert.ok(h.service.inspect(code).snapshot.players[0].position.x>before.x);
  const outsider=h.events.filter(e=>e.id==='6');assert.ok(!outsider.some(e=>e.room?.code===code));
 }finally{h.service.dispose();}
});
test('disconnect/recovery preserves membership, then expiry transfers host and clears rooms',async()=>{
 const h=harness();try{
  await h.send(1,'create');const code=h.room();await h.send(2,'join',{code});
  h.service.disconnect(1);assert.equal(h.service.inspect(code).members[0].connected,false);
  await h.send(1,'recover');assert.equal(h.service.inspect(code).members[0].connected,true);
  h.service.disconnect(1);h.advance(20001);h.service.tick();
  assert.equal(h.service.inspect(code).hostId,'2');assert.equal(h.service.inspect(code).members.length,1);
  await h.send(2,'leave');assert.equal(h.service.inspect(code),null);
 }finally{h.service.dispose();}
});
test('malformed, forged-position and stale inputs cannot teleport players',async()=>{
 const h=harness();try{
  await h.send(1,'create');const code=h.room();const before=h.service.inspect(code).snapshot.players[0].position;
  await h.send(1,'input',{seq:1,input:{x:Infinity,z:0,jump:false,sprint:false}});
  assert.ok(h.events.at(-1).type==='cloud_paws.error');
  await h.send(1,'input',{seq:2,input:{x:0,z:0,jump:false,sprint:false},position:{x:99,y:999,z:99}});
  assert.deepEqual(h.service.inspect(code).snapshot.players[0].position,before);
  await h.send(1,'create');assert.equal(h.service.inspect(code).members.length,1);
 }finally{h.service.dispose();}
});
