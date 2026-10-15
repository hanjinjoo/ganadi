const response=await fetch(new URL('../data/expansion.json',import.meta.url));
if(!response.ok)throw Error('expansion.json: HTTP '+response.status);
export const settings=await response.json();
const itemResponse=await fetch(new URL('../data/items.json',import.meta.url));
if(!itemResponse.ok)throw Error('items.json: HTTP '+itemResponse.status);
export const expansionItems=await itemResponse.json();
for(const key of ['interval','range','effectLife','maxEffects'])if(!Number.isFinite(settings.pistol?.[key])||settings.pistol[key]<=0)throw Error('expansion.json: pistol.'+key);
export function clearLine(world,x,y,tx,ty){
 const n=Math.max(1,Math.ceil(Math.hypot(tx-x,ty-y)/2));
 for(let i=0;i<=n;i++)if(world.isSolid(Math.floor((x+(tx-x)*i/n)/16),Math.floor((y+(ty-y)*i/n)/16)))return false;
 return true;
}
export function sunExposed(world,c,phase){
 if(phase!=='day')return false;
 const x=Math.floor(c.cx/16),y=Math.floor(c.body.y/16);
 for(let row=y;row>=0;row--){const b=world.getBlock(x,row);if(b&&!b.transparent)return false;}
 return true;
}
export function rayBox(x,y,dx,dy,b,max){
 let near=0,far=max;
 for(const [p,d,lo,hi] of [[x,dx,b.x,b.x+b.width],[y,dy,b.y,b.y+b.height]]){
  if(Math.abs(d)<1e-9){if(p<lo||p>hi)return null;continue;}
  let a=(lo-p)/d,z=(hi-p)/d;if(a>z)[a,z]=[z,a];near=Math.max(near,a);far=Math.min(far,z);if(near>far)return null;
 }
 return near<=max&&far>=0?near:null;
}
export function traceShot(scene,x,y,dx,dy,range){
 let distance=range,target=null;
 const minX=Math.max(0,Math.floor(Math.min(x,x+dx*range)/16)),maxX=Math.min(511,Math.floor(Math.max(x,x+dx*range)/16));
 const minY=Math.max(0,Math.floor(Math.min(y,y+dy*range)/16)),maxY=Math.min(159,Math.floor(Math.max(y,y+dy*range)/16));
 for(let ty=minY;ty<=maxY;ty++)for(let tx=minX;tx<=maxX;tx++)if(scene.world.isSolid(tx,ty)){
  const d=rayBox(x,y,dx,dy,{x:tx*16,y:ty*16,width:16,height:16},range);if(d!==null&&d<distance)distance=d;
 }
 for(const c of scene.creatures.active){if(c.state==='Dead')continue;const d=rayBox(x,y,dx,dy,c.body,range);if(d!==null&&d<distance){distance=d;target=c;}}
 return {distance,target,x:x+dx*distance,y:y+dy*distance};
}
export function attachExpansion(scene){
 const input=scene.worldInput,inventory=scene.inventory,ai=scene.creatureAI,spawns=scene.spawns;
 const originalSpawn=scene.creatures.spawn.bind(scene.creatures);
 scene.creatures.spawn=(def,x,y)=>{
  const width=def.width??12,height=def.height??12;
  // SpawnSystem locates a 12px body at the floor: preserve the bottom for larger animals.
  const top=y+12-height;
  if(def.width)for(let ty=Math.floor(top/16);ty<=Math.floor((top+height-.01)/16);ty++)for(let tx=Math.floor(x/16);tx<=Math.floor((x+width-.01)/16);tx++)if(scene.world.isSolid(tx,ty))return null;
  if(def.spawn.maxAlive&&scene.creatures.active.filter(c=>c.definition.id===def.id).length>=def.spawn.maxAlive)return null;
  const c=originalSpawn(def,x,top);if(c){Object.assign(c.body,{width,height});c.sunTimer=0;c.burning=false;}return c;
 };
 const weight=spawns.weight.bind(spawns);
 spawns.weight=(def,x,y,ctx)=>{
  if(def.spawn.time==='night'&&!ctx.night)return 0;
  if(def.spawn.maxAlive&&scene.creatures.active.filter(c=>c.definition.id===def.id).length>=def.spawn.maxAlive)return 0;
  return weight(def,x,y,ctx);
 };
 const updateAI=ai.update.bind(ai);
 ai.update=(c,dt,player,detector,attack)=>{
  if(c.definition.sunDamage&&c.state!=='Dead'){
   c.burning=sunExposed(scene.world,c,scene.dayNight.time.phase);
   c.sunTimer=c.burning?(c.sunTimer??0)+dt:0;
   if(c.sunTimer>=settings.sunInterval){c.health=Math.max(0,c.health-c.definition.health*c.definition.sunDamage*c.sunTimer);c.sunTimer=0;c.invulnerable=.15;if(c.health<=0)ai.hit(c);}
  }
  if(c.definition.attackWindup&&c.state==='Attack'&&c.stateTime<c.definition.attackWindup)c.attackTimer=Math.max(c.attackTimer,c.definition.attackWindup-c.stateTime);
  updateAI(c,dt,player,detector,v=>{if(clearLine(scene.world,v.cx,v.cy,player.x+player.width/2,player.y+player.height/2))attack(v);});
 };
 // Discover acquired materials from legacy saves, including recipes introduced in this version.
 scene.crafting.discover();
 const graphics=scene.add.graphics().setDepth(5),shots=[],abort=new AbortController();let cooldown=0,emptyNotice=0;
 const trigger=e=>{if(e.button===0&&input.active&&!input.right)fire();};
 input.pad.addEventListener('pointerdown',trigger,{signal:abort.signal});
 input.canvas.addEventListener('pointerdown',trigger,{signal:abort.signal});
 scene.expansion={shots,fire,trace:(x,y,dx,dy,r)=>traceShot(scene,x,y,dx,dy,r)};
 function fire(){
  if(cooldown>0||input.disabled||scene.inventoryUI.opened||scene.pausedByMenu||scene.dying>0||input.contextHolding||input.actionSuppressed||!scene.form.permits('attack'))return false;
  const slot=inventory.slot(inventory.selected);if(slot.id!==settings.pistol.item)return false;
  if(!inventory.count(settings.pistol.ammo)){if(emptyNotice<=0){document.getElementById('interaction-message').textContent='탄약 없음';scene.toast('탄약 없음');emptyNotice=1;}return false;}
  const b=scene.player.body,x=b.x+b.width/2,y=b.y+b.height*.4,angle=Math.atan2(input.worldY-y,input.worldX-x),dx=Math.cos(angle),dy=Math.sin(angle);
  const hit=traceShot(scene,x,y,dx,dy,settings.pistol.range),item=inventory.registry.get(slot.id);
  inventory.remove(settings.pistol.ammo,1);if(inventory.wearSelected())input.actionSuppressed=true;cooldown=settings.pistol.interval;
  if(hit.target){const c=hit.target;c.health-=Math.max(1,item.attack*scene.form.profile.attack-(c.definition.defense??0));c.invulnerable=.3;c.body.vx=dx*120;c.body.vy=-80;c.knockback=.2;ai.hit(c);}
  if(shots.length>=settings.pistol.maxEffects)shots.shift();shots.push({x,y,tx:hit.x,ty:hit.y,life:settings.pistol.effectLife,hit:!!hit.target});
  scene.player.facing=dx>=0?1:-1;scene.actionAnimation='attack';scene.actionAnimationTime=.2;scene.audio.play('pistol_shot');return true;
 }
 const tick=(_time,delta)=>{
  const dt=Math.min(.05,delta/1000);input.rangedSelected=inventory.slot(inventory.selected).id===settings.pistol.item;
  if(input.rangedSelected)input.pad.querySelector('small').textContent='조준 · 사격';
  graphics.clear();if(scene.pausedByMenu||scene.inventoryUI.opened||scene.dying>0)return;
  cooldown=Math.max(0,cooldown-dt);emptyNotice=Math.max(0,emptyNotice-dt);
  if(input.rangedSelected&&input.active&&input.aiming&&!input.right&&!input.contextHolding&&!input.actionSuppressed)fire();
  for(let i=shots.length-1;i>=0;i--){const s=shots[i];s.life-=dt;if(s.life<=0){shots.splice(i,1);continue;}graphics.lineStyle(1,0xffe1a0,.85);graphics.lineBetween(s.x,s.y,s.tx,s.ty);graphics.fillStyle(0xffe69a);graphics.fillRect(s.x-1,s.y-1,3,3);if(s.hit)graphics.fillRect(s.tx-2,s.ty-2,4,4);}
 };
 scene.events.on('preupdate',tick);scene.events.once('shutdown',()=>{abort.abort();scene.events.off('preupdate',tick);graphics.destroy();});
}
export function drawExpansionCreature(g,c){
 if(!['cow','minotaur'].includes(c.definition.id))return false;
 const cow=c.definition.id==='cow',w=cow?24:30,h=cow?19:36,x=Math.round(c.cx-w/2),y=Math.round(c.body.y+c.body.height-h),hurt=c.invulnerable>0;
 const step=Math.abs(c.body.vx)>2&&c.body.grounded?Math.floor(c.stateTime*10)%2:0;
 const rect=(px,py,rw,rh,color)=>{g.fillStyle(hurt?0xf0786f:color,c.state==='Dead'?.5:1);g.fillRect(x+(c.facing<0?w-px-rw:px),y+py,rw,rh);};
 if(cow){
  rect(2,5,17,10,0x302d30);rect(3,5,14,9,0xe6e0cd);rect(4,6,5,5,0x464345);rect(12,10,5,4,0x464345);
  rect(4,14+step,3,5-step,0x393637);rect(14,14,3,5-step,0x393637);rect(17,5,6,9,0xe6e0cd);rect(19,10,5,4,0xb88a80);rect(20,7,1,2,0x21272a);
  rect(17,2,2,4,0xcab886);rect(22,2,2,4,0xcab886);rect(16,5,2,2,0x837768);rect(0,7,2,7,0x726657);
 }else{
  rect(7,12,16,17,0x3c302d);rect(8,13,14,12,0x796050);rect(4,14,5,13,0x5a4338);rect(22,14,5,12,0x5a4338);
  rect(8,27+step,6,9-step,0x3b3432);rect(17,27,6,9-step,0x3b3432);rect(7,33,7,3,0x211f23);rect(17,33,7,3,0x211f23);
  rect(9,4,14,12,0x594539);rect(11,3,9,4,0x29272a);rect(7,3,3,6,0xcebea0);rect(5,1,3,4,0xcebea0);rect(22,3,3,6,0xcebea0);rect(25,1,3,4,0xcebea0);
  rect(12,8,2,2,0xe9623d);rect(20,8,2,2,0xe9623d);rect(15,11,9,5,0x9b7b60);rect(20,13,2,1,0x27262b);
  const raised=c.state==='Attack'&&(c.stateTime<(c.definition.attackWindup??.5)||c.attackTimer<(c.definition.attackWindup??.5));rect(26,raised?4:13,2,17,0xaa8053);rect(23,raised?1:10,7,6,0xaab5b9);rect(23,raised?1:10,2,6,0xe1dfcd);rect(8,24,15,3,0x242329);rect(14,24,4,3,0xac9874);
  if(c.burning){for(let i=0;i<4;i++){g.fillStyle(i%2?0xffcc5a:0xef7639,.85);g.fillRect(x+5+i*6,y+h-8-(i%2)*4,3,8+(i%2)*4);}}
 }
 if(hurt){g.fillStyle(0x24282b);g.fillRect(x+3,y-4,w-6,2);g.fillStyle(0xff8271);g.fillRect(x+3,y-4,Math.ceil((w-6)*Math.max(0,c.health)/c.definition.health),2);}return true;
}
