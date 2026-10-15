import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {ACTIVE_GENERATION_VERSION} from '../assets/clock-compat.js';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>readFileSync(join(root,p),'utf8');
const j=(p)=>JSON.parse(read(p));
const block=j('data/blocks.json');
const data={biomes:j('data/biomes.json'),structures:['ruined_house','ruined_store','old_mine'].map(id=>j(`data/structures/${id}.json`))};
const water=block.find(b=>b.id==='water').numericId;
const previousFetch=globalThis.fetch,previousPost=globalThis.postMessage;
let last;
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(fileURLToPath(url),'utf8'))});
globalThis.postMessage=(message)=>{last=message;};
await import(pathToFileURL(join(root,'assets/world.worker-expansion.js')).href);
async function generate(seed,version=4){
 last=null;
 await globalThis.onmessage({data:{type:'init',seed,blocks:block,data:{...data,generationVersion:version}}});
 assert.equal(last?.type,'ready',`Worker ${version}: ${last?.message}`);
 return last.world;
}

test('v4 remains supported; water appended after immutable v1-v3 block IDs',()=>{
 assert.equal(ACTIVE_GENERATION_VERSION,7);
 assert.deepEqual(block.slice(0,22).map(b=>b.numericId),Array.from({length:22},(_,i)=>i+1));
 assert.equal(water,23);
 assert.equal(block[22].collision,false);
});

test('v4 seed determinism and safe central surface spawn',async()=>{
 for(const seed of ['v4-determinism','spawn-a','spawn-b','spawn-c']){
  const one=await generate(seed),two=await generate(seed);
  assert.deepEqual(one.cells,two.cells);
  assert.deepEqual(one.heights,two.heights);
  assert.deepEqual(one.spawn,two.spawn);
  assert.equal(one.generationVersion,4);
  assert.ok(Math.abs(one.spawn.column-256)<=46,seed);
  assert.ok(one.spawn.column>60&&one.spawn.column<450);
  const {column:cx,groundY:gy}=one.spawn;
  for(let x=cx;x<=cx+1;x++){
   assert.ok(one.cells[gy*512+x]!==0 && one.cells[gy*512+x]!==water,'solid footing');
   for(let y=gy-3;y<gy;y++)assert.equal(one.cells[y*512+x],0,'body in air');
  }
 }
});

test('v4 generates canyon cavities with ledges, multiple surface lakes, cave water without bedrock breach',async()=>{
 for(const seed of ['canyon-one','canyon-two','canyon-three']){
  const world=await generate(seed);
  const cells=world.cells;
  const countWater=cells.reduce((sum,id)=>sum+(id===water),0);
  assert.ok(countWater>25,seed+' water generated '+countWater);
  assert.ok(Array.from({length:512},(_,x)=>x).some(x=>{
   const top=world.heights[x];return x>5&&x<506&&Array.from({length:14},(_,n)=>cells[(top-n)*512+x]).includes(water);
  }),seed+' surface lake exists');
  assert.ok(Array.from({length:512},(_,x)=>x).some(x=>x>5&&x<506&&cells[120*512+x]===0),seed+' underground openness');
  for(let y=0;y<160;y++)for(let x of [0,1,510,511])assert.equal(cells[y*512+x],1,'edge bedrock');
  for(let y of [158,159])for(let x=0;x<512;x++)assert.equal(cells[y*512+x],1,'bottom bedrock');
  assert.ok(world.structures.some(s=>s.id==='old_mine'),'mine preserved');
 }
});

test('v1-v3 exact cell hashes and legacy spawn remain unchanged',async()=>{
 const known=new Map([
 [1,'337793e316c8467db85ded98afa22da184305a6be6ef719b8315cc63f4d79a84'],
 [2,'908d263ff09e2677b681653f8dcc9a38bcf0e07bb17a978cdb2b454b7e0adcb7'],
 [3,'a56304a612e8664ba6d57d0a97bec3c320e67da5620d7a2bc6ffada744b9077d']]);
 for(const [version,expected] of known){
  const world=await generate('stage1-regression-fixed',version);
  assert.equal(createHash('sha256').update(Buffer.from(world.cells.buffer)).digest('hex'),expected);
  assert.equal(world.spawn,undefined);
 }
});

test('main thread registers v4 water, preserves input and routes new-world version correctly',()=>{
 const main=read('assets/index-expansion.js');
 assert.match(main,/h\?1:7/);
 assert.match(main,/"bed_foot","water"/);
 assert.match(main,/const home=this\.session\.snapshot\.spawn/);
 assert.match(main,/const wet=this\.physics\.map\.getBlock/);
 assert.match(read('assets/world-input-place.js'),/pointerId/);
});

test('v4 generated terrain remains playable across 40 independently seeded worlds',async()=>{
 for(let k=0;k<40;k++){
  const world=await generate(`stress-v4-${k}`);
  const cells=world.cells;
  const waterXs=[];
  for(let x=2;x<510;x++){
   for(let y=Math.max(1,world.heights[x]-17);y<=world.heights[x];y++){
    if(cells[y*512+x]===water){waterXs.push(x);break;}
   }
  }
  let groups=0,prev=-100;
  for(const x of waterXs){if(x-prev>1)groups++;prev=x;}
  assert.ok(groups>=2,`seed stress-v4-${k}: 2+ surface water regions (${groups})`);
  assert.ok(Math.abs(world.spawn.column-256)<=46,`seed ${k} safe spawn`);
  const {column,groundY}=world.spawn;
  for(const x of [column,column+1]) {
   assert.ok(cells[groundY*512+x]!==water&&cells[groundY*512+x]!==0,`seed ${k} spawn floor`);
   assert.equal(cells[(groundY-1)*512+x],0,`seed ${k} spawn headroom`);
  }
 }
});
