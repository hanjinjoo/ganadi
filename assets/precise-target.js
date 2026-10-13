// Aimed actions select one exact target. Occupied cells always belong to mining/interactions.
export function aimedCreature(scene){
 const input=scene.worldInput,x=input.worldX,y=input.worldY;
 if(!input.aiming||input.building||scene.world.getBlock(Math.floor(x/16),Math.floor(y/16)))return null;
 const p=scene.player.body,px=p.x+p.width/2,py=p.y+p.height/2;
 const targets=scene.creatures.active.filter(c=>c.active&&c.state!=='Dead'&&x>=c.body.x&&x<c.body.x+c.body.width&&y>=c.body.y&&y<c.body.y+c.body.height);
 targets.sort((a,b)=>Math.hypot(a.cx-x,a.cy-y)-Math.hypot(b.cx-x,b.cy-y));
 for(const c of targets){
  if((c.cx-px)*scene.player.facing<0||Math.abs(c.cx-px)>=44||Math.abs(c.cy-py)>=26)continue;
  const steps=Math.ceil(Math.hypot(x-px,y-py)/2);let blocked=false;
  for(let i=1;i<=steps;i++){const block=scene.world.getBlock(Math.floor((px+(x-px)*i/steps)/16),Math.floor((py+(y-py)*i/steps)/16));if(block?.collision){blocked=true;break;}}
  if(!blocked)return c;
 }
 return null;
}
