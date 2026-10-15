const root=document.documentElement;
const buttons=[...document.querySelectorAll('[data-fullscreen]')];
const help=document.getElementById('fullscreen-help');
const close=document.getElementById('fullscreen-help-close');
let origin=null,pending=false,resumeAfterHelp=false;
const current=()=>document.fullscreenElement||document.webkitFullscreenElement;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
function sync(){
 for(const b of buttons){b.textContent=current()?'전체화면 해제':standalone()?'앱 화면 안내':'전체화면';b.setAttribute('aria-pressed',String(!!current()));b.disabled=pending;}
}
function showHelp(message){
 window.dispatchEvent(new Event('blur'));
 const pause=document.getElementById('pause-menu');
 if(document.body.dataset.mode!=='seed'&&pause.hidden&&document.getElementById('inventory').hidden){document.getElementById('pause-button').click();resumeAfterHelp=!pause.hidden;}
 document.getElementById('fullscreen-help-message').textContent=message;
 document.getElementById('fullscreen-install-tip').textContent=/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1
 ?'아이폰·아이패드: Safari의 공유 버튼 → 홈 화면에 추가 → 추가한 가나디 아이콘으로 실행하세요. “웹 앱으로 열기” 옵션이 있으면 켜 주세요.'
 :'휴대폰 브라우저 메뉴에서 “홈 화면에 추가” 또는 “앱 설치”가 제공되면 이용하세요. 인앱 브라우저라면 Safari 또는 Chrome에서 다시 열어 주세요.';
 help.hidden=false;close.focus();
}
function dismiss(){help.hidden=true;if(resumeAfterHelp){resumeAfterHelp=false;document.getElementById('pause-resume').click();}(origin??document.getElementById('game')).focus({preventScroll:true});}
async function toggle(e){
 if(pending)return;origin=e.currentTarget;
 if(standalone()&&!current()){showHelp('현재 홈 화면 앱으로 실행 중입니다. 화면 비율과 여백은 기기에 맞춰 자동 조정됩니다.');return;}
 const request=root.requestFullscreen||root.webkitRequestFullscreen;
 const exit=document.exitFullscreen||document.webkitExitFullscreen;
 if(!current()&&!request){showHelp('이 브라우저에서는 버튼으로 전체화면을 켤 수 없습니다. 홈 화면 앱으로 실행하면 주소창 없이 플레이할 수 있습니다.');return;}
 window.dispatchEvent(new Event('blur'));pending=true;sync();
 try{
  if(current()){await exit.call(document);screen.orientation?.unlock?.();}
  else{
   await request.call(root,{navigationUI:'hide'});
   if(screen.orientation?.lock)try{await screen.orientation.lock('landscape');}catch{/* Rotation remains under device control. */}
  }
 }catch{showHelp('전체화면 전환이 허용되지 않았습니다. 브라우저에서 직접 열거나 홈 화면 앱으로 실행해 주세요.');}
 finally{pending=false;sync();if(help.hidden)document.getElementById('game').focus({preventScroll:true});schedule();}
}
buttons.forEach(b=>b.addEventListener('click',toggle));
close.addEventListener('click',dismiss);
help.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();}if(e.key==='Tab'){e.preventDefault();close.focus();}});
for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,()=>{if(!current())screen.orientation?.unlock?.();sync();schedule();});
// Keep Phaser's fixed 480x270 FIT canvas inside the actual visible viewport.
let last='',scheduled=false;
function layout(){scheduled=false;const w=document.documentElement.clientWidth,h=window.innerHeight;const key=w+':'+h;if(key===last)return;last=key;root.dataset.compact=String(h<300);window.dispatchEvent(new Event('resize'));}
function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(layout);}}
window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.addEventListener('orientationchange',schedule);
const menu=document.getElementById('game-more');menu.addEventListener('click',e=>{if(e.target.closest('button'))menu.open=false;});
sync();schedule();

// Refresh Phaser immediately when the safe viewport changes (including rotation).
export function attachDisplayGame(game){
 let queued=false;
 const refresh=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;if(!game.scale?.canvas)return;game.scale.getParentBounds();game.scale.refresh();});};
 const observer=new ResizeObserver(refresh);observer.observe(document.getElementById('game'));
 window.addEventListener('resize',refresh);window.visualViewport?.addEventListener('resize',refresh);
 game.events.once('destroy',()=>{observer.disconnect();window.removeEventListener('resize',refresh);window.visualViewport?.removeEventListener('resize',refresh);});
 const enforceZoom=()=>{for(const scene of game.scene.getScenes(true))for(const camera of scene.cameras.cameras){camera.zoomEffect?.reset();if(camera.zoomX!==1||camera.zoomY!==1)camera.setZoom(1);}};
 game.events.on('prestep',enforceZoom);game.events.once('destroy',()=>game.events.off('prestep',enforceZoom));
 refresh();
}
const onGameGesture=e=>{

 if(e.cancelable)e.preventDefault();
};
for(const name of ['gesturestart','gesturechange','gestureend'])document.addEventListener(name,onGameGesture,{passive:false});

// Prevent native smart zoom even when a dialog or form is open.
let lastTouchEnd=0;
document.addEventListener('touchstart',e=>{if(e.touches.length>1&&e.cancelable)e.preventDefault();},{passive:false,capture:true});
document.addEventListener('touchend',e=>{if(e.target.closest?.('button,input,select,summary'))return;const now=performance.now();if(now-lastTouchEnd<300&&e.cancelable)e.preventDefault();lastTouchEnd=now;},{passive:false});
document.addEventListener('dblclick',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
