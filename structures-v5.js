/**
 * Stage 3 additions for generationVersion=4 only.
 * All positions derive solely from the seed/terrain; no per-chunk randomness.
 * Preserves legacy structure templates and numeric IDs.
 */
const WIDTH=512, HEIGHT=160;
const at=(x,y)=>y*WIDTH+x;
const inside=(x,y)=>x>=2&&x<510&&y>=2&&y<158;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function mineComplex(world) {
  const mine=world.structures.placements.find(p=>p.id==='old_mine');
  if(!mine)throw Error('stage3: old_mine placement missing');
  const {x,y}=mine;
  // Six distinct modules, including the existing original chamber.
  const modules=[
    {id:'original',x,y,w:20,h:8,existing:true},
    {id:'west_gallery',x:x-15,y,w:15,h:8},
    {id:'east_gallery',x:x+20,y,w:16,h:8},
    {id:'east_shaft',x:x+26,y:y-8,w:6,h:8,shaft:true},
    {id:'upper_store',x:x+20,y:y-15,w:17,h:8},
    {id:'lower_cache',x:x-15,y:y+8,w:15,h:8}
  ];
  if(modules.some(r=>r.x<2||r.x+r.w>510||r.y<25||r.y+r.h>157))throw Error('stage3: mine module crosses world bedrock');
  const cells=world.cells, block=id=>world.blocks.get(id).numericId;
  const rock=block('rubble'), stone=block('stone'), plank=block('plank'), wood=block('withered_wood'), crate=block('supply_crate');
  const put=(px,py,id)=>{if(inside(px,py))cells[at(px,py)]=id};
  // Rooms are carved exactly once in the global world before chunk slicing.
  for(const r of modules){
    if(r.existing)continue;
    for(let xx=r.x;xx<r.x+r.w;xx++)for(let yy=r.y;yy<r.y+r.h;yy++){
      const outer=xx===r.x||xx===r.x+r.w-1||yy===r.y||yy===r.y+r.h-1;
      put(xx,yy,outer?(yy===r.y+r.h-1?plank:rock):0);
    }
    if(!r.shaft){
      for(let xx=r.x+2;xx<r.x+r.w-2;xx+=6)for(let yy=r.y+1;yy<r.y+r.h-1;yy++){
        if(yy===r.y+1||yy===r.y+r.h-2)put(xx,yy,wood);
      }
      // A few scattered obstructions: all can be mined, never the whole passage.
      if(r.id==='west_gallery')put(r.x+5,r.y+r.h-2,rock);
      if(r.id==='east_gallery')put(r.x+11,r.y+r.h-2,stone);
    } else {
      // Alternating short ledges turn a vertical shaft into a climbable route.
      for(let level=r.y+2,k=0;level<r.y+r.h-1;level+=3,k++){
        const start=k%2===0?r.x+1:r.x+r.w-3;
        for(let dx=0;dx<2;dx++)put(start+dx,level,plank);
      }
    }
  }
  // Open doorways into the original hall; do not overwrite its reward crates.
  for(let yy=y+2;yy<=y+5;yy++){
    put(x-1,yy,0);put(x,yy,0);
    put(x+19,yy,0);put(x+20,yy,0);
  }
  // Cut walkable gaps through two floor-to-ceiling legacy support posts.
  // Keep their upper/lower ends to retain the old mine appearance.
  for(const support of [x+9,x+17])for(const yy of [y+3,y+4])put(support,yy,0);
  // West-gallery floor to lower cache: staggered steps, not a fatal blind drop.
  for(let xx=x-11;xx<=x-8;xx++)for(let yy=y+7;yy<=y+9;yy++)put(xx,yy,0);
  for(let k=0;k<3;k++)for(let dx=0;dx<2;dx++)put(x-13+(k%2)*5+dx,y+10+k*2,plank);
  // Right gallery to upper storage, a staggered set of ledges.
  for(let yy=y-15;yy<=y+2;yy++)for(let xx=x+28;xx<=x+29;xx++)put(xx,yy,0);
  for(let yy=y-12,k=0;yy<=y-1;yy+=3,k++){
    const px=k%2?x+27:x+30;
    for(let dx=0;dx<2;dx++)put(px+dx,yy,plank);
  }
  // Connect upper storage to shaft through floor opening and right hall through ceiling.
  for(let xx=x+27;xx<=x+30;xx++){put(xx,y-8,0);put(xx,y,0)}
  const rewards=[
    {x:x+5,y:y+6}, {x:x+14,y:y+6}, // actual original mine rewards: verified from template in tests
    {x:x+23,y:y-10}, // upper storage
    {x:x-6,y:y+13} // lower cache
  ];
  // Original crates already occupy coordinates; only add crates in the new rooms.
  for(const r of rewards.slice(2))put(r.x,r.y,crate);
  return {modules,rewards, bounds:{x:x-15,y:y-15,w:52,h:31}};
}

const SITES={
  camp:{w:13,h:5}, cabin:{w:15,h:8}, tower:{w:11,h:15}
};
function chooseSites(world){
  const lakes=world.v4Features.surfaceLakes;
  const built=world.structures.placements.filter(p=>p.y<90);
  const spawn=world.spawn.column;
  const target=2+Math.floor(world.noise.value(873,-994)*3);
  const candidates=Array.from({length:70},(_,i)=>20+i*7);
  candidates.sort((a,b)=>world.noise.value(a,-172)-world.noise.value(b,-172));
  const sites=[];
  for(const x of candidates){
    const type=['camp','cabin','tower'][(sites.length+Math.floor(world.noise.value(x,-244)*3))%3];
    const {w,h}=SITES[type];
    const center=x+w/2;
    if(Math.abs(center-spawn)<65||sites.some(s=>Math.abs(center-(s.x+s.width/2))<68))continue;
    if(built.some(p=>x<=p.x+p.width+13&&x+w+13>=p.x))continue;
    if(lakes.some(p=>Math.abs(center-p.x)<p.radius+w/2+12))continue;
    const sample=Array.from({length:w+6},(_,i)=>world.heights[x+i-3]);
    if(Math.max(...sample)-Math.min(...sample)>13)continue;
    if(x<8||x+w>502)continue;
    const ground=Math.round(sample.slice(3,3+w).reduce((a,b)=>a+b,0)/w);
    if(ground-h<12||ground+2>90)continue;
    sites.push({id:type,x,y:ground-h+1,width:w,height:h,ground});
    if(sites.length===target)break;
  }
  if(sites.length<2)throw Error(`stage3: insufficient rare surface sites (${sites.length})`);
  return sites.sort((a,b)=>a.x-b.x);
}

function placeSite(world,site){
  const {x,width:w,height:h,ground:g,id}=site;
  const cells=world.cells,t=name=>world.blocks.get(name).numericId;
  const soil=t('ash_soil'),rock=t('rubble'),wood=t('withered_wood'),plank=t('plank'),fire=t('campfire'),crate=t('supply_crate');
  const put=(px,py,id)=>{if(inside(px,py))cells[at(px,py)]=id};
  // Only reshape the structure's small footprint; avoid a global flat strip.
  for(let px=x;px<x+w;px++){
    world.heights[px]=g;
    for(let py=g-h-3;py<g;py++)put(px,py,0);
    put(px,g,soil);
    for(let py=g+1;py<=g+3;py++)put(px,py,py===g+1?soil:rock);
  }
  const floor=g-1;
  if(id==='camp'){
    for(let dx=1;dx<w-1;dx++)put(x+dx,floor,dx%4===0?plank:0);
    for(const dx of [1,w-2])for(let dy=2;dy<=3;dy++)put(x+dx,g-dy,wood);
    put(x+Math.floor(w/2),floor,fire);
    // Supply boxes are not guaranteed at special surface locations.
  }else if(id==='cabin'){
    for(let dx=1;dx<w-1;dx++)put(x+dx,g,plank);
    for(let dy=1;dy<=h-1;dy++){
      put(x,g-dy,wood);
      put(x+w-1,g-dy,wood);
    }
    for(let dx=0;dx<w;dx++)put(x+dx,g-h+1,plank);
    // Door on the right wall uses the established two-block bottom/top IDs.
    put(x+w-1,g-1,t('door'));
    put(x+w-1,g-2,t('door_top'));
    if(world.noise.value(x,-838)<.33)put(x+4,floor,crate);
  }else{
    // Broken tower: open gaps prevent it from becoming a perfectly sealed refuge.
    for(let dx=1;dx<w-1;dx++)put(x+dx,g,rock);
    for(let dy=1;dy<h;dy++){
      if(dy%5!==2)put(x,g-dy,rock);
      if(dy%4!==1)put(x+w-1,g-dy,rock);
    }
    for(const dy of [3,6,9,12]){
      const left=dy%2===0?1:Math.floor(w/2);
      for(let dx=left;dx<Math.min(w-1,left+Math.floor(w/2));dx++)put(x+dx,g-dy,plank);
    }
    for(let dx=0;dx<w;dx++)if(dx%4!==2)put(x+dx,g-h+1,rock);
    if(world.noise.value(x,-839)<.32)put(x+3,g-7,crate);
  }
}

export function applyStructuresV4(world){
  const mine=mineComplex(world);
  const sites=chooseSites(world);
  for(const site of sites)placeSite(world,site);
  world.stage3Features={mine,sites};
  return world.stage3Features;
}

export function supplyOrigins(world){
  const out=[];
  const crate=world.blocks.get('supply_crate').numericId;
  const mine=world.structures.placements.find(p=>p.id==='old_mine');
  const region=world.stage3Features?.mine.bounds??{x:mine.x,y:mine.y,w:mine.width,h:mine.height};
  for(let y=2;y<158;y++)for(let x=2;x<510;x++)if(world.cells[at(x,y)]===crate){
    const source=x>=region.x&&x<region.x+region.w&&y>=region.y&&y<region.y+region.h?'mine':'surface';
    out.push({x,y,source});
  }
  return out;
}
