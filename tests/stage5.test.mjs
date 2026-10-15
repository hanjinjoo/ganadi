import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {
 RADIATION,AirConnectivity,eventAt,settleSchedule,initialRadiationState,
 validateStage5Save,stepRadiation,mineMaskRoll,attachStage5
} from '../assets/radiation-stage5.js';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>readFileSync(join(root,f),'utf8');

test('stage 5: first dust after 3 days, 30-sec warning, 60-sec storm, next at day 4',()=>{
 assert.equal(RADIATION.FIRST,1800);
 const state=initialRadiationState(0);
 assert.equal(state.nextStart,1800);
 assert.equal(eventAt(0,1800),'preparation');
 assert.equal(eventAt(1769.9,1800),'preparation');
 assert.equal(eventAt(1770,1800),'warning');
 assert.equal(eventAt(1799,1800),'warning');
 assert.equal(eventAt(1800,1800),'active');
 assert.equal(eventAt(1859.99,1800),'active');
 assert.equal(settleSchedule(1860,1800),2400);
 assert.equal(eventAt(2370,2400),'warning');
 assert.equal(eventAt(2400,2400),'active');
});

test('stage 5: sleep skipping active dust gives fair notice, no catch-up damage',()=>{
 assert.equal(settleSchedule(1800,1800,{slept:true}),2400);
 assert.equal(settleSchedule(1875,1800,{slept:true}),2400);
 assert.equal(settleSchedule(2360,2400,{slept:true}),2400);
 assert.equal(settleSchedule(2380,2400,{slept:true}),3000);
 const migrated=initialRadiationState(3800);
 assert.equal(migrated.nextStart,3920,'old save is not immediately damaged');
 assert.equal(initialRadiationState(450).nextStart,1800);
});

test('stage 5: exposure takes 2 sec, one non-stacking debuff, protection blocks new exposure',()=>{
 const s=initialRadiationState(0);let result;
 for(let t=1800.1;t<1802.05;t+=.1)result=stepRadiation(s,.1,t);
 assert.ok(result.debuff);
 assert.ok(s.debuffRemaining>29&&s.debuffRemaining<=30);
 const old=s.debuffRemaining;
 result=stepRadiation(s,.1,1802.2);
 assert.ok(result.damage<=.101 && result.hungerLoss<=.051);
 assert.ok(s.debuffRemaining<=30 && s.debuffRemaining>=old-.11);
 result=stepRadiation(s,.1,1802.3,{protectedFromDust:true});
 assert.equal(s.exposure,0);
 assert.ok(s.debuffRemaining<30,'existing debuff continues inside shelter');
 const previous=s.debuffRemaining;
 result=stepRadiation(s,.1,1802.4,{pending:true});
 assert.equal(s.exposure,0);
 assert.ok(s.debuffRemaining<previous,'recalculation cannot silently cure debuff');
 s.debuffRemaining=0;s.exposure=0;
 stepRadiation(s,.1,1802.5,{protectedFromDust:true});
 assert.equal(s.debuffRemaining,0);
 for(let t=1802.6;t<1804.7;t+=.1)stepRadiation(s,.1,t);
 assert.ok(s.debuffRemaining>0,'can be exposed again after drinking milk');
});

function boxWorld(){
 const w=24,h=14,solid=new Set();const index=(x,y)=>`${x},${y}`;
 for(let x=0;x<w;x++)for(let y=8;y<h;y++)solid.add(index(x,y));
 for(let x=6;x<=12;x++){solid.add(index(x,3));solid.add(index(x,8));}
 for(let y=3;y<=8;y++){solid.add(index(6,y));solid.add(index(12,y));}
 let leaf=null;
 return {w,h,set(x,y,value){const k=index(x,y);if(value)solid.add(k);else solid.delete(k);},setLeaf(x,y){leaf=index(x,y);solid.delete(leaf);},
  getBlock(x,y){const key=index(x,y);return key===leaf?{id:'leaves',collision:false}:solid.has(key)?{id:'stone',collision:true}:null;}};
}
function finish(air){for(let k=0;k<50&&!air.ready;k++)air.step(100);assert.ok(air.ready);}

test('stage 5: genuinely sealed room protects; opening a side door or breaking roof removes protection',()=>{
 const w=boxWorld(),air=new AirConnectivity(w,w.w,w.h),p={x:8*16,y:5*16,width:10,height:26};
 finish(air);assert.equal(air.sheltered(p),true);
 w.set(6,5,false);air.invalidate();assert.equal(air.sheltered(p),null);
 finish(air);assert.equal(air.sheltered(p),false);
 w.set(6,5,true);air.invalidate();finish(air);assert.equal(air.sheltered(p),true);
 w.set(8,3,false);air.invalidate();finish(air);assert.equal(air.sheltered(p),false);
 w.setLeaf(8,3);air.invalidate();finish(air);assert.equal(air.sheltered(p),false,'leaves never seal a roof');
});

test('stage 5: a single roof tile does not make a shelter; disconnected deep cavern does',()=>{
 const w=24,h=30,solid=new Set(),key=(x,y)=>`${x},${y}`;
 for(let x=0;x<w;x++)for(let y=10;y<h;y++)solid.add(key(x,y));
 for(let x=7;x<=12;x++)for(let y=15;y<=20;y++)solid.delete(key(x,y));
 const world={getBlock:(x,y)=>solid.has(key(x,y))?{id:'stone',collision:true}:null};
 const air=new AirConnectivity(world,w,h);
 finish(air);assert.equal(air.sheltered({x:8*16,y:16*16,width:10,height:26}),true);
 assert.equal(air.sheltered({x:8*16,y:5*16,width:10,height:26}),false);
 // An isolated tile overhead does not affect the open-air connected component.
 solid.add(key(8,4));air.invalidate();finish(air);
 assert.equal(air.sheltered({x:8*16,y:5*16,width:10,height:26}),false);
});

test('stage 5: v2 save extension is optional, checked and does not change generation',()=>{
 validateStage5Save(undefined);let saved=initialRadiationState(0);
 saved.maskEquipped=true;validateStage5Save(saved);
 assert.equal(JSON.stringify(JSON.parse(JSON.stringify(saved))),JSON.stringify(saved));
 for(const field of ['nextStart','exposure','debuffRemaining']){
  const bad={...saved,[field]:Infinity};assert.throws(()=>validateStage5Save(bad),new RegExp(field));
 }
 assert.throws(()=>validateStage5Save({...saved,maskEquipped:'yes'}),/maskEquipped/);
 assert.throws(()=>validateStage5Save({...saved,phase:'surprise'}),/phase/);
 assert.throws(()=>validateStage5Save({...saved,version:2}),/version/);
 assert.equal(read('assets/clock-compat.js').includes('ACTIVE_GENERATION_VERSION = 7'),true);
 assert.match(read('assets/index-expansion.js'),/validateStage5Save\(q\?\.stage5\)/);
 assert.match(read('assets/index-expansion.js'),/attachStage5\(this\)/);
 assert.match(read('assets/homestead-runtime.js'),/stage5\?\.onSleepWake/);
});

test('stage 5: one-time mine-only gas mask reward is deterministic and about 20%',()=>{
 let hits=0;for(let i=0;i<1000;i++)if(mineMaskRoll('test-storm',i%512,Math.floor(i/512)+75))hits++;
 assert.ok(hits>150&&hits<250,`probability count ${hits}`);
 assert.equal(mineMaskRoll('test-storm',4,40),mineMaskRoll('test-storm',4,40));
 const mask=JSON.parse(read('data/items.json')).find(i=>i.id==='gas_mask');
 assert.ok(mask);assert.equal(mask.stackSize,1);assert.equal(mask.kind,'material');
 assert.match(read('assets/items/gas_mask.svg'),/<svg/);
 assert.equal(JSON.parse(read('package.json')).scripts.test,'node --test tests/*.test.mjs');
});

function element(){return {hidden:false,textContent:'',dataset:{},children:[],attrs:{},listeners:{},append(node){this.children.push(node)},remove(){},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,cb){this.listeners[k]=cb}};}
function fakeScene(){
 const originalDoc=globalThis.document;
 const hud=element(),statusHud=element(),interaction=element();
 globalThis.document={getElementById:k=>k==='hud'?hud:k==='survival-hud'?statusHud:interaction,createElement:()=>element()};
 const maskSlot={id:'gas_mask',count:1,durability:null};const inv={storage:[maskSlot],selected:0,cursor:{id:null,count:0},slot(i){return this.storage[i]??{id:null,count:0}}};
 const claimed=new Set(),key=12*512+5;
 const loot={origins:new Map([[key,'mine']]),claimed,drops:(block,x,y)=>{if(block.id==='supply_crate'&&loot.origins.has(y*512+x))claimed.add(y*512+x);return [{id:'copper',count:1}]}};
 const shutdown=[];const scene={worldElapsedSeconds:1800,world:{getBlock:()=>null,changed:{subscribe:fn=>()=>{}}},inventory:inv,
  session:{restore:{stage5:{...initialRadiationState(0),nextStart:1800}},snapshot:{seed:'stage5-integration'}},
  player:{body:{x:100,y:100,width:10,height:26}},stats:{health:100,hunger:100,damage(v){this.health-=v;}},
  dying:0,stage4:{onDrinkMilk:null},mining:{loot},snapshot(){return {version:2,player:{}};},restoreSave(){},
  die(){this.dying=1;},events:{once:(name,cb)=>shutdown.push(cb)}};
 return {scene,loot,inv,shutdown,restore(){globalThis.document=originalDoc;}};
}

test('stage 5: attachment, mask equip/unequip, saved state, milk cure, mine-only one-time loot',()=>{
 const f=fakeScene();try{
  attachStage5(f.scene);
  assert.equal(typeof f.scene.stage5.tick,'function');
  assert.equal(typeof f.scene.stage4.onDrinkMilk,'function');
  assert.equal(f.scene.stage5.setEquipped(true),true);
  assert.equal(f.scene.stage5.state.maskEquipped,true);
  assert.equal(f.scene.snapshot().stage5.maskEquipped,true);
  f.inv.storage[0]={id:null,count:0};f.scene.stage5.tick(.1);
  assert.equal(f.scene.stage5.state.maskEquipped,false,'removing item automatically unequips');
  f.inv.storage[0]={id:'gas_mask',count:1};
  f.scene.stage5.setEquipped(true);
  f.scene.die();assert.equal(f.scene.stage5.state.maskEquipped,false);
  f.scene.stage4.onDrinkMilk();assert.equal(f.scene.stage5.state.debuffRemaining,0);
  const rolled=Array.from({length:512},(_,x)=>x).find(x=>mineMaskRoll('stage5-integration',x,12));assert.ok(rolled>=0);
  const luckyKey=12*512+rolled;f.loot.origins.set(luckyKey,'mine');
  assert.ok(f.loot.drops({id:'supply_crate'},rolled,12).some(o=>o.id==='gas_mask'));
  assert.equal(f.loot.drops({id:'supply_crate'},rolled,12).filter(o=>o.id==='gas_mask').length,0);
  f.loot.origins.set(luckyKey+1,'surface');assert.ok(!f.loot.drops({id:'supply_crate'},rolled+1,12).some(o=>o.id==='gas_mask'));
  for(const stop of f.shutdown)stop();
 }finally{f.restore();}
});
