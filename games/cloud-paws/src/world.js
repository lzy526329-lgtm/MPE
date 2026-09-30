import * as THREE from 'three';
import { CORE, SUMMIT, STAGES, containsPlatform, landingPoint } from './level.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
const palette={grass:0x8ba987,rock:0xe9cdb0,cream:0xfff4dd,coral:0xe8896d,dark:0x304e48,gold:0xffd375};
export function createWorld(canvas,game,orbit){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xc9dfd8);scene.fog=new THREE.Fog(0xc9dfd8,75,180);
 const camera=new THREE.PerspectiveCamera(48,1,0.1,250);const target=new THREE.Vector3();
 scene.add(new THREE.HemisphereLight(0xfff6e5,0x728c89,2.6));
 const sun=new THREE.DirectionalLight(0xffe5c3,3.3);sun.position.set(-15,32,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=24;sun.shadow.camera.bottom=-24;sun.shadow.camera.far=90;sun.shadow.bias=-0.001;sun.shadow.normalBias=0.04;scene.add(sun,sun.target);
 const mats=new Map();function mat(color){if(!mats.has(color))mats.set(color,new THREE.MeshStandardMaterial({color,roughness:0.92}));return mats.get(color)}
 const box=(w,h,d)=>new RoundedBoxGeometry(w,h,d,2,Math.min(0.12,h/3));
 function mesh(geo,color,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 function ball(parent,color,x,y,z,sx,sy=sx,sz=sx){const m=mesh(new THREE.SphereGeometry(1,12,8),color,parent,x,y,z);m.scale.set(sx,sy,sz);return m}
 function tree(parent,x,z,s=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);parent.add(g);mesh(new THREE.CylinderGeometry(.1,.15,1.25,6),0x997d60,g,0,.6,0);ball(g,0x6f927a,0,1.55,0,.72,.86,.65);ball(g,0x8eae8b,-.32,1.9,.08,.5,.64,.46);return g}
 function flower(parent,x,z,color){mesh(new THREE.CylinderGeometry(.025,.025,.3,4),0x698b73,parent,x,.16,z);ball(parent,color,x,.35,z,.11)}
 function flag(parent,x,z,color){mesh(new THREE.CylinderGeometry(.045,.045,2.3,8),0x685f4a,parent,x,1.15,z);const flag=mesh(box(.75,.48,.045),color,parent,x+.38,1.92,z);flag.rotation.z=-.08;ball(parent,palette.gold,x,2.34,z,.095)}
 const islands=[],stars=[],flagGroups=[];
 const shape=new THREE.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2;const r=i%2?.23:.48;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y)}shape.closePath();
 const starGeo=new THREE.ExtrudeGeometry(shape,{depth:.14,bevelEnabled:true,bevelThickness:.045,bevelSize:.045,bevelSegments:1,steps:1});starGeo.center();
 for(const p of game.platforms){
  const group=new THREE.Group();group.position.set(p.x,p.y,p.z);group.rotation.y=p.angle;scene.add(group);islands.push(group);
  const narrow=p.kind==='bridge'||p.rotating;
  const topColor=p.kind==='summit'?0xdcc894:p.checkpoint?0xa7c4a1:p.moving?0xe6b79e:p.rotating?0xbba3c4:STAGES[p.stage].color;
  mesh(box(p.w,.42,p.d),topColor,group,0,-.21,0);
  if(!narrow){
  mesh(new THREE.CylinderGeometry(Math.min(p.w,p.d)*.51,Math.min(p.w,p.d)*.3,1.7,5),palette.rock,group,0,-1.17,0).rotation.y=.32;
  mesh(new THREE.ConeGeometry(Math.min(p.w,p.d)*.3,2.2,5),0xb5a78a,group,0,-2.8,0).rotation.z=Math.PI;
  // Small perimeter stones provide depth without obstructing the landing area.
  for(let j=0;j<3;j++)ball(group,0xb9ba99,-p.w*.37+j*.2,-.5,p.d*.4,.22,.3,.2);
  }else {
   // Planks expose a thin, continuous walking surface with a distinct rotation hub.
   for(let z=-p.d/2+.3;z<p.d/2;z+=.45)mesh(box(p.w-.08,.025,.32),0xf1dcc0,group,0,.018,z);
   if(p.rotating){mesh(new THREE.CylinderGeometry(.3,.3,.6,10),palette.gold,group,0,-.26,0);mesh(new THREE.ConeGeometry(.5,2.5,5),0xb1a0b4,group,0,-1.8,0).rotation.z=Math.PI;}
  }
  if(p.id===0){tree(group,-2.7,-1.6,1.35);tree(group,2.8,-1.9,.95);flag(group,2.9,1.8,palette.coral);for(let j=0;j<9;j++)flower(group,-2.8+j*.21,1.8+(j%2)*.3,j%2?0xfff2cc:0xeb997e)}
  else if(p.checkpoint){tree(group,-p.w*.35,-p.d*.28,.9);flag(group,p.w*.32,-p.d*.25,palette.coral);const ring=mesh(new THREE.TorusGeometry(.75,.06,8,32),palette.cream,group,0,.035,0);ring.rotation.x=-Math.PI/2;flagGroups.push({id:p.id,ring})}
  else if(p.kind==='summit'){for(const x of [-1.6,1.6])mesh(box(.24,3,.3),palette.coral,group,x,1.5,-.6);mesh(box(3.45,.32,.3),palette.coral,group,0,3,-.6);for(let j=0;j<7;j++){mesh(box(.43,.45,.08),j%2?palette.cream:palette.dark,group,-1.3+j*.43,2.62,-.6)}tree(group,2.5,1,.9);flag(group,-2.4,1.2,palette.gold)}
  else if(!narrow) {if(p.id%6===0)tree(group,-p.w*.38,-p.d*.35,.48);flower(group,p.w*.36,p.d*.29,palette.cream);flower(group,p.w*.3,p.d*.35,palette.coral)}
  if(!narrow&&p.kind!=='summit'){
   const arrow=mesh(new THREE.ConeGeometry(.16,.38,3),palette.cream,group,0,.045,p.d*.3);arrow.rotation.x=Math.PI/2;
  }
  if(p.moving){for(const x of [-.6,0,.6]){const stripe=mesh(box(.28,.018,.5),palette.cream,group,x,.013,p.d*.32);stripe.rotation.y=.3}}
  if(p.star){const s=mesh(starGeo,palette.gold,scene,p.x,p.y+1.2,p.z);stars.push({id:p.id,mesh:s})}
 }
 // A faceted mountain gives the spiral a real center and makes every turn change the view.
 for(const [i,core] of CORE.entries()){
  mesh(new THREE.CylinderGeometry(core.radius*.9,core.radius,core.height,9),i%2?0x9dad9b:0xa5b4a4,scene,0,core.y,0);
  const ridge=mesh(new THREE.CylinderGeometry(core.radius*.99,core.radius*1.02,.34,9),0xc1c6ae,scene,0,core.y-core.height/2+.3,0);
  ridge.rotation.y=.12;
  for(let j=0;j<3;j++){const a=i*1.6+j*2.1;ball(scene,0x8da387,Math.sin(a)*(core.radius-.15),core.y+2,Math.cos(a)*(core.radius-.15),.9,.55,.8)}
 }
 mesh(new THREE.ConeGeometry(4.65,6,9),0xe4e3ce,scene,0,46,0);
 const nextMarker=new THREE.Group();scene.add(nextMarker);
 const nextRing=mesh(new THREE.TorusGeometry(.64,.065,8,30),palette.gold,nextMarker);nextRing.rotation.x=-Math.PI/2;
 const nextArrow=mesh(new THREE.ConeGeometry(.24,.48,4),palette.gold,nextMarker,0,2.25,0);nextArrow.rotation.z=Math.PI;
 const hazardMeshes=game.hazards.map(h=>{const g=new THREE.Group();scene.add(g);mesh(box(4,.3,.3),palette.coral,g);for(const x of [-1.5,-.5,.5,1.5])mesh(box(.16,.35,.35),palette.cream,g,x,0,0);ball(g,palette.gold,0,0,0,.25);return g});
 // Low-poly cloudbanks and distant mountains frame the climb.
 const clouds=[];for(let i=0;i<28;i++){const g=new THREE.Group();const a=i*2.39;g.position.set(Math.sin(a)*34,-9+i*2.3,Math.cos(a)*34);for(let j=0;j<3;j++){const b=ball(g,0xf5f1dd,(j-1)*2.4,Math.sin(j*2)*.4,0,2.7,1.1,1.65);b.castShadow=false;b.receiveShadow=false}scene.add(g);clouds.push(g)}
 for(let i=0;i<12;i++){const a=i*Math.PI/6;const m=mesh(new THREE.ConeGeometry(9+(i%3)*4,20+(i%4)*5,5),i%2?0xacc8bd:0xbed4c7,scene,Math.sin(a)*60,-23,Math.cos(a)*60);m.castShadow=false;m.receiveShadow=false}
 const player=new THREE.Group();scene.add(player);const animal=new THREE.Group();player.add(animal);let legs=[],tail,ears=[];
 function setAnimal(kind){
  while(animal.children.length){const c=animal.children[0];animal.remove(c);c.traverse(o=>{if(o.geometry)o.geometry.dispose()})}legs=[];ears=[];
  const bunny=kind==='bunny',fur=bunny?0xece8d9:0xe4a269;
  ball(animal,fur,0,.43,0,.39,.46,.3);ball(animal,palette.cream,0,.43,.255,.27,.31,.095);
  ball(animal,fur,0,.96,.015,.45,.38,.35);
  for(const x of [-.25,.25]){if(bunny){const e=ball(animal,fur,x,1.43,0,.13,.42,.115);ears.push(e);ball(animal,0xeab1a3,x,1.45,.098,.068,.29,.026)}else{const e=mesh(new THREE.ConeGeometry(.21,.43,3),fur,animal,x,1.34,0);e.rotation.y=Math.PI/2;ears.push(e);mesh(new THREE.ConeGeometry(.115,.26,3),0x956757,animal,x,1.35,.09).rotation.y=Math.PI/2}}
  for(const x of [-.19,.19]){ball(animal,palette.cream,x,.86,.28,.21,.16,.1);ball(animal,0x343f36,x,.99,.317,.047,.065,.025);ball(animal,0xffffff,x-.012,1.014,.341,.014);ball(animal,0xec9c89,x*1.5,.86,.295,.067,.035,.025)}
  ball(animal,0x4e5144,0,.87,.388,.051,.038,.04);
  for(const x of [-.23,.23]){const leg=ball(animal,fur,x,.1,.055,.145,.16,.2);legs.push(leg);ball(animal,fur,x*1.73,.49,0,.13,.24,.13)}
  tail=ball(animal,bunny?palette.cream:fur,.1,.4,-.4,bunny?.16:.23,bunny?.16:.34,bunny?.16:.36);if(!bunny){tail.rotation.x=-.7;ball(animal,palette.cream,.1,.56,-.61,.18,.2,.15)}
 }
 setAnimal('fox');
 const shadow=new THREE.Mesh(new THREE.CircleGeometry(.47,24),new THREE.MeshBasicMaterial({color:0x4d6854,transparent:true,opacity:.18,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
 const particles=[];function burst(position,color=palette.gold){for(let i=0;i<18;i++){const m=mesh(new THREE.BoxGeometry(.1,.16,.04),color,scene,position.x,position.y+.6,position.z);m.castShadow=false;particles.push({m,v:new THREE.Vector3(Math.sin(i*7)*2,2+(i%4)*.6,Math.cos(i*7)*2),life:1.3})}}
 function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}resize();window.addEventListener('resize',resize);
 let facing=0;let first=true;
 function render(dt,t,mode){
  for(let i=0;i<islands.length;i++){const p=game.platforms[i];islands[i].position.set(p.x,p.y,p.z);islands[i].rotation.y=p.angle;}
  const next=game.nextPlatform,landing=landingPoint(next);nextMarker.visible=mode!=='menu'&&!game.won;nextMarker.position.set(landing.x,next.y+.04,landing.z);nextRing.scale.setScalar(next.hazard ? .5 : 1);nextArrow.position.y=2.25+Math.sin(t*3)*.15;
  for(const s of stars){const p=game.platforms[s.id],star=landingPoint(p);s.mesh.visible=!game.collected.has(s.id);s.mesh.position.set(star.x,p.y+1.14+Math.sin(t*2+s.id)*.12,star.z);s.mesh.rotation.y=t*.9;s.mesh.rotation.z=Math.sin(t*1.4)*.08}
  for(let i=0;i<hazardMeshes.length;i++){hazardMeshes[i].position.copy(game.hazards[i].body.translation());hazardMeshes[i].quaternion.copy(game.hazards[i].body.rotation())}
  for(const f of flagGroups)f.ring.material=mat(game.checkpoint>=f.id?palette.gold:palette.cream);
  const p=game.position;player.position.set(p.x,p.y-.59,p.z);const v=game.body.linvel(),speed=Math.hypot(v.x,v.z);
  if(speed>.3&&mode==='playing')facing=Math.atan2(v.x,v.z);else if(mode==='menu')facing=.42;
  let delta=((facing-player.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;player.rotation.y+=delta*Math.min(1,dt*14);
  const walk=game.grounded&&speed>.4&&mode==='playing';legs.forEach((l,i)=>{l.position.y=.1+(walk?Math.sin(t*17+i*Math.PI)*.07:0);l.position.z=.055+(walk?Math.sin(t*17+i*Math.PI)*.13:0)});animal.rotation.z=walk?Math.sin(t*17)*.045:Math.sin(t*2)*.018;tail.rotation.z=Math.sin(t*5)*.1;
  const under=game.platforms.filter(f=>p.y>f.y&&containsPlatform(f,p)).sort((a,b)=>b.y-a.y)[0];shadow.visible=!!under;if(under){shadow.position.set(p.x,under.y+.027,p.z);shadow.scale.setScalar(Math.max(.55,1-(p.y-under.y)*.12))}
  let desired;
  if(mode==='menu'){
   desired=new THREE.Vector3(61,48,77);target.set(-8,20,0);
   if(innerWidth<700){desired.set(65,48,85);target.set(0,21,0)}
  }else{
   target.set(p.x,p.y+.85,p.z);
   const direction=new THREE.Vector3(Math.sin(orbit.yaw)*Math.cos(orbit.pitch),Math.sin(orbit.pitch),Math.cos(orbit.yaw)*Math.cos(orbit.pitch));
   const distance=game.cameraDistance(target,direction,orbit.distance);
   desired=target.clone().addScaledVector(direction,distance);
  }
  camera.position.lerp(desired,first?1:1-Math.exp(-dt*(mode==='menu'?4:18)));camera.lookAt(target);first=false;
  sun.position.set(p.x-15,p.y+28,p.z+12);sun.target.position.set(p.x,p.y,p.z-8);
  for(let i=0;i<clouds.length;i++)clouds[i].rotation.y=Math.sin(t*.025+i)*.1;
  for(let i=particles.length-1;i>=0;i--){const q=particles[i];q.life-=dt;q.v.y-=dt*4;q.m.position.addScaledVector(q.v,dt);q.m.rotation.x+=dt*3;q.m.rotation.z+=dt*4;if(q.life<=0){scene.remove(q.m);q.m.geometry.dispose();particles.splice(i,1)}}
  renderer.render(scene,camera);
 }
 return {render,setAnimal,burst,renderer};
}
