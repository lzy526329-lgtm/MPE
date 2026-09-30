import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL, samplePlatform, platformLocalPoint, platformWorldPoint } from '../src/level.js';
test('the route wraps around the mountain more than twice and offers distinct challenges',()=>{
 assert.ok(LEVEL.length>=50);
 let turn=0;
 for(let i=1;i<LEVEL.length;i++){
  const previous=LEVEL[i-1],current=LEVEL[i];
  let delta=Math.atan2(current.x,current.z)-Math.atan2(previous.x,previous.z);
  if(delta<-Math.PI)delta+=Math.PI*2;if(delta>Math.PI)delta-=Math.PI*2;turn+=delta;
  assert.ok(current.y>=previous.y);assert.ok(current.y-previous.y<1.6);
 }
 assert.ok(turn>Math.PI*4);assert.ok(LEVEL.filter(p=>p.checkpoint).length>=4);
 for(const type of ['bridge','rotating','moving','steps','spinner'])assert.ok(LEVEL.some(p=>p.kind===type),type);
});
test('oriented narrow bridges use the same local footprint as the physics body',()=>{
 const p={x:10,z:20,y:5,angle:Math.PI/2};
 const world=platformWorldPoint(p,{x:0,z:2});assert.ok(Math.abs(world.x-12)<1e-8);assert.ok(Math.abs(world.z-20)<1e-8);
 const local=platformLocalPoint(p,world);assert.ok(Math.abs(local.x)<1e-8);assert.ok(Math.abs(local.z-2)<1e-8);
});
test('platform motion is deterministic and rotating beams complete full turns',()=>{
 const moving=LEVEL.find(p=>p.kind==='moving');assert.deepEqual(samplePlatform(moving,0),{x:moving.x,z:moving.z,angle:moving.angle});
 assert.notDeepEqual(samplePlatform(moving,2),samplePlatform(moving,0));
 const rotating=LEVEL.find(p=>p.kind==='rotating');assert.ok(Math.abs(samplePlatform(rotating,20).angle-rotating.angle)>Math.PI*2);
});
