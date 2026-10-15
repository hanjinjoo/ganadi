/** Regression: resetPlayer() must not dereference missing worker snapshot.spawn. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>readFileSync(join(root,p),'utf8');
const j=(p)=>JSON.parse(read(p));
const bundle=read('assets/index-expansion.js');
const begin=bundle.indexOf('resetPlayer(){');
const end=bundle.indexOf('update(R,B){',begin);
assert.ok(begin>0&&end>begin,'found resetPlayer() in real production game bundle');
const body=bundle.slice(begin+'resetPlayer(){'.length,end-1);
const J={worldColumns:512,worldRows:160,tile:16,playerHeight:26,spawnX:72};
const resetPlayer=new Function('J',`return function(){${body}}`)(J);
const blocks=j('data/blocks.json');
const collides=new Map(blocks.map(b=>[b.numericId,b.collision]));
const worldData={biomes:j('data/biomes.json'),structures:['ruined_house','ruined_store','old_mine'].map(id=>j(`data/structures/${id}.json`))};
let workerResult;
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(fileURLToPath(url),'utf8'))});
globalThis.postMessage=msg=>{workerResult=msg};
await import(pathToFileURL(join(root,'assets/world.worker-expansion.js')).href);
async function generate(seed,version){
 workerResult=null;
 await globalThis.onmessage({data:{type:'init',seed,blocks,data:{...worldData,generationVersion:version}}});
 assert.equal(workerResult?.type,'ready',`worker generated seed ${seed}`);
 return workerResult.world;
}
function invoke(snapshot){
 let position=null, centered=null;
 const lookup=(x,y)=>x<0||x>=512||y>=160?1:y<0?0:snapshot.cells[y*512+x];
 const scene={
  session:{snapshot},
  world:{getNumericId:lookup,isSolid:(x,y)=>collides.get(lookup(x,y))??false},
  player:{reset:(x,y)=>{position={x,y}}},
  cameras:{main:{centerOn:(x,y)=>{centered={x,y}}}},
  syncSprite(){},fallingFrom:'falling',accumulator:99,
 };
 resetPlayer.call(scene);
 assert.ok(position&&Number.isFinite(position.x)&&Number.isFinite(position.y),'player reset with valid coords');
 assert.equal(centered.x,position.x);
 if(snapshot.generationVersion>=4)assert.deepEqual(centered,position);
 assert.equal(scene.fallingFrom,null);
 return position;
}
test('missing snapshot.spawn no longer raises undefined.x and recovers safe spawn',async()=>{
 const oldWarn=console.warn;console.warn=()=>{};
 try{
  for(let k=0;k<35;k++){
   const original=await generate(`loadingfix-seed-${k}`,7);
   const without={...original};delete without.spawn;
   const pos=invoke(without);
   assert.ok(pos.x>200*16&&pos.x<310*16,`central fallback: ${pos.x}`);
   const footY=Math.round((pos.y+26)/16),col=Math.floor(pos.x/16);
   assert.equal(collides.get(without.cells[footY*512+col]),true,'solid underneath player');
   assert.equal(without.spawn,undefined,'no persistent modification to snapshot');
  }
 }finally{console.warn=oldWarn}
});
test('valid snapshot.spawn remains working; older legacy world uses unchanged fallback',async()=>{
 for(let v of [4,5,6,7]){
  const world=await generate(`existing-spawn-v${v}`,v);
  const pos=invoke(world);
  assert.ok(Math.abs(pos.x-world.spawn.x)<=32*16,'spawn remains near intended position');
 }
 const legacy=await generate('legacy-version-3',3);
 const pos=invoke(legacy);
 assert.equal(pos.x,72,'legacy spawn coordinate unchanged');
});
