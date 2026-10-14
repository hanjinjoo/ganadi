export function generateOres(cells,seed,blocks,ores,heights){
 let state=2166136261;for(const c of seed+':minerals-v2')state=Math.imul(state^c.charCodeAt(0),16777619);
 const rand=()=>{let t=state+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
 const integer=(a,b)=>a+Math.floor(rand()*(b-a+1)),stone=blocks.get('stone').numericId;
 for(const ore of ores){
  for(const key of ['minY','maxY','attempts','minSize','maxSize'])if(!Number.isInteger(ore[key])||ore[key]<0)throw Error('expansion.json: ores.'+ore.id+'.'+key);
  const id=blocks.get(ore.id).numericId;
  for(let cy=1;cy<5;cy++)for(let cx=0;cx<16;cx++){
   const lo=Math.max(cy*32,ore.minY),hi=Math.min(cy*32+31,ore.maxY);if(lo>hi)continue;
   for(let a=0;a<ore.attempts;a++){
    let x=integer(Math.max(2,cx*32),Math.min(509,cx*32+31)),y=integer(lo,hi),size=integer(ore.minSize,ore.maxSize);
    for(let n=0;n<size*5&&size>0;n++){
     const index=y*512+x;if(y>=heights[x]+5&&cells[index]===stone){cells[index]=id;size--;}
     const dir=integer(0,3);x=Math.max(2,Math.min(509,x+(dir===0?-1:dir===1?1:0)));y=Math.max(ore.minY,Math.min(ore.maxY,y+(dir===2?-1:dir===3?1:0)));
    }
   }
  }
 }
}
