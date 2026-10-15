/** Regression for the real stage-4 bug: a central spawn blocked in one direction. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {ACTIVE_GENERATION_VERSION,readClockMeta} from '../assets/clock-compat.js';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>readFileSync(join(root,p),'utf8');
const json=(p)=>JSON.parse(read(p));
const blocks=json('data/blocks.json');
const data={biomes:json('data/biomes.json'),structures:['ruined_house','ruined_store','old_mine'].map(id=>json(`data/structures/${id}.json`))};
let last;
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(fileURLToPath(url),'utf8'))});
globalThis.postMessage=m=>{last=m;};
await import(pathToFileURL(join(root,'assets/world.worker-expansion.js')).href);
async function generate(seed,version){
 last=null;
 await globalThis.onmessage({data:{type:'init',seed,blocks,data:{...data,generationVersion:version}}});
 assert.equal(last?.type,'ready',`seed ${seed} generation ${version}: ${last?.message}`);
 return last.world;
}
// Exercise the real production collision/movement classes, not a no-op traversal model.
const bundle=read('assets/index-expansion.js');
const playerPhysics=bundle.slice(bundle.indexOf('class Ie{'),bundle.indexOf('class Be{'));
assert.ok(playerPhysics.startsWith('class Ie{')&&playerPhysics.includes('class Xt{'),'player movement classes located');
const J={tile:16,worldColumns:512,worldRows:160,playerWidth:10,playerHeight:26,speed:70,gravity:900,maxFall:400,jump:-260,jumpCut:-110,coyote:.08,jumpBuffer:.1,step:1/120,maxMove:8,spawnX:72,spawnY:166};
const {Ie,Xt}=new Function('J',playerPhysics+';return {Ie,Xt};')(J);
const registry=new Map(blocks.map(block=>[block.numericId,block]));
function simulateWalk(world,direction){
 const map={tileSize:16,isSolid(x,y){if(x<0||x>=512||y>=160)return true;if(y<0)return false;return registry.get(world.cells[y*512+x])?.collision??false;},getBlock(x,y){return x>=0&&x<512&&y>=0&&y<160?registry.get(world.cells[y*512+x]):undefined;}};
 const p=new Ie(new Xt(map));p.reset(world.spawn.x,world.spawn.y);
 for(let frame=0;frame<480;frame++)p.step(1/120,direction,false,false);
 return (p.body.x-world.spawn.x)*direction;
}
test('spawn patch creates v7 worlds and accepts every old generation without migration',()=>{
 assert.equal(ACTIVE_GENERATION_VERSION,7);
 for(let generationVersion=1;generationVersion<=7;generationVersion++){
  assert.equal(readClockMeta({playTime:1,generationVersion}).generationVersion,generationVersion);
 }
 assert.match(bundle,/h\?1:7/);
 assert.match(bundle,/this\.player\.reset\(R\.player\.x,R\.player\.y\)/);
});
test('v1-v6 terrain hashes remain exactly identical to the stage-5 archive',async()=>{
 const golden={
 1:'0f91379aa9bb7365e46cde786cd2d3bad944782885631adec1d87767ba774f46',
 2:'818ba88ee5fafac0cc20d25fc331a4cfa207b29c9f5fe6d40d62d3a72486a4ab',
 3:'6946386182b38476734063792f8a92008da9f1d8b8fec882617c0d4f75790db3',
 4:'b5043077dc3d531bce1499ac758a94a5204840becf9bc671a68fee907ca3075b',
 5:'d2abe0a0466dc88885a7ea935a59a28d4ad4a1c8be3da854a8150fe8013192e5',
 6:'9d574651cf4cc272b31198ed01e9dbfa2fe87cc30e4faaeba97d62049e3fbe62'
 };
 for(let version=1;version<=6;version++){
  const world=await generate('hotfix-regression-verified',version);
  assert.equal(createHash('sha256').update(Buffer.from(world.cells.buffer)).digest('hex'),golden[version],`legacy version ${version} terrain must be unchanged`);
 }
});
test('120 independent v7 seeds are genuinely walkable both directions with real player physics',async()=>{
 for(let k=0;k<120;k++){
  const seed=`stress-v7-${k}`;
  const world=await generate(seed,7);
  assert.ok(Math.abs(world.spawn.column-256)<=40,`${seed}: central starting point`);
  for(const dir of [-1,1]){
   const pixels=simulateWalk(world,dir);
   assert.ok(pixels>=90,`${seed}: ${dir===-1?'left':'right'} traveled ${pixels.toFixed(1)} px; expected >=90px`);
  }
 }
});
test('v7 keeps structures intact, repeatable seeds, legacy spawn positions untouched',async()=>{
 for(const seed of ['ganadi','new','test','stage4','stress-v7-31','stress-v7-51']){
  const previous=await generate(seed,6);
  const current=await generate(seed,7);
  const repeat=await generate(seed,7);
  assert.deepEqual(current.cells,repeat.cells);
  assert.deepEqual(current.spawn,repeat.spawn);
  assert.deepEqual(current.structures,previous.structures);
  assert.equal(previous.generationVersion,6);
  assert.equal(current.generationVersion,7);
  for(const site of previous.structures){
   for(let y=site.y;y<site.y+site.height;y++) for(let x=site.x;x<site.x+site.width;x++){
    const offset=y*512+x;
    assert.equal(current.cells[offset],previous.cells[offset],`${seed}: legacy ${site.id} structure must not be altered at (${x},${y})`);
   }
  }
 }
});
