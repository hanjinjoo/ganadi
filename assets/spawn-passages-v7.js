/**
 * Generation v7: deterministic, bidirectionally walkable new-world spawn clearing.
 * Never called for generations 1–6, so saved worlds retain their original terrain.
 * Clears a small local approach (6 tiles per side); does not flatten large regions.
 */
const WIDTH = 512;
const HEIGHT = 160;
const CELL = (x,y) => y * WIDTH + x;
const CLAMP = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
const CORE = 6;
const SHOULDER = 4;

function conflicts(world, x, radius) {
  if (x-radius < 12 || x+radius > 500) return true;
  // Legacy houses/stores have no indestructible identifiers inside their cells.
  // Avoid their entire footprint instead of erasing or burying them.
  if (world.structures.placements.some(p => p.y < 95 && x+radius+2 >= p.x && x-radius-2 <= p.x+p.width-1)) return true;
  if (world.stage3Features?.sites?.some(p => x+radius+2 >= p.x && x-radius-2 <= p.x+p.width-1)) return true;
  const water=world.blocks.get('water').numericId;
  for(let col=x-radius;col<=x+radius;col++) {
    const y=world.heights[col];
    if (y < 25 || y > 100) return true;
    for(let yy=Math.max(1,y-7); yy<=Math.min(HEIGHT-3,y+2); yy++){
      if(world.cells[CELL(col,yy)]===water) return true;
    }
  }
  return false;
}

function chooseSite(world) {
  let best=null;
  for(let col=216;col<=296;col++){
    if(conflicts(world,col,CORE+SHOULDER))continue;
    const ground=world.heights[col];
    // Favor naturally even ground, proximity to the center, and fewer changes.
    let variation=0,roughness=0;
    for(let dx=-CORE-SHOULDER;dx<=CORE+SHOULDER;dx++){
      const x=col+dx;
      variation+=Math.abs(world.heights[x]-ground);
      if(dx>-(CORE+SHOULDER))roughness+=Math.max(0,Math.abs(world.heights[x]-world.heights[x-1])-1);
    }
    const score=Math.abs(col-256)*1.7+variation*.9+roughness*5;
    if(!best||score<best.score)best={col,ground,score};
  }
  if(!best)throw Error('generation v7: cannot find safe central spawn site');
  return best;
}

export function applySpawnPassagesV7(world){
  const {col,ground}=chooseSite(world);
  const original=world.heights.slice();
  const cells=world.cells;
  const soil=world.blocks.get('ash_soil').numericId;
  const rock=world.blocks.get('stone').numericId;
  const bedrock=world.blocks.get('bedrock').numericId;
  const trunk=world.blocks.get('withered_wood').numericId;
  const leaves=world.blocks.get('leaves').numericId;
  const water=world.blocks.get('water').numericId;
  let adjusted=0,cleared=0;
  for(let x=col-CORE-SHOULDER;x<=col+CORE+SHOULDER;x++){
    const distance=Math.abs(x-col);
    // A 13-tile small clearing, with four-tile shoulders into untouched terrain.
    const mix=distance<=CORE?0:(distance-CORE)/SHOULDER;
    const desired=CLAMP(Math.round(ground*(1-mix)+original[x]*mix),28,94);
    if(desired!==original[x])adjusted++;
    world.heights[x]=desired;
    // Clear the changed vertical surface, without touching deep caves/ores.
    const low=Math.min(original[x],desired);
    const high=Math.max(original[x],desired);
    for(let y=Math.max(1,low-10);y<=Math.min(107,high+5);y++){
      const pos=CELL(x,y),id=cells[pos];
      if (id===bedrock || id===water) continue;
      if(y<desired){
        // Remove obstructing vegetation around the path (not all vegetation in the biome).
        if(id===trunk || id===leaves || (y>=low-2 && y>=desired-4)){
          if(id!==0)cleared++;
          cells[pos]=0;
        }
      }else if(y<desired+4){
        cells[pos]=soil;
      }else if(y<desired+6 && y<original[x] && cells[pos]===0){
        cells[pos]=rock;
      }
    }
  }
  // Reject invalid floor after the local deformation rather than returning a bad spawn.
  for(let x=col-CORE;x<=col+CORE;x++){
    const y=world.heights[x];
    if(y!==ground || cells[CELL(x,y)]===0 || cells[CELL(x,y)]===water ||
      cells[CELL(x,y-1)]!==0 || cells[CELL(x,y-2)]!==0){
      throw Error(`generation v7: spawn corridor is not clear at x=${x}`);
    }
  }
  world.spawn={x:col*16+3,y:ground*16-26,column:col,groundY:ground};
  world.v7Spawn={column:col,groundY:ground,corridorRadius:CORE,adjustedColumns:adjusted,removedObstacles:cleared};
  return world.spawn;
}
