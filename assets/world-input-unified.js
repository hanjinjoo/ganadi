/** Unified mouse/touch input. A cancelled tile is excluded only for the current touch. */
export class WorldInput {
  abort=new AbortController(); pointer=-1; padPointer=-1;
  lastX=0;lastY=0;sx=280;sy=135;right=false;aimInitialized=false;
  disabled=false;active=false;aiming=false;buildMode=false;
  touchMode=matchMedia('(pointer: coarse)').matches;
  targetX=-1;targetY=-1;autoTarget=null;cancelled=new Set();
  button=document.getElementById('build-toggle');pad=document.getElementById('aim-pad');
  constructor(canvas,camera){
    this.canvas=canvas;this.camera=camera;
    const options={signal:this.abort.signal};
    canvas.addEventListener('pointerdown',this.down,options);
    canvas.addEventListener('pointermove',this.move,options);
    canvas.addEventListener('pointerleave',this.leave,options);
    canvas.addEventListener('lostpointercapture',this.end,options);
    canvas.addEventListener('contextmenu',e=>e.preventDefault(),options);
    this.pad.addEventListener('pointerdown',this.padDown,options);
    this.pad.addEventListener('pointermove',this.padMove,options);
    this.pad.addEventListener('lostpointercapture',this.end,options);
    window.addEventListener('pointerup',this.end,options);
    window.addEventListener('pointercancel',this.end,options);
    window.addEventListener('blur',this.clear,options);
    window.addEventListener('resize',this.clear,options);
    document.addEventListener('visibilitychange',this.clear,options);
    this.button.addEventListener('click',this.toggle,options);
    document.body.classList.toggle('touch-aim',this.touchMode);this.showMode();
  }
  get worldX(){return this.sx+this.camera.scrollX;}
  get worldY(){return this.sy+this.camera.scrollY;}
  get screenX(){return this.sx;}
  get screenY(){return this.sy;}
  get building(){return this.buildMode||(this.active&&this.right);}
  updateTarget(playerX,playerY){
    if(this.touchMode&&!this.aimInitialized&&playerX!==undefined&&playerY!==undefined){
      this.sx=Math.max(8,Math.min(this.canvas.width-8,playerX-this.camera.scrollX+32));
      this.sy=Math.max(8,Math.min(this.canvas.height-8,playerY-this.camera.scrollY));this.aimInitialized=true;
    }
    if(this.touchMode)this.aiming=!this.disabled;
    this.targetX=Math.floor(this.worldX/16);this.targetY=Math.floor(this.worldY/16);
    if(this.autoTarget&&(this.autoTarget.x!==this.targetX||this.autoTarget.y!==this.targetY)){
      this.cancelled.add(`${this.autoTarget.x},${this.autoTarget.y}`);this.autoTarget=null;
    }
  }
  autoMining(eligible){
    if(!this.touchMode||this.disabled||this.building||this.padPointer===-1||!eligible)return false;
    if(this.cancelled.has(`${this.targetX},${this.targetY}`))return false;
    this.autoTarget??={x:this.targetX,y:this.targetY};return true;
  }
  miningCompleted(x,y){
    // Completion is not cancellation: the next aimed tile can be mined immediately.
    if(this.autoTarget?.x===x&&this.autoTarget?.y===y)this.autoTarget=null;
  }
  enableTouch(){this.touchMode=true;document.body.classList.add('touch-aim');this.aiming=true;}
  position(e){const r=this.canvas.getBoundingClientRect();this.sx=(e.clientX-r.left)*this.canvas.width/r.width;this.sy=(e.clientY-r.top)*this.canvas.height/r.height;this.aiming=this.sx>=0&&this.sx<this.canvas.width&&this.sy>=0&&this.sy<this.canvas.height;this.updateTarget();}
  down=e=>{
    if(e.pointerType!=='mouse'){this.enableTouch();return;}
    if(this.disabled||this.pointer!==-1||![0,2].includes(e.button))return;
    this.clear();this.touchMode=false;document.body.classList.remove('touch-aim');e.preventDefault();this.pointer=e.pointerId;this.active=true;this.right=e.button===2;this.canvas.setPointerCapture(e.pointerId);this.position(e);
  };
  move=e=>{if(this.touchMode||this.disabled||(this.pointer!==-1&&e.pointerId!==this.pointer))return;if(this.pointer!==-1||e.pointerType==='mouse')this.position(e);};
  padDown=e=>{
    if(this.disabled||this.padPointer!==-1||e.button!==0)return;
    e.preventDefault();this.enableTouch();this.padPointer=e.pointerId;this.active=true;this.autoTarget=null;this.cancelled.clear();
    this.lastX=e.clientX;this.lastY=e.clientY;this.pad.classList.add('active');this.pad.setPointerCapture(e.pointerId);this.updateTarget();
  };
  padMove=e=>{
    if(this.disabled||e.pointerId!==this.padPointer)return;
    const r=this.canvas.getBoundingClientRect();
    this.sx=Math.max(8,Math.min(this.canvas.width-8,this.sx+(e.clientX-this.lastX)*this.canvas.width/r.width));
    this.sy=Math.max(8,Math.min(this.canvas.height-8,this.sy+(e.clientY-this.lastY)*this.canvas.height/r.height));
    this.lastX=e.clientX;this.lastY=e.clientY;this.updateTarget();
  };
  leave=()=>{if(!this.active&&!this.touchMode)this.aiming=false;};
  end=e=>{
    if(e.pointerId===this.padPointer){this.padPointer=-1;this.active=false;this.autoTarget=null;this.cancelled.clear();this.pad.classList.remove('active');}
    if(e.pointerId===this.pointer){this.pointer=-1;this.active=false;this.right=false;}
  };
  toggle=()=>{if(this.disabled)return;this.clear();this.buildMode=!this.buildMode;this.showMode();this.button.blur();};
  showMode(){this.button.setAttribute('aria-pressed',String(this.buildMode));this.button.textContent=this.buildMode?'설치 모드':'채굴·공격 모드';this.pad.querySelector('small').textContent=this.buildMode?'조준 · 설치':'조준 · 채굴/공격';}
  clear=()=>{
    const captures=[[this.canvas,this.pointer],[this.pad,this.padPointer]];
    this.pointer=this.padPointer=-1;this.active=false;this.right=false;this.aiming=false;this.autoTarget=null;this.cancelled.clear();this.pad.classList.remove('active');
    for(const [node,id] of captures)if(node.hasPointerCapture(id))node.releasePointerCapture(id);
  };
  destroy(){this.abort.abort();this.clear();document.body.classList.remove('touch-aim');}
}
