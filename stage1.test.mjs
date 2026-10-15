import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import {validateStage4Save} from '../assets/stage4-items.js';
import {
  readClockMeta, advanceClockThroughSleep,
  ACTIVE_GENERATION_VERSION, RESERVED_TERRAIN_GENERATION_VERSION
} from '../assets/clock-compat.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const empty = () => ({ id: null, count: 0, durability: null });
function saveFixture(version = 2) {
  const save = {
    version, savedAt: 1710000000000,
    meta: {seed: 'stage1-old-save', worldW: 512, worldH: 160,
      generationVersion: 3, playTime: 901.25, worldTime: 240.5,
      tutorialDone: true, unlockedRecipes: ['torch']},
    player: {x: 72, y: 810, hp: 100, hunger: 80, poisonLeft: 0,
      hotbarIndex: 0, inventory: Array.from({length: 30}, empty),
      cursor: empty(), form: 'normal'},
    chunkDiffs: {'2,1': [[1, 0, null]]},
    chests: [{x: 123, y: 57, slots: Array.from({length:20},empty)}],
    deathBag: [],
    fauna: {version:1,nextId:2,calm:[{id:1,x:400,y:820,health:10}]},
    homestead: {version:1,furniture:[],fuel:[],pending:[]}
  };
  save.player.inventory[0] = {id:'scrap_metal',count:9,durability:null};
  if (version === 1) {
    delete save.player.cursor;
    delete save.player.form;
  }
  return save;
}

let cachedProductionLoad;
function existingSaveFunctions() {
  if (cachedProductionLoad) return cachedProductionLoad;
  // Extract the production validator and migration; do not reimplement these.
  const bundle = read('assets/index-expansion.js');
  const start = bundle.indexOf('function me(q){');
  const end = bundle.indexOf('const ye="ganadi-ashen-earth"', start);
  assert.ok(start >= 0 && end > start, 'Production save-validation functions must be present');
  const code = bundle.slice(start, end);
  const context = {readClockMeta,
    validateFaunaSave: d => {if(d!==undefined && d.version!==1)throw Error('fauna.version');},
    validateHomestead: d => {if(d!==undefined && d.version!==1)throw Error('homestead.version');},validateStage4Save};
  vm.runInNewContext(`${code}\nglobalThis.productionLoad=xe`, context);
  return (cachedProductionLoad = context.productionLoad);
}

test('stage4 generation 6 is active; old saves still accept generation 3', () => {
  assert.equal(ACTIVE_GENERATION_VERSION, 6);
  assert.equal(RESERVED_TERRAIN_GENERATION_VERSION, 4);
  assert.throws(() => readClockMeta({...saveFixture().meta, generationVersion:7}), /generationVersion/);
});

test('older save v1 is migrated by the actual production migration to v2', () => {
  const restored = existingSaveFunctions()(saveFixture(1));
  assert.equal(restored.version,2);
  assert.equal(restored.player.form,'normal');
  assert.equal(restored.player.cursor.id, null);
  assert.equal(restored.player.inventory[0].id, 'scrap_metal');
  assert.equal(restored.meta.generationVersion,3);
});

test('existing v2 save preserves terrain, world changes, chests and calm chihuahua', () => {
  const input = saveFixture(2), restored = existingSaveFunctions()(input);
  assert.equal(restored.version, 2);
  assert.equal(restored.meta.seed, input.meta.seed);
  assert.equal(restored.player.x, input.player.x);
  assert.equal(restored.player.y, input.player.y);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.chunkDiffs)), input.chunkDiffs);
  assert.equal(restored.chests[0].slots.length,20);
  assert.equal(restored.fauna.calm[0].id,1);
  assert.equal(restored.homestead.version,1);
  const clock = readClockMeta(restored.meta);
  assert.equal(clock.worldElapsedSeconds,901.25);
  assert.equal(clock.clockSource,'legacy-estimate');
});

test('new optional clock metadata round-trips in v2 payload, without breaking legacy validator', () => {
  const save = saveFixture();
  save.meta.worldElapsedSeconds = 1874;
  save.meta.clockSource = 'tracked';
  const original = JSON.stringify(save);
  const restored = existingSaveFunctions()(JSON.parse(original));
  assert.equal(JSON.stringify(restored),original);
  assert.deepEqual(readClockMeta(restored.meta),
    {worldElapsedSeconds:1874,clockSource:'tracked',generationVersion:3});
});

test('malformed clocks, unsupported future save versions and numeric IDs are rejected', () => {
  const invalid = saveFixture();
  invalid.meta.worldElapsedSeconds = -1;
  assert.throws(() => existingSaveFunctions()(invalid),/worldElapsedSeconds/);
  const future = saveFixture(20);
  assert.throws(() => existingSaveFunctions()(future),/미래 버전/);
  const invalidBlocks = saveFixture();
  invalidBlocks.chunkDiffs['2,1'][0][1]=999;
  assert.throws(() => existingSaveFunctions()(invalidBlocks),/블록 변경 데이터 오류/);
});

function memoryIndexedDB() {
  const values=new Map();
  let opened=false;
  const database={
    objectStoreNames:{contains:name=>name==='saves'},
    createObjectStore:()=>{},
    transaction:()=>{
      const tx={pending:0,oncomplete:null,onerror:null,onabort:null};
      const enqueue=handler=>{
        const request={result:undefined,onsuccess:null,onerror:null};
        tx.pending++;
        setTimeout(()=>{
          try {handler(request); request.onsuccess?.();}
          catch(error){tx.onerror?.(error);}
          tx.pending--;
          setTimeout(()=>{if(tx.pending===0)tx.oncomplete?.();},0);
        },0);
        return request;
      };
      tx.objectStore=()=>({
        get:key=>enqueue(req=>{req.result=values.get(key);}),
        put:(data,key)=>enqueue(()=>{values.set(key,data);}),
        clear:()=>enqueue(()=>{values.clear();})
      });
      return tx;
    }
  };
  return { values,indexedDB:{open:()=>{
    const request={result:database,onupgradeneeded:null,onsuccess:null,onerror:null};
    setTimeout(()=>{if(!opened){opened=true;request.onupgradeneeded?.();}request.onsuccess?.();},0);
    return request;
  }}};
}

test('production IndexedDB repository saves and reloads legacy and stage-1 payloads', async () => {
  const code=read('assets/index-expansion.js');
  const start=code.indexOf('function me(q){');
  const end=code.indexOf('function $t(',start);
  assert.ok(start>=0 && end>start);
  const {indexedDB, values}=memoryIndexedDB();
  const context={indexedDB,readClockMeta,
    validateFaunaSave:()=>{},validateHomestead:()=>{},validateStage4Save};
  vm.runInNewContext(`${code.slice(start,end)}\nglobalThis.createRepository=()=>new ie()`,context);
  const repository=context.createRepository();
  const old=saveFixture(2);
  await repository.save(old);
  const loaded=await repository.load();
  assert.equal(loaded.version,2);
  assert.equal(loaded.player.inventory[0].id,'scrap_metal');
  assert.equal(values.get('active'),'a');
  const enhanced=structuredClone(loaded);
  enhanced.meta.worldElapsedSeconds=1377;
  enhanced.meta.clockSource='tracked';
  await repository.save(enhanced);
  const reloaded=await repository.load();
  assert.equal(reloaded.meta.worldElapsedSeconds,1377);
  assert.equal(values.get('active'),'b');
  assert.ok(values.get('a') && values.get('b'),'double-slot previous snapshot retained');
});

test('sleep advances cumulative time to dawn without changing active playTime', () => {
  assert.equal(advanceClockThroughSleep(1900, 100),2400);
  assert.equal(advanceClockThroughSleep(1900, 500),2000);
  assert.throws(() => advanceClockThroughSleep(20,600),/게임 시간 계산 오류/);
});

test('existing numeric block IDs and original item IDs remain unchanged', () => {
  const blocks=json('data/blocks.json'), ids=blocks.map(b=>b.numericId);
  assert.deepEqual(ids.slice(0,22),Array.from({length:22},(_,i)=>i+1));
  assert.equal(ids[22],23);
  const items=json('data/items.json');
  assert.ok(items.some(item=>item.id==='scrap_metal'));
  assert.ok(items.some(item=>item.id==='scrap_ore'));
});

test('seeded worker keeps the exact original v1/v2/v3 terrain hashes', async () => {
  const data = {biomes:json('data/biomes.json'),
    structures:['ruined_house','ruined_store','old_mine'].map(id=>json(`data/structures/${id}.json`))};
  const previousFetch=globalThis.fetch, previousPost=globalThis.postMessage;
  let last;
  globalThis.fetch = async url => ({ok:true,json:async()=>JSON.parse(readFileSync(fileURLToPath(url),'utf8'))});
  globalThis.postMessage=message=>{last=message;};
  try {
    await import(pathToFileURL(join(root,'assets/world.worker-expansion.js')).href);
    const known = new Map([
      [1,'337793e316c8467db85ded98afa22da184305a6be6ef719b8315cc63f4d79a84'],
      [2,'908d263ff09e2677b681653f8dcc9a38bcf0e07bb17a978cdb2b454b7e0adcb7'],
      [3,'a56304a612e8664ba6d57d0a97bec3c320e67da5620d7a2bc6ffada744b9077d']
    ]);
    for(const [generationVersion,expect] of known){
      last=null;
      await globalThis.onmessage({data:{type:'init',seed:'stage1-regression-fixed',
        blocks:json('data/blocks.json'),data:{...data,generationVersion}}});
      assert.equal(last?.type,'ready',last?.message);
      const hash=createHash('sha256').update(Buffer.from(last.world.cells.buffer)).digest('hex');
      assert.equal(hash,expect,`generation ${generationVersion} terrain was changed`);
    }
  } finally {
    globalThis.fetch=previousFetch;
    globalThis.postMessage=previousPost;
    delete globalThis.onmessage;
  }
});

test('original entrypoint, worker, mobile input and resource references are still present', () => {
  assert.match(read('index.html'),/assets\/index-expansion\.js/);
  assert.match(read('assets/index-expansion.js'),/world\.worker-expansion\.js/);
  assert.match(read('assets/index-expansion.js'),/worldElapsedSeconds:this\.worldElapsedSeconds/);
  assert.match(read('assets/homestead-runtime.js'),/advanceClockThroughSleep/);
  assert.match(read('assets/world-input-place.js'),/pointerId/);
});
