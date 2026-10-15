import {validateStage5Save} from '../assets/radiation-stage5.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {validateStage4Save} from '../assets/stage4-items.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const blocks=json('data/blocks.json');
const ids=Object.fromEntries(blocks.map(b=>[b.id,b.numericId]));
const workerData={biomes:json('data/biomes.json'),structures:['ruined_house','ruined_store','old_mine'].map(id=>json(`data/structures/${id}.json`))};
let message;
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(fileURLToPath(url),'utf8'))});
globalThis.postMessage=m=>{message=m;};
await import(pathToFileURL(join(root,'assets/world.worker-expansion.js')).href);
async function generate(seed,version=5){
  message=undefined;
  await globalThis.onmessage({data:{type:'init',seed,blocks,data:{...workerData,generationVersion:version}}});
  assert.equal(message?.type,'ready',`Worker error: ${seed} ${message?.message}`);
  return message.world;
}
const at=(x,y)=>y*512+x;

function verifyMine(w,seed){
  const m=w.stage3.mine;
  assert.equal(m.modules.length,6,seed+' mine modules');
  assert.equal(new Set(m.modules.map(x=>x.id)).size,6,seed+' distinct mine modules');
  assert.ok(m.modules.some(x=>x.shaft),seed+' vertical passage');
  assert.ok(m.modules.some(x=>x.y<m.modules[0].y),'upper room');
  assert.ok(m.modules.some(x=>x.y>m.modules[0].y),'lower room');
  for(const r of m.modules){assert.ok(r.x>=2&&r.x+r.w<=510&&r.y>=2&&r.y+r.h<158,seed+' bounds '+r.id)}
  const mineCrates=w.supplyOrigins.filter(o=>o.source==='mine');
  assert.ok(mineCrates.length>=3&&mineCrates.length<=5,seed+' mine crates '+mineCrates.length);
  const coords=new Set(mineCrates.map(o=>`${o.x},${o.y}`));
  for(const r of m.rewards)assert.ok(coords.has(`${r.x},${r.y}`),seed+' defined reward '+JSON.stringify(r));
  // An interior point in each horizontal room must connect to the original hall.
  const base=m.modules[0],start=[base.x+3,base.y+3];
  const pass=id=>id===0||id===ids.campfire||id===ids.water||id===ids.glow_moss;
  const seen=new Set([at(...start)]),queue=[start];
  for(let k=0;k<queue.length;k++){
    const [x,y]=queue[k];
    for(const [dx,dy] of [[0,1],[0,-1],[-1,0],[1,0]]){
      const nx=x+dx,ny=y+dy;if(nx<2||nx>=510||ny<5||ny>=157)continue;
      const id=at(nx,ny);if(seen.has(id)||!pass(w.cells[id]))continue;
      seen.add(id);queue.push([nx,ny]);
    }
  }
  for(const room of m.modules.filter(v=>['west_gallery','east_gallery','upper_store','lower_cache'].includes(v.id))){
    const center=[room.x+Math.floor(room.w/2),room.y+3];
    assert.ok(seen.has(at(...center)),`${seed} connected excavated corridor: ${room.id}`);
  }
}

test('stage 3: rare surface sites, mine modules and crates are deterministic across 30 seeds', async()=>{
  const counts=new Map();
  for(let i=0;i<30;i++){
    const seed='stage3-structure-'+i;
    const w=await generate(seed);
    verifyMine(w,seed);
    const sites=w.stage3.sites;
    assert.ok(sites.length>=2&&sites.length<=4,seed+' surface sites');
    assert.ok(new Set(sites.map(s=>s.x)).size===sites.length);
    for(const s of sites){
      counts.set(s.id,(counts.get(s.id)||0)+1);
      assert.ok(['camp','cabin','tower'].includes(s.id));
      assert.ok(Math.abs((s.x+s.width/2)-w.spawn.column)>=65,seed+' spawn spacing');
      assert.ok(!w.stage3.sites.some(other=>other!==s&&Math.abs((s.x+s.width/2)-(other.x+other.width/2))<68),seed+' site spacing');
      assert.ok(!w.structures.some(o=>o.y<90&&s.x<=o.x+o.width+13&&s.x+s.width+13>=o.x),seed+' legacy ruin overlap');
      assert.ok(!w.stage3.mine.modules.some(m=>s.x<m.x+m.w&&s.x+s.width>m.x&&s.y<m.y+m.h&&s.y+s.height>m.y),seed+' mine overlap');
    }
    assert.ok(sites.length>1);
    assert.equal(new Set(w.supplyOrigins.map(o=>`${o.x},${o.y}`)).size,w.supplyOrigins.length,'unique source coordinates');
    for(const o of w.supplyOrigins)assert.equal(w.cells[at(o.x,o.y)],ids.supply_crate,'crate physically present');
    const oldSp=w.spawn;
    assert.notEqual(w.cells[at(oldSp.column,oldSp.groundY)],ids.water);
  }
  for(const type of ['camp','cabin','tower'])assert.ok(counts.get(type)>0,'site type appears: '+type);
  const one=await generate('stage3-deterministic'),two=await generate('stage3-deterministic');
  assert.deepEqual(one.stage3,two.stage3);
  assert.deepEqual(one.supplyOrigins,two.supplyOrigins);
  assert.deepEqual(one.cells,two.cells);
});

test('stage 3: old generation v1-v3 cell hashes are unchanged',async()=>{
  const known=[
    [1,'337793e316c8467db85ded98afa22da184305a6be6ef719b8315cc63f4d79a84'],
    [2,'908d263ff09e2677b681653f8dcc9a38bcf0e07bb17a978cdb2b454b7e0adcb7'],
    [3,'a56304a612e8664ba6d57d0a97bec3c320e67da5620d7a2bc6ffada744b9077d']];
  for(const [version,hash] of known){
    const w=await generate('stage1-regression-fixed',version);
    assert.equal(createHash('sha256').update(Buffer.from(w.cells.buffer)).digest('hex'),hash);
    assert.equal(w.stage3,undefined);
  }
});

test('stage 3: v4 save-world layouts remain byte-for-byte unchanged',async()=>{
  const known=[
    ['stage1-regression-fixed','2b91653a8f8c98dc888096be6ab58c23fcb9ee4e42856995f7d03fdd79c1adda'],
    ['stage3-structure-0','99b7909e11fc8cbbb9b486cd618ee65c5e76d32e50713f22125d4bb6b4f82531'],
    ['stage3-v4-compat','9f2026b58620f5a06e599ae32c57ccae1e66a9d1b6663058f048e60d59772f86'],
    ['stress-v4-0','1bb87ac8b4a94aed8c2bca708e7157463c0d925dfd7efaae9bf91bc2b061451a']];
  for(const [seed,hash] of known){
    const w=await generate(seed,4);
    assert.equal(w.stage3,undefined);
    assert.equal(createHash('sha256').update(Buffer.from(w.cells.buffer)).digest('hex'),hash,seed);
  }
});

test('stage 3: copper retained, iron independent 10%, iron ore mines iron',()=>{
  const loot=json('data/loot_tables.json');
  const entries=loot.supply_crate.entries;
  assert.equal(entries.find(x=>x.id==='copper')?.chance,.3);
  assert.equal(entries.find(x=>x.id==='scrap_metal')?.chance,.1);
  for(const id of ['canned_beans','canned_fish','torch','wood_scrap','copper'])assert.ok(entries.some(e=>e.id===id),'kept old '+id);
  assert.equal(loot.scrap_ore.entries[0].id,'scrap_metal');
  assert.equal(blocks.find(b=>b.id==='scrap_ore').dropItem[0].id,'scrap_metal');
});

test('stage 3: actual runtime seeded reward guarded by source and one-time claim',()=>{
  const text=read('assets/index-expansion.js');
  const start=text.indexOf('class Vt{'),end=text.indexOf('class qe{',start);
  assert.ok(start>=0&&end>start,'loot RNG and class found');
  const context={};
  vm.runInNewContext(text.slice(start,end)+'\nglobalThis.makeLoot=(seed,tables,origins)=>new ke(seed,tables,origins);',context);
  const crates=[{x:123,y:75,source:'surface'},{x:42,y:113,source:'mine'}];
  const loot=json('data/loot_tables.json');
  const a=context.makeLoot('loot-check',loot,crates);
  const crate=blocks.find(b=>b.id==='supply_crate');
  const first=a.drops(crate,123,75);
  assert.ok(Array.isArray(first));
  assert.equal(a.snapshotClaims().length,1);
  assert.equal(JSON.stringify(a.drops(crate,123,75)),JSON.stringify(crate.dropItem),'same place cannot repeat');
  assert.equal(JSON.stringify(a.drops(crate,124,75)),JSON.stringify(crate.dropItem),'placed crate not rewarded');
  assert.deepEqual(Array.from(a.origins.values()).sort(),['mine','surface']);
  const b=context.makeLoot('loot-check',loot,crates);
  b.restoreClaims(a.snapshotClaims());
  assert.equal(JSON.stringify(b.drops(crate,123,75)),JSON.stringify(crate.dropItem),'reloaded claim still blocked');
  assert.equal(JSON.stringify(b.drops(crate,42,113)),JSON.stringify(a.drops(crate,42,113)),'reward is seed/position deterministic');
});

test('stage 3: old save migration infers claimed crates from damaged original terrain',()=>{
  const text=read('assets/index-expansion.js');
  const start=text.indexOf('class Vt{'),end=text.indexOf('class qe{',start);
  const context={};vm.runInNewContext(text.slice(start,end)+'\nglobalThis.makeLoot=(seed,tables,origins)=>new ke(seed,tables,origins);',context);
  const lot=context.makeLoot('old-save',json('data/loot_tables.json'),[{x:70,y:83,source:'mine'}]);
  const offset=(83%32)*32+(70%32);
  const key=`${Math.floor(70/32)},${Math.floor(83/32)}`;
  lot.restoreClaims(undefined,{[key]:[[offset,0,13]]});
  assert.deepEqual(Array.from(lot.snapshotClaims()),[83*512+70]);
  const bundle=read('assets/index-expansion.js');
  assert.match(bundle,/lootClaims:this\.mining\.loot\.snapshotClaims\(\)/);
  assert.match(bundle,/restoreClaims\(R\.lootClaims,R\.chunkDiffs\)/);
  assert.match(bundle,/lootClaims\)"/);
});

test('stage 3: real save validator accepts optional loot claims and rejects corruption',async()=>{
  const {readClockMeta}=await import('../assets/clock-compat.js');
  const bundle=read('assets/index-expansion.js');
  const start=bundle.indexOf('function me(q){');
  const end=bundle.indexOf('const ye="ganadi-ashen-earth"',start);
  assert.ok(start>=0&&end>start);
  const context={readClockMeta,validateFaunaSave:()=>{},validateHomestead:()=>{},validateStage4Save,validateStage5Save};
  vm.runInNewContext(bundle.slice(start,end)+'\nglobalThis.decodeSave=xe;',context);
  const empty=()=>({id:null,count:0,durability:null});
  const base={version:2,savedAt:1710000000000,meta:{seed:'stage3-save',worldW:512,worldH:160,generationVersion:5,playTime:120,worldTime:120,tutorialDone:false,unlockedRecipes:[]},
    player:{x:4096,y:800,hp:100,hunger:100,poisonLeft:0,hotbarIndex:0,inventory:Array.from({length:30},empty),cursor:empty(),form:'normal'},chunkDiffs:{},chests:[],deathBag:[],lootClaims:[123,456]};
  const good=context.decodeSave(structuredClone(base));
  assert.equal(good.meta.generationVersion,5);
  assert.equal(JSON.stringify(good.lootClaims),JSON.stringify([123,456]));
  const legacy=structuredClone(base);delete legacy.lootClaims;legacy.meta.generationVersion=4;
  assert.equal(context.decodeSave(legacy).lootClaims,undefined);
  for(const invalid of [[123,123],[-1],[81920],[1.5],'invalid']){
    const bad=structuredClone(base);bad.lootClaims=invalid;
    assert.throws(()=>context.decodeSave(bad),/lootClaims/);
  }
});

test('stage 3: actual seeded loot probability approximates independent 10% iron',()=>{
  const text=read('assets/index-expansion.js');
  const start=text.indexOf('class Vt{'),end=text.indexOf('class qe{',start);
  const ctx={};vm.runInNewContext(text.slice(start,end)+'\nglobalThis.makeLoot=(seed,tables,origins)=>new ke(seed,tables,origins);',ctx);
  const count=900,origins=Array.from({length:count},(_,i)=>({x:4+i%450,y:30+Math.floor(i/450),source:'surface'}));
  const loot=json('data/loot_tables.json'),crate=blocks.find(b=>b.id==='supply_crate');
  const actor=ctx.makeLoot('statistical-seed',loot,origins);
  const legacyTables=structuredClone(loot);legacyTables.supply_crate.entries.pop();
  const oldActor=ctx.makeLoot('statistical-seed',legacyTables,origins);
  let iron=0;
  for(const o of origins){
    const next=actor.drops(crate,o.x,o.y);
    const prior=oldActor.drops(crate,o.x,o.y);
    iron+=next.filter(v=>v.id==='scrap_metal').length;
    assert.equal(JSON.stringify(next.filter(v=>v.id!=='scrap_metal')),JSON.stringify(prior),'earlier loot rolls unchanged');
  }
  assert.ok(iron>60&&iron<120,`iron appears in about 10% of seeded boxes: ${iron}/${count}`);
});
