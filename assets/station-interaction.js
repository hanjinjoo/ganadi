/** A station is usable only while its installed block has been explicitly opened. */
export function attachStations(scene){
 const input=scene.worldInput,craft=scene.crafting,ui=scene.craftingUI;
 const abort=new AbortController();let current=null,demolish=false;
 const panel=document.getElementById('crafting-panel');
 const title=panel.querySelector('h3');
 const back=document.createElement('button');back.type='button';back.id='station-back';back.textContent='손 제작으로';back.hidden=true;title.after(back);
 const mode=document.createElement('button');mode.type='button';mode.id='station-demolish';mode.textContent='시설 철거: 꺼짐';mode.setAttribute('aria-pressed','false');document.querySelector('#game-more>div').append(mode);
 const visible=r=>current?r.station===current.id:r.station==='none';craft.visibleRecipe=visible;
 function reachable(s){
  if(!s||scene.world.getBlock(s.x,s.y)?.id!==s.id)return false;
  const b=scene.player.body,px=b.x+b.width/2,py=b.y+b.height/2,tx=s.x*16+8,ty=s.y*16+8;
  const distance=Math.hypot(tx-px,ty-py);if(distance>48)return false;
  const n=Math.max(1,Math.ceil(distance/3));for(let k=1;k<n;k++){const x=Math.floor((px+(tx-px)*k/n)/16),y=Math.floor((py+(ty-py)*k/n)/16);if(x===s.x&&y===s.y)continue;if(scene.world.isSolid(x,y))return false;}
  return true;
 }
 craft.stationAccess=id=>!!current&&current.id===id&&scene.inventoryUI.opened&&reachable(current);
 function render(){title.textContent=current?(current.id==='workbench'?'작업대 제작':'모닥불 요리'):'손 제작';back.hidden=!current;ui.chosen=null;ui.stamp='';ui.render();}
 function leave(){current=null;craft.cancel();ui.stopHold();render();}
 function open(x,y){
  if(demolish||input.building||scene.pausedByMenu||scene.dying>0||scene.inventoryUI.opened||!scene.inventoryUI.canOpen())return false;
  const id=scene.world.getBlock(x,y)?.id;if(id!=='workbench'&&id!=='campfire')return false;
  const target={id,x,y};if(!reachable(target)){document.getElementById('interaction-message').textContent='시설이 보이는 3타일 이내로 접근하세요.';return true;}
  current=target;scene.chestUI.close();scene.inventoryUI.setOpen(true);
  if(!scene.inventoryUI.opened){current=null;return false;}
  input.clear();scene.controls.clear();scene.mining.reset();craft.cancel();render();return true;
 }
 input.onInteract=(x,y,event)=>event?.shiftKey?false:open(x,y);
 const onClosed=scene.inventoryUI.onClosed;scene.inventoryUI.onClosed=()=>{leave();onClosed();};
 back.addEventListener('click',leave,{signal:abort.signal});
 mode.addEventListener('click',()=>{demolish=!demolish;mode.textContent=`시설 철거: ${demolish?'켜짐':'꺼짐'}`;mode.setAttribute('aria-pressed',String(demolish));input.clear();document.getElementById('interaction-message').textContent=demolish?'시설을 조준하면 채굴합니다.':'시설을 조준하면 제작 화면을 엽니다.';},{signal:abort.signal});
 const tick=()=>{
  if(current&&(!scene.inventoryUI.opened||!reachable(current))){leave();return;}
  if(!current&&!scene.inventoryUI.opened&&input.touchMode&&input.active&&!input.building){input.updateTarget();open(input.targetX,input.targetY);}
 };
 scene.events.on('preupdate',tick);
 const off=scene.world.changed.subscribe(()=>{if(current&&!reachable(current))leave();});
 render();
 scene.events.once('shutdown',()=>{abort.abort();off();scene.events.off('preupdate',tick);input.onInteract=()=>false;back.remove();mode.remove();});
}
