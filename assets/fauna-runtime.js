import {lineClear,distance} from './melee.js';
const r=await fetch(new URL('../data/fauna.json',import.meta.url));if(!r.ok)throw Error('fauna.json: HTTP '+r.status);const config=await r.json();
if(!Number.isFinite(config.feed?.range)||config.feed.range<=0||config.feed.count!==1||!Array.isArray(config.feed.meats)||!config.feed.meats.length||config.feed.meats.some(v=>typeof v!=='string'))throw Error('fauna.json: feed.range/count/meats invalid');
export function validateFaunaSave(data){if(data===undefined)return;if(!data||data.version!==1||!Number.isSafeInteger(data.nextId)||data.nextId<1||!Array.isArray(data.calm))throw Error('저장 fauna 형식 오류');const seen=new Set();for(const c of data.calm){if(!c||!Number.isSafeInteger(c.id)||c.id<1||c.id>=data.nextId||seen.has(c.id)||!Number.isFinite(c.x)||c.x<32||c.x>8148||!Number.isFinite(c.y)||c.y<0||c.y>2516||!Number.isFinite(c.health)||c.health<=0||c.health>10)throw Error('저장 fauna.calm 치와와 상태 오류');seen.add(c.id);}}
export function attachFauna(s){
 const defs=s.registry.get('creatures'),wild=defs.find(d=>d.id==='chihuahua'),peaceful={...wild,behavior:'passive',detectRange:0,attack:0,fleeHpRatio:.2},records=new Map(),manager=s.creatures,input=s.worldInput;let nextId=1,age=0;
 for(const id of config.feed.meats)s.inventory.registry.get(id);
 const spawn=manager.spawn.bind(manager),release=manager.release.bind(manager),snapshot=s.snapshot.bind(s),restoreSave=s.restoreSave.bind(s);
 function record(c){return {id:c.calmId,x:c.body.x,y:c.body.y,health:c.health};}
 manager.spawn=(def,x,y)=>{const c=spawn(def,x,y);if(c)c.calmId=null;return c;};
 manager.release=c=>{if(c.calmId){if(c.health>0&&c.state!=='Dead')records.set(c.calmId,record(c));else records.delete(c.calmId);c.calmId=null;}release(c);};
 function sync(){for(const c of manager.entities)if(c.active&&c.calmId){if(c.health>0&&c.state!=='Dead')records.set(c.calmId,record(c));else records.delete(c.calmId);}}
 function restore(data){validateFaunaSave(data);for(const c of manager.entities)if(c.calmId){c.calmId=null;release(c);}records.clear();nextId=data?.nextId??1;for(const c of data?.calm??[])records.set(c.id,{...c});wake();}
 function wake(){const b=s.player.body;for(const r of records.values()){if(manager.entities.some(c=>c.active&&c.calmId===r.id)||Math.hypot(r.x-b.x,r.y-b.y)>300)continue;const c=manager.spawn(peaceful,r.x,r.y+peaceful.height-12);if(c){c.calmId=r.id;c.health=r.health;c.state='Idle';}}}
 s.snapshot=()=>{sync();return {...snapshot(),fauna:{version:1,nextId,calm:[...records.values()].map(c=>({...c}))}};};s.restoreSave=data=>{restoreSave(data);restore(data.fauna);};restore(s.session.restore?.fauna);
 function aimed(){
  if(input.disabled||s.pausedByMenu||s.inventoryUI.opened||s.dying>0||s.homestead.sleeping||!input.aiming||s.world.getBlock(Math.floor(input.worldX/16),Math.floor(input.worldY/16)))return null;
  const b=s.player.body;return manager.entities.find(c=>c.active&&c.state!=='Dead'&&c.definition.id==='chihuahua'&&!c.calmId&&input.worldX>=c.body.x&&input.worldX<c.body.x+c.body.width&&input.worldY>=c.body.y&&input.worldY<c.body.y+c.body.height&&distance(b,c.body)<=config.feed.range&&lineClear(s.world,b.x+b.width/2,b.y+b.height/2,input.worldX,input.worldY))??null;
 }
 function meat(){const id=s.inventory.slot(s.inventory.selected).id;return config.feed.meats.includes(id)&&s.inventory.count(id)>0?id:config.feed.meats.find(id=>s.inventory.count(id)>0);}
 function feed(expected=null){const c=aimed();if(!c||(expected&&c!==expected))return false;const id=meat();input.clear();s.controls.clear();s.mining.reset();s.attackRequested=false;if(!id){s.toast('고기가 필요합니다 · 생고기와 구운 고기를 줄 수 있어요');return true;}if(!s.inventory.remove(id,1))return false;c.calmId=nextId++;c.definition=peaceful;c.state='Idle';c.stateTime=0;c.attackTimer=1.2;c.knockback=0;c.body.vx=0;records.set(c.calmId,record(c));s.toast('치와와가 마음을 놓았어요 · 이제 물지 않습니다');return true;}
 const oldTarget=s.homestead.target,oldUse=s.homestead.use,oldInteract=input.onInteract;
 s.homestead.target=(x,y)=>{const c=aimed();return c?{id:'chihuahua',x,y,custom:true,entity:c,label:meat()?'고기 주기':'고기 필요'}:oldTarget(x,y);};
 s.homestead.use=(x,y,expected=null)=>aimed()?feed(expected):oldUse(x,y);
 input.onInteract=(x,y,e)=>!input.touchMode&&!e?.shiftKey&&config.feed.meats.includes(s.inventory.slot(s.inventory.selected).id)&&aimed()?feed():oldInteract(x,y,e);
 // The context button must resolve the target before clearing the crosshair input.
 s.fauna={records,feed,aimed,restore};
 const update=(_t,delta)=>{if(s.pausedByMenu||s.controls.suspended||s.homestead.sleeping)return;age+=Math.min(delta/1000,.1);if(age>=1){age=0;sync();wake();}};
 s.events.on('preupdate',update);s.events.once('shutdown',()=>s.events.off('preupdate',update));
}
/** All pixel rectangles are independent of physics/body geometry.
 * Cosmetic styling must NEVER mutate definition, body, health or calmId.
 * Exported so the hostile and tame drawings can be verified without a renderer.
 */
export function chihuahuaPixels({calm=false,step=0}={}){
 const p=[];
 const add=(x,y,w,h,color,part='fur')=>p.push({x,y,w,h,color,part});
 // Narrow torso and four thin legs. Lowering the forelegs makes an aggressive stance.
 add(4,14,12,5,0x6d4d34);add(5,15,10,4,0xd5a471,'coat');
 add(6,14,8,2,0xf2d1a0,'coat');
 add(5,18+step,2,6-step,0xa77850);add(6,23,3,1,0x4b3329);
 add(10,18,2,6-step,0xb68555);add(10,23-step,3,1,0x4b3329);
 add(14,18+(calm?0:1),2,6-step,0xc18d5b);add(14,23,3,1,0x4b3329);
 add(17,18,2,6-step,0x916044);add(17,23-step,3,1,0x4b3329);
 // Chihuahua curled tail: outward, then upward; relaxed wag differs from stiff wild pose.
 add(3,14,3,3,0x9b714b);add(1,11+(calm?step:0),3,5,0xb58b5c);
 add(1,9+(calm?step:0),2,3,0xc8a276);add(2,8+(calm?step:0),3,2,0x6d4d34);
 // Apple-shaped, broad forehead and short nose, head subtly lowers when baring teeth.
 const shift=calm?0:1;
 add(13,6+shift,10,13,0x5b3e32);add(14,7+shift,9,11,0xddb180,'coat');
 add(14,9+shift,8,4,0xf2ce9d,'coat');add(17,17+shift,5,2,0x8b5d41);
 // Distinctive enormous upright ears, not pointed snouts or cat ears.
 add(12,1+shift,4,9,0x604333);add(13,3+shift,2,6,0xc88b80,'ear');
 add(19,0+shift,4,10,0x604333);add(20,2+shift,2,7,0xc88b80,'ear');
 add(14,0+shift,2,3,0x937051);add(21,0+shift,2,2,0x937051);
 if(calm){
  // Raised gentle eyebrow, visible eye with glint and closed smiling muzzle.
  add(18,10,3,1,0xa87950,'brow');add(19,12,2,2,0x302a2a,'eye');
  add(19,12,1,1,0xfff2dd,'eye');
  add(20,15,4,3,0xf0d0a7,'muzzle');add(23,15,2,2,0x2d292a,'nose');
  add(21,18,3,1,0x765344,'mouth');add(22,19,2,1,0xa76e68,'mouth');
  add(14,18,6,2,0x5eaa96,'collar');add(17,19,2,2,0xe9c763,'collar');
 }else{
  // Slanted dark eyebrows, narrowed eye, open snarling mouth and visible white teeth.
  add(17,10+shift,4,2,0x4a352e,'brow');add(18,12+shift,3,1,0x211f21,'eye');
  add(19,12+shift,1,1,0xfff3dc,'eye');
  add(20,15+shift,4,3,0xf0d0a7,'muzzle');add(23,15+shift,2,2,0x282527,'nose');
  add(20,18+shift,4,3,0x42292b,'mouth');add(21,18+shift,1,2,0xfff2dd,'tooth');
  add(23,18+shift,1,2,0xfff2dd,'tooth');add(21,20+shift,2,1,0xc27976,'mouth');
  add(16,17+shift,3,1,0x66453c,'brow');
 }
 return p;
}
/** Hand-drawn pixel creatures matching the original code-based animal art. */
export function drawFauna(g,c){
 const chicken=c.definition.id==='chicken';if(!chicken&&c.definition.id!=='chihuahua')return false;
 const width=chicken?17:25,height=chicken?18:26,x=Math.round(c.cx-width/2),
   y=Math.round(c.body.y+c.body.height-height),hurt=c.invulnerable>0,
   step=Math.abs(c.body.vx)>2&&c.body.grounded?Math.floor(c.stateTime*12)%2:0;
 const r=(px,py,w,h,color,part='fur')=>{
  const flash=hurt&&['fur','coat'].includes(part);
  g.fillStyle(flash?0xea7770:color,c.state==='Dead'?.5:1);
  g.fillRect(x+(c.facing<0?width-px-w:px),y+py,w,h);
 };
 if(chicken){r(3,8,11,7,0x353735);r(4,8,9,6,0xece8d2);r(5,9,5,3,0xbdbfab);r(1,6,4,6,0xd8d9c6);r(0,5,2,4,0xf5edda);r(11,4,5,7,0xeee8d5);r(12,2,2,3,0xbd4840);r(14,1,2,4,0xbd4840);r(15,7,2,2,0xe5ae54);r(13,6,1,1,0x26292b);r(13,10,2,2,0xbd4840);r(6,14+step,1,3-step,0xd8a04d);r(10,14,1,3-step,0xd8a04d);r(5,17,3,1,0xd8a04d);r(10,17-step,3,1,0xd8a04d);}
 else for(const v of chihuahuaPixels({calm:!!c.calmId,step}))r(v.x,v.y,v.w,v.h,v.color,v.part);
 if(hurt){g.fillStyle(0x24282b);g.fillRect(x+2,y-4,width-4,2);g.fillStyle(0xff8271);g.fillRect(x+2,y-4,Math.ceil((width-4)*Math.max(0,c.health)/c.definition.health),2);}
 return true;
}
