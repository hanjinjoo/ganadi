/** Stage 4: bottles, explicit interaction and persistent cow milking cooldowns.
 * Attaches to the EXISTING item registry, crafting, inventory, scene and context button.
 * No global pointer handlers or world-generation changes are introduced here.
 */
import {lineClear} from './melee.js';
export const MILKING_SECONDS = 60;
const MAX_COOLDOWNS = 128;
const message = value => {const el=document.getElementById('interaction-message');if(el)el.textContent=value;};
const eligible = scene => !scene.worldInput.disabled && !scene.inventoryUI.opened &&
  !scene.pausedByMenu && scene.dying<=0 && !scene.homestead?.sleeping &&
  scene.form.permits('inventory');

export function validateStage4Save(data){
 if(data===undefined)return;
 const invalid=what=>{throw Error('저장 stage4.'+what+' 오류');};
 if(!data || data.version!==1 || !Array.isArray(data.milkingCooldowns) || data.milkingCooldowns.length>MAX_COOLDOWNS) invalid('형식');
 const seen=new Set();
 for(const [i,entry] of data.milkingCooldowns.entries()){
  if(!entry || !Number.isInteger(entry.x) || entry.x<0 || entry.x>=512 ||
    !Number.isInteger(entry.y) || entry.y<0 || entry.y>=160 ||
    !Number.isFinite(entry.until) || entry.until<0 || entry.until>Number.MAX_SAFE_INTEGER) invalid(`milkingCooldowns[${i}]`);
  const key=`${entry.x},${entry.y}`;
  if(seen.has(key)) invalid(`milkingCooldowns[${i}].중복`);
  seen.add(key);
 }
}

/** Capacity is checked after accounting for the bottle slot freed by consumption. */
export function canExchange(inventory,from,to){
 const slot=inventory.slot(inventory.selected);
 return slot.id===from && slot.count>=1 && (inventory.capacity(to)>0 || slot.count===1);
}
/** Preserve inventory on failure. The transaction is synchronous and cannot half-complete. */
export function exchangeOne(inventory,from,to){
 if(!canExchange(inventory,from,to))return false;
 const original=inventory.storage.map(s=>({...s}));
 if(!inventory.take(inventory.selected,1))return false;
 if(inventory.add(to,1)===0)return true;
 inventory.storage.forEach((slot,i)=>Object.assign(slot,original[i]));
 inventory.revision++;
 return false;
}

export function attachStage4(scene){
 const input=scene.worldInput,inv=scene.inventory;
 const cooldowns=new Map(), liveCows=new WeakMap();
 const abort=new AbortController();
 const keyFor=(cow)=>({x:Math.max(0,Math.min(511,Math.floor(cow.homeX/16))),
   y:Math.max(0,Math.min(159,Math.floor(cow.homeY/16)))});
 const worldNow=()=>scene.worldElapsedSeconds ?? 0;
 const distanceTo=(x,y)=>{const body=scene.player.body;return Math.hypot(body.x+body.width/2-x,body.y+body.height/2-y);};
 function remaining(cow){
  const live=liveCows.get(cow)??0;
  // Persist by original spawn coordinates, with a nearby-area guard for cows
  // whose non-persistent entity was regenerated after a save/reload.
  const {x,y}=keyFor(cow);let expires=live;
  for(const entry of cooldowns.values())if(Math.abs(entry.x-x)<=3 && Math.abs(entry.y-y)<=3)expires=Math.max(expires,entry.until);
  return Math.max(0,expires-worldNow());
 }
 function targetedCow(){
  const x=input.worldX,y=input.worldY;
  const cx=scene.player.body.x+scene.player.body.width/2;
  const cy=scene.player.body.y+scene.player.body.height/2;
  return scene.creatures.active.filter(c=>c.definition.id==='cow'&&c.active&&c.state!=='Dead'&&c.health>0&&
    x>=c.body.x && x<c.body.x+c.body.width && y>=c.body.y && y<c.body.y+c.body.height &&
    distanceTo(c.cx,c.cy)<=48 && lineClear(scene.world,cx,cy,x,y)).sort((a,b)=>distanceTo(a.cx,a.cy)-distanceTo(b.cx,b.cy))[0]??null;
 }
 function target(){
  if(!eligible(scene) || !input.aiming || inv.slot(inv.selected).id!=='empty_bottle')return null;
  const cow=targetedCow();
  if(cow)return {stage4:true,id:'cow',cow,label:remaining(cow)>0?`착유 대기 ${Math.ceil(remaining(cow))}초`:'우유 짜기'};
  const x=Math.floor(input.worldX/16),y=Math.floor(input.worldY/16);
  if(scene.world.getBlock(x,y)?.id!=='water')return null;
  const px=scene.player.body.x+scene.player.body.width/2,py=scene.player.body.y+scene.player.body.height/2;
  if(distanceTo(x*16+8,y*16+8)>48||!lineClear(scene.world,px,py,x*16+8,y*16+8))return null;
  return {stage4:true,id:'water',x,y,label:'물 담기'};
 }
 const sameTarget=(a,b)=>a?.stage4===true && b?.stage4===true && a.id===b.id &&
   (a.id==='cow'?a.cow===b.cow:a.x===b.x&&a.y===b.y);
 function use(t){
  const current=target();if(!sameTarget(t,current))return false;
  if(t.id==='cow' && remaining(t.cow)>0){message(`같은 소는 ${Math.ceil(remaining(t.cow))}초 후 다시 착유할 수 있습니다.`);return false;}
  if(!canExchange(inv,'empty_bottle',t.id==='cow'?'milk_bottle':'water_bottle')){
   message('빈 물병 1개와 결과물을 넣을 가방 공간이 필요합니다.');return false;
  }
  scene.mining.reset();scene.attackRequested=false;input.contextHolding=true;input.actionSuppressed=true;
  const result=exchangeOne(inv,'empty_bottle',t.id==='cow'?'milk_bottle':'water_bottle');
  if(result && t.id==='cow'){
   const {x,y}=keyFor(t.cow),entry={x,y,until:worldNow()+MILKING_SECONDS};
   liveCows.set(t.cow,entry.until);cooldowns.set(`${x},${y}`,entry);
  }
  if(result){scene.audio.play('item_pickup');message(t.id==='cow'?'우유 1병을 얻었습니다.':'물 1병을 담았습니다.');scene.hotbar.update();}
  input.contextHolding=false;input.actionSuppressed=input.padPointer!==-1;
  return result;
 }
 function drink(id){
  if(!eligible(scene))return false;
  const slot=inv.slot(inv.selected);if(slot.id!==id)return false;
  // The consumed bottle frees a slot only if the selected stack had count one.
  if(!inv.take(inv.selected,1))return false;
  if(inv.add('empty_bottle',1)!==0){
   const b=scene.player.body;
   scene.drops.spawn('empty_bottle',1,b.x+b.width/2,b.y+b.height/2,null,true);
  }
  if(id==='milk_bottle')scene.stage4.onDrinkMilk?.();
  scene.actionAnimation='eat';scene.actionAnimationTime=.5;
  scene.audio.play('eat');scene.hotbar.update();scene.survival.update(scene.form.state);
  message(id==='milk_bottle'?'우유를 마셨습니다. 빈 병을 반환했습니다.':'물을 마셨습니다. 빈 병을 반환했습니다.');
  return true;
 }
 // Aiming with a bottle must not auto-strike a cow while preparing to milk it.
 // Manual attack controls and all other tools remain unchanged.
 const oldHasAttackTarget=scene.hasAttackTarget.bind(scene);
 scene.hasAttackTarget=()=>inv.slot(inv.selected).id==='empty_bottle'?false:oldHasAttackTarget();
 const oldEat=scene.eatSelected.bind(scene);
 scene.eatSelected=()=>{
  const id=inv.slot(inv.selected).id;
  return id==='water_bottle'||id==='milk_bottle'?drink(id):oldEat();
 };
 const oldSnapshot=scene.snapshot.bind(scene),oldRestore=scene.restoreSave.bind(scene);
 function prune(){
  for(const [key,v] of cooldowns)if(v.until<=worldNow())cooldowns.delete(key);
  while(cooldowns.size>MAX_COOLDOWNS)cooldowns.delete(cooldowns.keys().next().value);
 }
 function restore(saved){
  validateStage4Save(saved);cooldowns.clear();
  for(const e of saved?.milkingCooldowns??[])if(e.until>worldNow())cooldowns.set(`${e.x},${e.y}`,{...e});
 }
 scene.snapshot=()=>{prune();return {...oldSnapshot(),stage4:{version:1,milkingCooldowns:[...cooldowns.values()].map(e=>({...e}))}};};
 scene.restoreSave=data=>{oldRestore(data);restore(data.stage4);};
 restore(scene.session.restore?.stage4);
 scene.stage4={target,use,sameTarget,remaining,onDrinkMilk:null};
 window.addEventListener('keydown',event=>{
  if(event.code!=='KeyE'||event.repeat||event.defaultPrevented||event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
  const t=target();if(t){event.preventDefault();use(t);}
 },{signal:abort.signal});
 scene.events.once('shutdown',()=>{abort.abort();scene.eatSelected=oldEat;scene.hasAttackTarget=oldHasAttackTarget;scene.stage4=null;});
}
