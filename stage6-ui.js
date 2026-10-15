/** Stage 6: Pure interaction identity / responsive touch-button positioning.
 * No extra buttons, global pointer handlers or gameplay rules.
 */
export function sameContextTarget(a,b,sameStage4=()=>false){
 if(!a||!b||a.id!==b.id)return false;
 if(a.stage4||b.stage4)return !!(a.stage4&&b.stage4&&sameStage4(a,b));
 // Never feed a different Chihuahua which moved under the finger mid-press.
 if(a.id==='chihuahua')return !!(a.entity&&a.entity===b.entity&&a.x===b.x&&a.y===b.y);
 return a.x===b.x&&a.y===b.y;
}
const intersects=(a,b,gap=0)=>a.x<b.x+b.width+gap && a.x+a.width+gap>b.x &&
 a.y<b.y+b.height+gap && a.y+a.height+gap>b.y;
/** Returns null rather than obscuring movement/jump/aim controls on cramped screens. */
export function contextButtonPosition(pad,viewport,blocked=[],width=80,height=48){
 const gap=8,edge=4;
 if(!pad||viewport.width<width+edge*2||viewport.height<height+edge*2)return null;
 const mx=pad.left+pad.width/2,my=pad.top+pad.height/2;
 const options=[
  [pad.left-width-gap,my-height/2],
  [pad.left-width-gap,pad.top],
  [pad.left-width-gap,pad.bottom-height],
  [pad.right+gap,my-height/2],
  [pad.left+(pad.width-width)/2,pad.top-height-gap],
  [pad.left+(pad.width-width)/2,pad.bottom+gap],
 ];
 const padBox={x:pad.left,y:pad.top,width:pad.width,height:pad.height};
 for(const [x,y] of options){
  if(x<edge||y<edge||x+width>viewport.width-edge||y+height>viewport.height-edge)continue;
  const box={x,y,width,height};
  if(intersects(box,padBox,3)||blocked.some(rect=>intersects(box,rect,2)))continue;
  return {left:Math.round(x),top:Math.round(y)};
 }
 return null;
}
