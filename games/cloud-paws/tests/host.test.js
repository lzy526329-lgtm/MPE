import test from 'node:test';
import assert from 'node:assert/strict';
import {mountHostVisibility} from '../src/host.js';
function fixture(){
 const parent={};const host=new EventTarget();host.parent=parent;host.location={origin:'null'};
 const page=new EventTarget();page.hidden=false;const events=[];
 const visibility=mountHostVisibility({host,page,onHide:()=>events.push('pause'),onShow:()=>events.push('wake')});
 const message=(visible,source=parent)=>{const event=new Event('message');Object.assign(event,{source,origin:'null',data:{type:'cloud-paws:visibility',visible}});host.dispatchEvent(event)};
 return {host,page,events,visibility,message};
}
test('leaving the app page suspends gameplay; returning keeps the run paused until resumed',()=>{
 const f=fixture();f.message(false);assert.equal(f.visibility.isVisible(),false);assert.deepEqual(f.events,['pause']);
 f.message(true);assert.equal(f.visibility.isVisible(),true);assert.deepEqual(f.events,['pause','wake']);f.visibility.dispose();
});
test('unrelated frames cannot change the game visibility',()=>{
 const f=fixture();f.message(false,{});assert.equal(f.visibility.isVisible(),true);assert.deepEqual(f.events,[]);f.visibility.dispose();
});
test('switching browser visibility does not restart a game hidden by app navigation',()=>{
 const f=fixture();f.message(false);f.page.hidden=true;f.page.dispatchEvent(new Event('visibilitychange'));
 f.page.hidden=false;f.page.dispatchEvent(new Event('visibilitychange'));assert.equal(f.visibility.isVisible(),false);assert.deepEqual(f.events,['pause']);
 f.message(true);assert.deepEqual(f.events,['pause','wake']);f.visibility.dispose();
});
