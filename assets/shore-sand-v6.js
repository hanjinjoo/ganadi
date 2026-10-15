/** Stage 4: add mineable sand beside existing lakes, only in NEW version-6 worlds.
 * This runs AFTER the v5 structures, leaving v1–v5 cell generation intact.
 */
const WIDTH = 512;
const index = (x,y) => y * WIDTH + x;
export function applyShoreSandV6(world) {
  const cells = world.cells;
  const sand = world.blocks.get('sand').numericId;
  const soil = world.blocks.get('ash_soil').numericId;
  const water = world.blocks.get('water').numericId;
  const lakes = world.v4Features?.surfaceLakes ?? [];
  const sites = [...(world.structures?.placements ?? []),...(world.stage3Features?.sites ?? [])];
  let replaced = 0;
  for (const lake of lakes) {
    for (let x=Math.max(3,lake.x-lake.radius-4); x<=Math.min(508,lake.x+lake.radius+4); x++) {
      // Sites can have tents, doors, and floors; sand must not erase them.
      if (sites.some(site => x >= site.x-2 && x <= site.x+site.width+2)) continue;
      const surface = world.heights[x];
      for (let y=Math.max(3,surface-2);y<=Math.min(155,surface+3);y++) {
        if (cells[index(x,y)] !== soil) continue;
        const nearWater = [[x-1,y],[x+1,y],[x,y-1],[x,y+1],
          [x-1,y-1],[x+1,y-1],[x-2,y],[x+2,y]].some(([xx,yy]) =>
            xx>=2 && xx<510 && yy>=0 && yy<158 && cells[index(xx,yy)]===water);
        if (!nearWater || world.noise.value(x+443,y+239) < .23) continue;
        cells[index(x,y)] = sand;
        replaced++;
      }
    }
  }
  world.v6Features = {sandCount:replaced};
  return replaced;
}
