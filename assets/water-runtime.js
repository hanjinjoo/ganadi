/** Finite, conserved water: eight units per tile; no infinite source spawning. */
export const WATER={capacity:8,interval:.1,budget:192,breath:10,damage:5};
export function validateWaterSave(d){
 if(d===undefined)return;
 const fail=f=>{throw Error('저장 water.'+f+' 오류');};
 if(!d||d.version!==1||!Number.isFinite(d.submerged)||d.submerged<0||d.submerged>WATER.breath||!Array.isArray(d.partial)||d.partial.length>81920)fail('형식');
 const seen=new Set();for(const p of d.partial){if(!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||p[0]<0||p[0]>=158*512||p[0]%512<2||p[0]%512>=510||!Number.isInteger(p[1])||p[1]<1||p[1]>7||seen.has(p[0]))fail('partial');seen.add(p[0]);}
}
export class FiniteWater{
 constructor(world){this.world=world;this.partial=new Map();this.queue=new Set();this.internal=false;this.phase=0;this.off=world.changed.subscribe((x,y,old,id)=>{if(this.internal)return;this.partial.delete(y*512+x);this.wake(x,y);});this.restore();}
 valid(x,y){return x>=2&&x<510&&y>=0&&y<158;}
 level(x,y){return this.valid(x,y)&&this.world.getBlock(x,y)?.id==='water'?(this.partial.get(y*512+x)??8):0;}
 empty(x,y){return this.valid(x,y)&&!this.world.getBlock(x,y);}
 space(x,y){return this.empty(x,y)?8:this.level(x,y)>0?8-this.level(x,y):0;}
 wake(x,y){for(const [dx,dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]])if(this.valid(x+dx,y+dy))this.queue.add((y+dy)*512+x+dx);}
 write(x,y,n){const i=y*512+x;this.internal=true;try{if(n)this.world.setBlock(x,y,'water');else this.world.setBlock(x,y,null);}finally{this.internal=false;}if(n>0&&n<8)this.partial.set(i,n);else this.partial.delete(i);this.wake(x,y);}
 transfer(x,y,tx,ty,n){n=Math.min(n,this.level(x,y),this.space(tx,ty));if(n<=0)return;const from=this.level(x,y),to=this.level(tx,ty);this.write(tx,ty,to+n);this.write(x,y,from-n);}
 step(budget=WATER.budget){const batch=[];for(const i of this.queue){batch.push(i);this.queue.delete(i);if(batch.length>=budget)break;}this.phase++;
  for(const i of batch){const x=i%512,y=Math.floor(i/512);if(!this.level(x,y))continue;this.transfer(x,y,x,y+1,8);if(!this.level(x,y))continue;
   for(const dx of this.phase%2?[-1,1]:[1,-1]){const diff=this.level(x,y)-this.level(x+dx,y);if(diff>=2)this.transfer(x,y,x+dx,y,Math.min(2,Math.floor(diff/2)));}
  }
 }
 restore(saved){this.partial.clear();this.queue.clear();for(const [i,n] of saved??[]){if(this.world.getBlock(i%512,Math.floor(i/512))?.id!=='water')throw Error('저장 water.partial: 물 블록 없음');this.partial.set(i,n);}for(let y=0;y<158;y++)for(let x=2;x<510;x++)if(this.level(x,y))this.wake(x,y);}
 contains(px,py){const x=Math.floor(px/16),y=Math.floor(py/16),n=this.level(x,y);return n>0&&py>=y*16+16-n*2;}
 fraction(b){let wet=0;for(const fx of [.2,.5,.8])for(const fy of [.15,.45,.75,.95])if(this.contains(b.x+b.width*fx,b.y+b.height*fy))wet++;return wet/12;}
 destroy(){this.off();}
}
export function attachWater(s){
 const fluid=new FiniteWater(s.world);let submerged=0,clock=0;const oldSnapshot=s.snapshot.bind(s),oldRestore=s.restoreSave.bind(s);
 function restore(d){validateWaterSave(d);fluid.restore(d?.partial);submerged=d?.submerged??0;}
 restore(s.session.restore?.water);
 s.snapshot=()=>({...oldSnapshot(),water:{version:1,submerged,partial:[...fluid.partial]}});
 s.restoreSave=d=>{oldRestore(d);restore(d.water);};
 const graphics=s.add.graphics().setDepth(.5),hud=document.createElement('span');hud.id='breath-status';hud.hidden=true;document.getElementById('survival-hud').append(hud);
 const step=s.player.step.bind(s.player);
 s.player.step=(dt,axis,held,pressed,speed=1,jump=1)=>{
  const b=s.player.body,wet=fluid.fraction(b);if(!wet)return step(dt,axis,held,pressed,speed,jump);
  s.fallingFrom=null;s.player.grace=0;s.player.buffer=0;
  if(s.player.knockback>0)s.player.knockback=Math.max(0,s.player.knockback-dt);else b.vx=axis*70*speed*.57;
  if(axis)s.player.facing=Math.sign(axis);
  b.vy=held||pressed?-150:Math.min(65,b.vy+170*dt);s.player.physics.move(b,dt);
 };
 // Creature AI still controls intent, hits and state. Only its movement is made buoyant.
 const physics=s.creatureAI.physics,move=physics.move.bind(physics);
 physics.move=(b,dt)=>{const fraction=fluid.fraction(b);if(fraction){b.vx*=.65;b.vy=Math.max(-90,Math.min(70,(b.vy-900*dt+(240-fraction*850)*dt)*Math.exp(-4*dt)));}move(b,dt);};
 function tick(dt){if(s.pausedByMenu||s.controls.suspended||s.homestead.sleeping)return;
  clock+=dt;if(clock>=WATER.interval){clock%=WATER.interval;fluid.step();}
  const b=s.player.body,head=fluid.contains(b.x+b.width/2,b.y+3);
  if(s.dying>0)submerged=0;else if(head){const before=submerged;submerged=Math.min(WATER.breath,submerged+dt);const harmed=Math.max(0,dt-Math.max(0,WATER.breath-before));if(harmed){s.stats.damage(harmed*WATER.damage);if(s.stats.health<=0)s.die();}}else submerged=0;
  if(fluid.fraction(b))s.fallingFrom=null;
  hud.hidden=!head||s.dying>0;hud.textContent=submerged<WATER.breath?`숨 ${Math.ceil(WATER.breath-submerged)}초 · ↑ 수영`:'숨 부족 · 체력 감소!';hud.style.color=submerged>=WATER.breath?'#ff9087':'#a9dbed';
 }
 function render(){graphics.clear();const c=s.cameras.main;for(let y=Math.max(0,Math.floor(c.scrollY/16));y<=Math.min(157,Math.ceil((c.scrollY+270)/16));y++)for(let x=Math.max(2,Math.floor(c.scrollX/16));x<=Math.min(509,Math.ceil((c.scrollX+480)/16));x++){const n=fluid.level(x,y);if(!n)continue;const top=y*16+16-n*2;graphics.fillStyle(0x39788e,.82);graphics.fillRect(x*16,top,16,n*2);graphics.fillStyle(0x87bfd0,.65);graphics.fillRect(x*16+2,top+Math.min(2,n*2-1),9,1);}}
 s.water={fluid,tick,get submerged(){return submerged;},wet:b=>fluid.fraction(b)>0};
 s.events.on('postupdate',render);s.events.once('shutdown',()=>{fluid.destroy();graphics.destroy();hud.remove();s.events.off('postupdate',render);});
}
