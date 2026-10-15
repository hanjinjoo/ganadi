/**
 * Terrain generation v4, applied only to newly-created worlds.
 * Old world generation (v1–v3) remains byte-for-byte equivalent.
 * All values are determined by world seed + coordinates, not chunk load order.
 * Coordinates are tiles; smaller y is higher elevation.
 */
import { addCanopies } from './tree-generation.js';

const WIDTH = 512;
const HEIGHT = 160;
const idx = (x, y) => y * WIDTH + x;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rangeNoise = (noise, x, y) => noise.value(x, y);
const inBounds = (x, y) => x >= 2 && x < 510 && y >= 1 && y < 158;

function protectedSites(structures) {
  return structures.placements.filter(s => s.y < 90).map(s => ({
    left: s.x - 3, right: s.x + s.width + 2,
  }));
}

function footprintBlend(x, sites) {
  let amount = 1;
  for (const site of sites) {
    if (x >= site.left && x <= site.right) return 0;
    const distance = x < site.left ? site.left - x : x - site.right;
    amount = Math.min(amount, smooth(distance / 12));
  }
  return amount;
}

function chooseSurfaceLakes(world, sites) {
  const result = [];
  const count = 2 + Math.floor(world.noise.value(707, -411) * 2);
  const candidates = Array.from({ length: 15 }, (_, n) => 29 + n * 32 + Math.floor(world.noise.value(n + 81, -31) * 9));
  candidates.sort((a,b) => world.noise.value(a, -77) - world.noise.value(b, -77));
  for (const x of candidates) {
    if (Math.abs(x - 256) < 55 || result.some(lake => Math.abs(lake.x - x) < 65)) continue;
    const radius = 7 + Math.floor(world.noise.value(x, 1239) * 5);
    if (sites.some(site => x + radius + 7 >= site.left && x - radius - 7 <= site.right)) continue;
    result.push({x, radius});
    if (result.length === count) break;
  }
  return result;
}

function chooseCanyons(world) {
  const mine = world.structures.placements.filter(s => s.y >= 90);
  const result = [];
  const count = 2 + Math.floor(world.noise.value(190, -17) * 2);
  const candidates = Array.from({length: 11}, (_, i) => 25 + i * 43);
  candidates.sort((a,b)=>world.noise.value(a, -500) - world.noise.value(b, -500));
  for (const x of candidates) {
    if (result.some(c => Math.abs(c.x - x) < 85)) continue;
    // The legacy mine is an actual structure; never destroy its cells.
    if (mine.some(s => x >= s.x - 38 && x <= s.x + s.width + 38)) continue;
    result.push({x, width: 7 + Math.floor(world.noise.value(x, 89) * 5),
      angle: (world.noise.value(x, 82) - .5) * .42,
      top: 99 + Math.floor(world.noise.value(x, 91) * 6),
      bottom: 149 + Math.floor(world.noise.value(x, 92) * 6)});
    if (result.length === count) break;
  }
  return result;
}

function carveCanyons(world, canyonLocations, water, plank) {
  const cells = world.cells;
  for (const c of canyonLocations) {
    for (let y = c.top; y <= Math.min(155, c.bottom); y++) {
      const center = c.x + (y - 124) * c.angle + Math.sin(y * .12 + c.x) * 2.4;
      const halfWidth = c.width + 2 * Math.sin((y - c.top) * .13 + c.x);
      const taper = Math.min(1, Math.max(.22, (y - c.top + 1) / 8), Math.max(.3, (c.bottom - y + 1) / 8));
      const width = Math.max(3, Math.round(halfWidth * taper));
      for (let x = Math.max(2, Math.floor(center - width)); x <= Math.min(509, Math.ceil(center + width)); x++) {
        if (Math.abs(x-center) > width) continue;
        if (cells[idx(x,y)] !== world.blocks.get('bedrock').numericId) cells[idx(x,y)] = 0;
      }
      // A few narrow natural ledges allow players to arrest a fall or build a bridge.
      if (y > c.top + 8 && y < c.bottom - 6 && (y - c.top) % 13 === 0) {
        const leftSide = world.noise.value(c.x, y) > .5;
        const start = Math.round(center + (leftSide ? -width : width - 3));
        for (let x = start; x < start + 3; x++) if (inBounds(x,y)) cells[idx(x,y)] = world.blocks.get('stone').numericId;
      }
    }
    // Broken crossing at one elevation, with a gap the player must repair.
    const crossing = c.top + 17;
    const crossingCenter = Math.round(c.x + (crossing - 124) * c.angle);
    for (let dx = -c.width-2; dx <= c.width+2; dx++) {
      const x = crossingCenter + dx;
      if (inBounds(x,crossing) && Math.abs(dx) >= 3 && Math.abs(dx) <= c.width)
        cells[idx(x,crossing)] = plank;
    }
    if (world.noise.value(c.x, -921) < .75) {
      const bottom = Math.min(155,c.bottom);
      const center = Math.round(c.x + (bottom - 124) * c.angle);
      for (let y = bottom-3; y <= bottom; y++) {
        for (let x = center-5; x <= center+5; x++) {
          if (!inBounds(x,y) || Math.abs(x-center) > 5 - Math.max(0,y-(bottom-2))) continue;
          if (cells[idx(x,y)] === 0) cells[idx(x,y)] = water;
        }
      }
    }
  }
}

function placeCavePools(world, water, canyons) {
  const cells = world.cells;
  const mine = world.structures.placements.filter(s => s.y >= 90);
  const used = [];
  for (let i = 0; i < 16 && used.length < 5; i++) {
    const x = 16 + Math.floor(world.noise.value(i, 1001) * 480);
    const y = 78 + Math.floor(world.noise.value(i, 1002) * 64);
    const radius = 5 + Math.floor(world.noise.value(i, 1003) * 8);
    if (used.some(u => Math.abs(x-u.x) < 35 && Math.abs(y-u.y) < 20)) continue;
    if (mine.some(m=> x + radius + 3 >= m.x && x-radius-3 <= m.x+m.width && y+7 >= m.y && y-6 <= m.y+m.height)) continue;
    if (canyons.some(c => Math.abs(c.x - x) < c.width + radius + 5)) continue;
    used.push({x,y,radius});
    // Natural cave cavity with submerged basin, surrounded by supporting rock.
    const waterLine = y+2;
    for(let dx=-radius; dx<=radius; dx++) {
      const tx=x+dx;
      if(tx<2||tx>=510)continue;
      const profile=Math.sqrt(Math.max(0,1-(dx/radius)**2));
      const ceiling=y-Math.round(3*profile);
      const floor=y+3+Math.round(3*profile);
      for(let ty=ceiling;ty<floor;ty++) if(inBounds(tx,ty)) cells[idx(tx,ty)]= ty>=waterLine ? water : 0;
    }
    // Leave a narrow dry lip beside the water to prevent unavoidable submersion.
    for(const side of [-1,1]) {
      const tx=x+side*(radius+1);
      if(inBounds(tx,y+2)) cells[idx(tx,y+2)]=world.blocks.get('stone').numericId;
    }
  }
  return used;
}

function pickSpawn(world, lakes) {
  const height = world.heights;
  const cells = world.cells;
  const water = world.blocks.get('water').numericId;
  for (let dist = 0; dist <= 46; dist++) {
    for (const column of dist ? [256-dist,256+dist] : [256]) {
      if(column < 12 || column > 498) continue;
      const y = height[column];
      if(lakes.some(l=>Math.abs(column-l.x) < l.radius+3))continue;
      if(Math.abs(height[column-1]-y)>1 || Math.abs(height[column+1]-y)>1)continue;
      let safe=true;
      for(const x of [column,column+1]) {
        if(cells[idx(x,y)]===0 || cells[idx(x,y)]===water) safe=false;
        for(let yy=y-3;yy<y;yy++) if(cells[idx(x,yy)]!==0)safe=false;
      }
      if(safe) return {x:column*16+3,y:y*16-26,column,groundY:y};
    }
  }
  throw new Error('generation v4: safe central spawn could not be found');
}

export function applyTerrainV4(world) {
  const height=world.heights;
  const cells=world.cells;
  const noise=world.noise;
  const t=id=>world.blocks.get(id).numericId;
  const soil=t('ash_soil'), rock=t('stone'), rubble=t('rubble'), trunk=t('withered_wood'), leaves=t('leaves');
  const water=t('water');
  const old=height.slice();
  const sites=protectedSites(world.structures);
  const lakes=chooseSurfaceLakes(world,sites);
  for(let x=2;x<510;x++) {
    const base=55 + noise.fbm1(x/78,3)*13 + noise.fbm1((x+30)/31,3)*4;
    // Isolated steps, not sawtooth walls, tapered into adjacent terrain.
    const mesa=smooth((x-147)/8)-smooth((x-199)/11);
    let desired=clamp(Math.round(base - mesa*8),43,74);
    for(const lake of lakes) {
      const d=Math.abs(x-lake.x);
      if(d<=lake.radius+3) desired+=Math.round(12*(1-smooth(d/(lake.radius+3))));
    }
    const blend=footprintBlend(x,sites);
    height[x]=clamp(Math.round(old[x]*(1-blend)+desired*blend),42,82);
  }
  // Replace only the near-surface 0..90 band. The deep mine and ores are untouched.
  for(let x=2;x<510;x++){
    if(footprintBlend(x,sites)===0)continue;
    const ground=height[x];
    for(let y=28;y<Math.min(91,Math.max(ground+11,old[x]+11));y++) {
      const at=idx(x,y);
      if(y<ground) cells[at]=0;
      else if(y<ground+4) cells[at]=soil;
      else if(y<Math.max(ground,old[x])+9) cells[at]=noise.value(x,y+700)<.29?rubble:rock;
      // Below the affected near-surface band, retain older caves and ores.
    }
  }
  // Surface lakes sit in basins: water reaches a constant waterline but never floats.
  for(const lake of lakes){
    const waterline=Math.min(height[lake.x-lake.radius],height[lake.x+lake.radius])+1;
    for(let x=lake.x-lake.radius;x<=lake.x+lake.radius;x++){
      if(x<2||x>=510)continue;
      for(let y=waterline;y<height[x];y++) if(inBounds(x,y) && cells[idx(x,y)]===0)cells[idx(x,y)]=water;
    }
  }
  // Replace canopy lost by near-surface deformation, preserve original biome density.
  for(let x=4;x<507;x++) {
    if(sites.some(site=>x>=site.left-4&&x<=site.right+4))continue;
    if(lakes.some(lake=>Math.abs(x-lake.x)<=lake.radius+3))continue;
    if(noise.value(x,-99)>=world.biome(x,0).treeDensity)continue;
    const tall=3+Math.floor(noise.value(x,-100)*4);
    for(let dy=1;dy<=tall;dy++) {let y=height[x]-dy; if(y>1 && cells[idx(x,y)]===0)cells[idx(x,y)]=trunk;}
  }
  addCanopies(cells,height,noise,world.structures,leaves);
  const canyons=chooseCanyons(world);
  carveCanyons(world,canyons,water,t('plank'));
  const pools=placeCavePools(world,water,canyons);
  const spawn=pickSpawn(world,lakes);
  world.spawn=spawn;
  world.v4Features={surfaceLakes:lakes,canyons,undergroundPools:pools};
  return {spawn,lakes,canyons,pools};
}
