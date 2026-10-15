/** Stage 5 — Radiation weather, connected-air shelter, and non-duplicating mask use.
 * The published save schema v2 and world generation v1..6 remain unchanged.
 */
export const RADIATION = Object.freeze({DAY:600,FIRST:1800,INTERVAL:600,WARNING:30,DURATION:60,
  EXPOSURE:2,DEBUFF:30,HEALTH_PER_SECOND:1,HUNGER_PER_SECOND:.5,LEGACY_GRACE:120});
const WIDTH=512, HEIGHT=160, MAX_TIME=Number.MAX_SAFE_INTEGER;
const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=MAX_TIME;
const toast=m=>{const el=document.getElementById('interaction-message');if(el)el.textContent=m;};

export function validateStage5Save(v){
 if(v===undefined)return;
 const bad=f=>{throw Error(`저장 stage5.${f} 오류`);};
 if(!v||v.version!==1)bad('version');
 for(const field of ['nextStart','exposure','debuffRemaining'])if(!number(v[field]))bad(field);
 if(typeof v.maskEquipped!=='boolean')bad('maskEquipped');
 if(v.elapsedDays!==undefined&&(!Number.isSafeInteger(v.elapsedDays)||v.elapsedDays<0))bad('elapsedDays');
 if(!['preparation','warning','active','interval'].includes(v.phase))bad('phase');
 if(v.exposure>RADIATION.EXPOSURE+.001||v.debuffRemaining>RADIATION.DEBUFF+.001)bad('효과 범위');
 if(v.nextStart<RADIATION.FIRST||v.nextStart>MAX_TIME-RADIATION.INTERVAL)bad('nextStart 범위');
}

export function initialRadiationState(now, saved){
 if(!number(now))throw Error('게임 누적 시간 오류');
 validateStage5Save(saved);
 if(saved)return {...saved};
 const nextStart=now<RADIATION.FIRST?RADIATION.FIRST:now+RADIATION.LEGACY_GRACE;
 return {version:1,nextStart,exposure:0,debuffRemaining:0,maskEquipped:false,phase:'preparation'};
}

/** A schedule tracks *start instants*, not the repeating dayTime UI counter. */
export function eventAt(now,nextStart){
 const d=now-nextStart;
 if(d>=0&&d<RADIATION.DURATION)return 'active';
 if(d>=-RADIATION.WARNING&&d<0)return 'warning';
 return now<RADIATION.FIRST?'preparation':'interval';
}
export function settleSchedule(now,nextStart,{slept=false}={}){
 if(!number(now)||!number(nextStart))throw Error('방사능 일정 값 오류');
 const minLead=slept?RADIATION.WARNING:0;
 if(now<nextStart+RADIATION.DURATION&&(!slept||now<nextStart-RADIATION.WARNING))return nextStart;
 // A sleep jump never triggers unannounced radiation damage on awakening.
 const step=Math.max(1,Math.ceil((now+minLead-nextStart)/RADIATION.INTERVAL));
 return nextStart+step*RADIATION.INTERVAL;
}

/** Global finite-world air connectivity, computed incrementally and cached.
 * Source is always top-of-world air; a door/window/cave tunnel reconnects the component.
 * WorldManager.getBlock includes unloaded chunks and player changes in its sample.
 */
export class AirConnectivity {
 constructor(world,width=WIDTH,height=HEIGHT){this.world=world;this.width=width;this.height=height;this.connected=new Uint8Array(width*height);
  this.queue=new Int32Array(width*height);this.head=0;this.tail=0;this.dirty=true;this.computing=false;this.ready=false;}
 invalidate(){this.dirty=true;this.ready=false;}
 passable(x,y){const b=this.world.getBlock(x,y);return !b||b.collision===false||b.id==='leaves'||b.id==='leaf';}
 start(){this.connected.fill(0);this.head=0;this.tail=0;this.dirty=false;this.computing=true;this.ready=false;
  for(let x=0;x<this.width;x++)if(this.passable(x,0)){this.connected[x]=1;this.queue[this.tail++]=x;}}
 step(budget=12000){if(this.dirty)this.start();if(!this.computing)return true;
  const w=this.width,h=this.height;let done=0;
  while(this.head<this.tail&&done++<budget){const pos=this.queue[this.head++],x=pos%w,y=(pos/w)|0;
   const visit=(nx,ny,idx)=>{if(!this.connected[idx]&&this.passable(nx,ny)){
    this.connected[idx]=1;this.queue[this.tail++]=idx;}};
   if(x>0)visit(x-1,y,pos-1);
   if(x<w-1)visit(x+1,y,pos+1);
   if(y>0)visit(x,y-1,pos-w);
   if(y<h-1)visit(x,y+1,pos+w);
  }
  if(this.head===this.tail){this.computing=false;this.ready=true;}
  return this.ready;
 }
 /** null means recalculation pending; no erroneous exposure is applied while pending. */
 sheltered(body){
  if(!this.ready)return null;
  for(const px of [body.x+1,body.x+body.width/2,body.x+body.width-1]){
   const tx=Math.floor(px/16);if(tx<0||tx>=this.width)return false;
   for(const py of [body.y+1,body.y+body.height/2,body.y+body.height-1]){
    const ty=Math.floor(py/16);if(ty<0||ty>=this.height)return false;
    if(this.connected[ty*this.width+tx])return false;
   }
  }
  return true;
 }
}

/** Independence from Math.random makes the 20% crate roll stable across reloads. */
export function mineMaskRoll(seed,x,y){
 let h=2166136261;const str=`${seed}:mine-gas-mask:${x}:${y}`;
 for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
 return (h>>>0)/4294967296 < .2;
}

export function stepRadiation(state,dt,now,{protectedFromDust=false,pending=false,health=100,hunger=100}={}){
 if(!number(dt)||!number(now)||dt>1)throw Error('방사능 프레임 시간 오류');
 state.nextStart=settleSchedule(now,state.nextStart);
 const phase=eventAt(now,state.nextStart);
 const active=phase==='active',exposed=active&&!protectedFromDust&&!pending;
 if(exposed)state.exposure=Math.min(RADIATION.EXPOSURE,state.exposure+dt);
 else state.exposure=0;
 if(exposed&&state.exposure>=RADIATION.EXPOSURE)state.debuffRemaining=RADIATION.DEBUFF;
 const affected=Math.min(dt,state.debuffRemaining);
 state.debuffRemaining=Math.max(0,state.debuffRemaining-affected);
 state.phase=phase;
 return {phase,active,exposed,debuff:state.debuffRemaining>0,
  damage:affected*RADIATION.HEALTH_PER_SECOND,
  hungerLoss:affected*RADIATION.HUNGER_PER_SECOND};
}

export function attachStage5(scene){
 const abort=new AbortController(), inv=scene.inventory,world=scene.world;
 let state=initialRadiationState(scene.worldElapsedSeconds,scene.session.restore?.stage5);
 let lastAt=scene.worldElapsedSeconds,paintClock=0;
 const air=new AirConnectivity(world),off=world.changed.subscribe(()=>air.invalidate());
 const hud=document.getElementById('survival-hud');
 const status=document.createElement('span');status.id='radiation-status';status.hidden=true;status.setAttribute('role','status');hud.append(status);
 const mask=document.createElement('button');mask.id='mask-toggle';mask.type='button';mask.hidden=true;mask.textContent='방독면 착용';
 mask.setAttribute('aria-pressed','false');document.getElementById('hud').append(mask);
 const overlay=document.createElement('div');overlay.id='radiation-dust';overlay.hidden=true;overlay.setAttribute('aria-hidden','true');document.getElementById('hud').append(overlay);
 const ownsMask=()=>inv.storage.some(s=>s.id==='gas_mask'&&s.count>0)||(inv.cursor?.id==='gas_mask'&&inv.cursor?.count>0);
 if(state.maskEquipped&&!ownsMask())state.maskEquipped=false;
 const setEquipped=value=>{if(value&&!ownsMask()){toast('가방에 방독면이 없습니다.');return false;}
  state.maskEquipped=value;paint(true);toast(value?'방독면을 착용했습니다. 새로운 방사능 노출을 차단합니다.':'방독면을 벗었습니다.');return true;};
 mask.addEventListener('click',()=>setEquipped(!state.maskEquipped),{signal:abort.signal});
 function paint(){
  if(!ownsMask())state.maskEquipped=false;
  mask.hidden=!(state.maskEquipped||inv.slot(inv.selected).id==='gas_mask');
  mask.textContent=state.maskEquipped?'방독면 벗기':'방독면 착용';mask.setAttribute('aria-pressed',String(state.maskEquipped));
  const phase=state.phase;
  overlay.hidden=phase!=='active';
  const label=state.debuffRemaining>0?`☢ 오염 ${Math.ceil(state.debuffRemaining)}초 · 우유로 치료`:
   phase==='active'?(state.maskEquipped?'☢ 방사능 먼지 · 방독면 보호':air.sheltered(scene.player.body)===null?'☢ 방사능 먼지 · 대피 판정 중':air.sheltered(scene.player.body)===true?'☢ 방사능 먼지 · 실내 대피':'☢ 방사능 먼지 · 대피하세요'):
   phase==='warning'?`☢ 방사능 먼지 ${Math.max(1,Math.ceil(state.nextStart-scene.worldElapsedSeconds))}초 전 · 대피하세요`:
   phase==='preparation'?`☢ 방사능 준비기간 ${Math.ceil((state.nextStart-scene.worldElapsedSeconds)/600)}일` : '';
  status.hidden=!label;status.textContent=label;
 }
 function tick(dt){
  if(state.maskEquipped&&!ownsMask())state.maskEquipped=false;
  // Scene.update already excludes pauses, inactive tabs and sleeping. Sleep jumps are caught below.
  const now=scene.worldElapsedSeconds;
  if(now-lastAt>dt+.25){onSleepWake();paint(true);return;}
  lastAt=now;
  // No exposure/damage while a new or streamed-in view is unavailable for play.
  if(scene.world.chunks?.visibleReady===false){
   state.exposure=0;state.nextStart=settleSchedule(now,state.nextStart);
   state.phase=eventAt(now,state.nextStart);paint();return;
  }
  air.step(12000);
  const safe=air.sheltered(scene.player.body);
  if(scene.dying>0){state.exposure=0;state.debuffRemaining=0;state.maskEquipped=false;state.nextStart=settleSchedule(now,state.nextStart);state.phase=eventAt(now,state.nextStart);paint();return;}
  const result=stepRadiation(state,dt,now,{protectedFromDust:state.maskEquipped||safe===true,pending:safe===null});
  if(result.damage>0)scene.stats.damage(result.damage);
  if(result.hungerLoss>0)scene.stats.hunger=Math.max(0,scene.stats.hunger-result.hungerLoss);
  if(result.damage>0&&scene.stats.health<=0)scene.die();
  paintClock+=dt;if(paintClock>=.12){paintClock=0;paint();}
 }
 function onSleepWake(){
  lastAt=scene.worldElapsedSeconds;
  state.exposure=0;
  state.nextStart=settleSchedule(lastAt,state.nextStart,{slept:true});
  state.phase=eventAt(lastAt,state.nextStart);
  paint(true);
 }
 function cure(){state.debuffRemaining=0;state.exposure=0;toast('우유로 방사능 오염을 치료했습니다. 계속 노출되면 다시 감염됩니다.');paint(true);}
 const baseDrops=scene.mining.loot.drops.bind(scene.mining.loot);
 scene.mining.loot.drops=(block,x,y)=>{
  const loot=scene.mining.loot,key=y*512+x;
  const newMine=block.id==='supply_crate'&&loot.origins.get(key)==='mine'&&!loot.claimed.has(key);
  const drops=baseDrops(block,x,y);
  if(newMine&&mineMaskRoll(scene.session.snapshot.seed,x,y))return [...drops,{id:'gas_mask',count:1}];
  return drops;
 };
 const oldSnapshot=scene.snapshot.bind(scene),oldRestore=scene.restoreSave.bind(scene),rawDie=scene.die,oldDie=rawDie.bind(scene);
 function snapshot(){if(!ownsMask())state.maskEquipped=false;return {...oldSnapshot(),stage5:{...state,elapsedDays:Math.floor(scene.worldElapsedSeconds/RADIATION.DAY)}};}
 function restore(data){oldRestore(data);state=initialRadiationState(scene.worldElapsedSeconds,data.stage5);if(state.maskEquipped&&!ownsMask())state.maskEquipped=false;
  lastAt=scene.worldElapsedSeconds;air.invalidate();paint(true);}
 scene.snapshot=snapshot;scene.restoreSave=restore;
 scene.die=()=>{state.maskEquipped=false;state.exposure=0;oldDie();paint(true);};
 scene.stage4.onDrinkMilk=cure;
 scene.stage5={tick,onSleepWake,cure,air,get state(){return {...state};},setEquipped};
 scene.events.once('shutdown',()=>{abort.abort();off();scene.stage4&&(scene.stage4.onDrinkMilk=null);scene.mining.loot.drops=baseDrops;
  // Stage 4 shutdown runs before this listener and already restores its own wrappers.
  // Never reinstall a closure tied to the previous game scene during restart.
  if(scene.snapshot===snapshot)scene.snapshot=oldSnapshot;
  if(scene.restoreSave===restore)scene.restoreSave=oldRestore;
  scene.die=rawDie;scene.stage5=null;mask.remove();status.remove();overlay.remove();});
 paint(true);
}
