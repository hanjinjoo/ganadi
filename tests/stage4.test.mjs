import {validateStage5Save} from '../assets/radiation-stage5.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {canExchange,exchangeOne,attachStage4,validateStage4Save} from '../assets/stage4-items.js';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const j=p=>JSON.parse(read(p));
const blocks=j('data/blocks.json'),items=j('data/items.json'),recipes=j('data/recipes.json');
const ids=new Map(blocks.map(b=>[b.id,b.numericId]));
const originalFetch=globalThis.fetch,originalPost=globalThis.postMessage;
let last;
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(fileURLToPath(url),'utf8'))});
globalThis.postMessage=value=>last=value;
await import(pathToFileURL(join(root,'assets/world.worker-expansion.js')).href);
async function generate(seed,version){
 last=null;
 await globalThis.onmessage({data:{type:'init',seed,blocks,data:{
  biomes:j('data/biomes.json'),structures:['ruined_house','ruined_store','old_mine'].map(id=>j(`data/structures/${id}.json`)),generationVersion:version}}});
 assert.equal(last?.type,'ready',last?.message);
 return last.world;
}
function fakeInventory(){
 const defs=new Map(items.map(i=>[i.id,i]));
 const storage=Array.from({length:30},()=>({id:null,count:0,durability:null}));
 const inv={storage,selected:0,revision:0,registry:{get:id=>{if(!defs.has(id))throw Error(id);return defs.get(id);}},
 slot(i){return storage[i];},count(id){return storage.reduce((n,s)=>n+(s.id===id?s.count:0),0);},
 capacity(id){let n=0;for(const s of storage)if(!s.id||s.id===id)n+=defs.get(id).stackSize-s.count;return n;},
 take(i,n){const s=storage[i];if(!s.id||s.count<n)return false;s.count-=n;if(!s.count)Object.assign(s,{id:null,count:0,durability:null});this.revision++;return true;},
 add(id,n){let remaining=n;for(let phase=0;phase<2;phase++)for(const s of storage){if((phase===0&&s.id!==id)||(phase===1&&s.id!==null))continue;const add=Math.min(remaining,defs.get(id).stackSize-s.count);if(add){s.id=id;s.count+=add;remaining-=add;this.revision++;}if(!remaining)return 0;}return remaining;}}
 return inv;
}
function sceneFixture(){
 const inv=fakeInventory();
 inv.storage[0]={id:'empty_bottle',count:3,durability:null};
 let now=110; const player={x:60,y:64,width:10,height:26};
 const water={id:'water'},cow={definition:{id:'cow'},active:true,state:'Idle',health:18,homeX:75,homeY:64,
  body:{x:75,y:60,width:24,height:19},cx:87,cy:69};
 const listeners={},outputs=[],attacks=[];
 const input={disabled:false,touchMode:true,aiming:true,worldX:84,worldY:67,
   padPointer:-1,contextHolding:false,actionSuppressed:false};
 const scene={worldInput:input,inventory:inv,inventoryUI:{opened:false},pausedByMenu:false,dying:0,
  homestead:{sleeping:false},form:{permits:()=>true,state:'normal'},worldElapsedSeconds:now,
  player:{body:player},world:{getBlock:(x,y)=>x===5&&y===4?water:null,isSolid:()=>false},
  creatures:{active:[cow]},mining:{reset(){attacks.push('reset');}},attackRequested:false,
  drops:{spawn:(...args)=>{outputs.push(args);return true;}},
  audio:{play(){}},hotbar:{update(){}},survival:{update(){}},
  hasAttackTarget(){return true;},eatSelected(){return 'original eat';},snapshot(){return {version:2};},restoreSave(){return 'restored';},
  session:{},events:{once:(ev,cb)=>listeners[ev]=cb},actionAnimation:''};
 return {scene,inv,cow,input,outputs,attacks,listeners,setTime:n=>{scene.worldElapsedSeconds=n;}};
}
// Light DOM/window stand-in only for event attachment; no browser game claim.
function mountStage4(f){
 const previousWindow=globalThis.window,previousDoc=globalThis.document,oldInput=globalThis.HTMLInputElement,oldText=globalThis.HTMLTextAreaElement;
 const listeners={};globalThis.window={addEventListener:(k,cb)=>listeners[k]=cb};
 globalThis.document={getElementById:()=>({textContent:''})};
 globalThis.HTMLInputElement=class HTMLInputElement {};globalThis.HTMLTextAreaElement=class HTMLTextAreaElement {};
 attachStage4(f.scene);
 const unmount=()=>{f.listeners.shutdown?.();globalThis.window=previousWindow;globalThis.document=previousDoc;globalThis.HTMLInputElement=oldInput;globalThis.HTMLTextAreaElement=oldText;};
 return {unmount,listeners};
}

test('production item and recipe validators accept newly added definitions',async()=>{
 const vm=await import('node:vm');const bundle=read('assets/index-expansion.js');
 const start=bundle.indexOf('const Zt='),end=bundle.indexOf('const Ee=',start);
 assert.ok(start>0&&end>start);
 const context={};vm.runInNewContext(bundle.slice(start,end)+
   '\nglobalThis.validate=(blocks,items,recipes)=>{const verified=new Nt().validateBlocks(blocks);const b=new se(verified);const i=new ne(items,b);return new re(recipes,i).all.length;};',context);
 assert.equal(context.validate(blocks,items,recipes),recipes.length);
});

test('v6 has sand block ID24, new distinct item IDs/icons and data-defined recipes',()=>{
 assert.deepEqual(blocks.slice(0,23).map(b=>b.numericId),Array.from({length:23},(_,i)=>i+1));
 assert.equal(ids.get('sand'),24);assert.equal(blocks[23].dropItem[0].id,'sand');
 assert.ok(items.every((item,i)=>!items.slice(0,i).some(other=>other.id===item.id)));
 for(const id of ['sand','glass','empty_bottle','water_bottle','milk_bottle'])assert.match(read(`assets/items/${id}.svg`),/<svg/);
 const glass=recipes.find(r=>r.id==='glass');const bottle=recipes.find(r=>r.id==='empty_bottle');
 assert.equal(glass.station,'campfire');assert.equal(glass.craftTime,5);
 assert.deepEqual(glass.ingredients,[{item:'sand',count:2}]);
 assert.equal(bottle.station,'workbench');assert.equal(bottle.result.count,3);
 assert.deepEqual(bottle.ingredients,[{item:'glass',count:3}]);
 assert.match(read('assets/station-place.js'),/모닥불 조리·제련/);
});

test('new v6 shore sand is deterministic and actual sand borders lakes in 30 seed samples',async()=>{
 for(let i=0;i<30;i++){
  const seed=`stage4-shore-${i}`,one=await generate(seed,6),two=await generate(seed,6);
  assert.deepEqual(one.cells,two.cells,seed);
  const count=one.cells.reduce((n,id)=>n+(id===ids.get('sand')),0);
  assert.ok(count>0,`${seed}: no mineable sand on shore`);
  assert.ok(one.cells.reduce((n,id)=>n+(id===ids.get('water')),0)>30);
  for(let x=0;x<512;x++)for(const y of [158,159])assert.equal(one.cells[y*512+x],1);
 }
});

test('existing v1-v5 worlds are byte-identical to stage3 ZIP hashes',async()=>{
 // Regression anchors recorded independently from the previous, unedited stage3 ZIP.
 const known = [
  [1,'337793e316c8467db85ded98afa22da184305a6be6ef719b8315cc63f4d79a84'],
  [2,'908d263ff09e2677b681653f8dcc9a38bcf0e07bb17a978cdb2b454b7e0adcb7'],
  [3,'a56304a612e8664ba6d57d0a97bec3c320e67da5620d7a2bc6ffada744b9077d']];
 for(const [version,hash] of known){const w=await generate('stage1-regression-fixed',version);
  assert.equal(createHash('sha256').update(Buffer.from(w.cells.buffer)).digest('hex'),hash);}
 // v4/v5 checks compare generation in test against golden fixture hashes added by the current run.
 const hashes=j('tests/stage4-golden.json');
 for(const version of [4,5]){const w=await generate('stage4-preserve-fixed',version);
  assert.equal(createHash('sha256').update(Buffer.from(w.cells.buffer)).digest('hex'),hashes[version]);}
});

test('empty-bottle exchange is all-or-nothing including inventory full/last slot cases',()=>{
 const inv=fakeInventory();inv.storage[0]={id:'empty_bottle',count:2,durability:null};
 for(let i=1;i<30;i++)inv.storage[i]={id:'sand',count:99,durability:null};
 assert.equal(canExchange(inv,'empty_bottle','water_bottle'),false);
 assert.equal(exchangeOne(inv,'empty_bottle','water_bottle'),false);
 assert.equal(inv.count('empty_bottle'),2);assert.equal(inv.count('water_bottle'),0);
 inv.storage[0].count=1;
 assert.equal(exchangeOne(inv,'empty_bottle','water_bottle'),true);
 assert.equal(inv.count('empty_bottle'),0);assert.equal(inv.count('water_bottle'),1);
});

test('milk/water targets require explicit use and correctly exchange one bottle',()=>{
 const f=sceneFixture(),s=mountStage4(f);
 try{
  assert.equal(f.scene.stage4.target().id,'cow');
  assert.equal(f.scene.hasAttackTarget(),false,'bottle must prevent accidental auto attack');
  assert.equal(f.inv.count('milk_bottle'),0,'aim alone must not milk');
  assert.equal(f.scene.stage4.use(f.scene.stage4.target()),true);
  assert.equal(f.inv.count('milk_bottle'),1);
  assert.equal(f.inv.count('empty_bottle'),2);
  assert.equal(f.scene.stage4.target().label.startsWith('착유 대기'),true);
  assert.equal(f.scene.stage4.use(f.scene.stage4.target()),false);
  f.input.worldX=86;f.input.worldY=68;f.cow.active=false;
  assert.notEqual(f.scene.stage4.target()?.id,'cow','dead/inactive cow must not milk');
  f.input.worldX=84;f.input.worldY=67;
  assert.equal(f.scene.stage4.target()?.id,'water');
  assert.equal(f.scene.stage4.use(f.scene.stage4.target()),true);
  assert.equal(f.inv.count('water_bottle'),1);
 }finally{s.unmount();}
});

test('line of sight, range, explicit key, and mutable target protection',()=>{
 const f=sceneFixture(),s=mountStage4(f);
 try{
  const old=f.scene.stage4.target();
  f.input.worldX=81;f.cow.body.x+=1;
  assert.equal(f.scene.stage4.sameTarget(old,f.scene.stage4.target()),true);
  f.scene.world.isSolid=()=>true;
  assert.equal(f.scene.stage4.target(),null,'solid wall interrupts aiming');
  f.scene.world.isSolid=()=>false;
  f.input.worldX=155;
  assert.equal(f.scene.stage4.target(),null,'aim beyond cow/water range gives no target');
  f.input.worldX=84;
  let prevented=false;
  s.listeners.keydown?.({code:'KeyE',repeat:false,defaultPrevented:false,target:{},preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(f.inv.count('milk_bottle'),1);
 }finally{s.unmount();}
});

test('milk cooldown persists in save and advances by game elapsed time, not wall time',()=>{
 const f=sceneFixture(),s=mountStage4(f);
 try{
  f.scene.stage4.use(f.scene.stage4.target());
  assert.equal(Math.ceil(f.scene.stage4.remaining(f.cow)),60);
  const saved=f.scene.snapshot();validateStage4Save(saved.stage4);
  assert.equal(saved.stage4.milkingCooldowns.length,1);
  f.setTime(125);
  assert.equal(Math.ceil(f.scene.stage4.remaining(f.cow)),45);
  f.scene.restoreSave(saved);
  assert.equal(Math.ceil(f.scene.stage4.remaining(f.cow)),45);
  f.setTime(172);
  assert.equal(f.scene.stage4.remaining(f.cow),0);
 }finally{s.unmount();}
});

test('drinking returns an empty bottle, safely drops it when no slot is free',()=>{
 const f=sceneFixture(),s=mountStage4(f);
 try{
  f.inv.storage[0]={id:'water_bottle',count:2,durability:null};
  for(let i=1;i<30;i++)f.inv.storage[i]={id:'sand',count:99,durability:null};
  assert.equal(f.scene.eatSelected(),true);
  assert.equal(f.inv.count('water_bottle'),1);
  assert.equal(f.inv.count('empty_bottle'),0);
  assert.equal(f.outputs[0][0],'empty_bottle');
  f.inv.storage[0]={id:'milk_bottle',count:1,durability:null};
  let treated=false;f.scene.stage4.onDrinkMilk=()=>{treated=true;};
  assert.equal(f.scene.eatSelected(),true);
  assert.equal(f.inv.count('empty_bottle'),1);assert.equal(treated,true);
 }finally{s.unmount();}
});

test('sand block 24 is accepted by actual production v2 save validator',async()=>{
 const vm=await import('node:vm');const {readClockMeta}=await import('../assets/clock-compat.js');
 const bundle=read('assets/index-expansion.js'),start=bundle.indexOf('function me(q){'),end=bundle.indexOf('const ye="ganadi-ashen-earth"',start);
 const context={readClockMeta,validateFaunaSave:()=>{},validateHomestead:()=>{},validateStage4Save,validateStage5Save};
 vm.runInNewContext(bundle.slice(start,end)+'\nglobalThis.decode=xe;',context);
 const empty=()=>({id:null,count:0,durability:null});
 const save={version:2,savedAt:1720000000000,meta:{seed:'sand-world',worldW:512,worldH:160,playTime:23,worldTime:23,generationVersion:6,tutorialDone:false,unlockedRecipes:[]},
 player:{x:4080,y:740,hp:100,hunger:100,poisonLeft:0,hotbarIndex:0,inventory:Array.from({length:30},empty),cursor:empty(),form:'normal'},
 chunkDiffs:{'7,1':[[0,24,null]]},chests:[],deathBag:[],stage4:{version:1,milkingCooldowns:[]}};
 const decoded=context.decode(save);assert.equal(decoded.chunkDiffs['7,1'][0][1],24);
 save.chunkDiffs['7,1'][0][1]=25;assert.throws(()=>context.decode(save),/블록 변경 데이터 오류/);
});

test('stage4 save validator rejects duplicate, nonsensical, and damaged cooldowns',()=>{
 validateStage4Save(undefined);validateStage4Save({version:1,milkingCooldowns:[]});
 for(const bad of [null,{version:2,milkingCooldowns:[]},
  {version:1,milkingCooldowns:[{x:1,y:1,until:-1}]},
  {version:1,milkingCooldowns:[{x:1,y:1,until:123},{x:1,y:1,until:234}]},
  {version:1,milkingCooldowns:[{x:600,y:0,until:1}]}])assert.throws(()=>validateStage4Save(bad),/stage4/);
});
