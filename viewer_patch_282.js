(()=>{
'use strict';
const PATCH_VERSION='2.8.2';

const style=document.createElement('style');
style.textContent=`
#teachOverlayHiRes{position:absolute;z-index:6;display:none;pointer-events:none}
#teachOverlayHiRes .dciTeachMark{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.88);border:3px solid currentColor;box-shadow:0 1px 4px rgba(0,0,0,.35);display:grid;place-items:center;font:900 10px/1 system-ui;color:#fff}
#teachOverlayHiRes .dciTeachMark.notfruit{border-radius:4px;background:transparent;font-size:20px;text-shadow:0 1px 3px #fff}
#teachOverlayHiRes .dciTeachMark.partial{outline:2px dashed currentColor;outline-offset:4px}
#viewerModal.teach-active .viewerLegend{display:none}
@media(max-width:760px){
  #viewerModal{padding:0}
  #viewerModal .viewer{width:100%;height:100dvh;max-height:none;border-radius:0;display:flex;flex-direction:column}
  #viewerModal .viewerTop{order:0;height:auto;min-height:48px;padding:6px 8px;gap:6px;align-items:flex-start;flex:none}
  #viewerModal .viewerTop>strong{font-size:11px;line-height:1.25;max-width:32%;padding-top:6px}
  #viewerModal .viewerTop .btnrow{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px;flex:1}
  #viewerModal .viewerTop .btn{min-height:34px;padding:0 8px;font-size:10px}
  #viewerModal .viewerLegend{order:1;flex:none;max-height:70px;overflow:auto;padding:5px 8px}
  #viewerModal .viewerBody{order:2;flex:1 1 auto;min-height:0;height:auto;max-height:none}
  #viewerModal .teachPanel{order:3;flex:none;max-height:42vh;overflow:auto;padding:8px 9px;background:#f8fbf7;border-top:1px solid var(--line);border-bottom:0}
  #viewerModal.teach-active #zoomOutBtn,
  #viewerModal.teach-active #zoomInBtn,
  #viewerModal.teach-active #calibrateHereBtn{display:none}
  #viewerModal.teach-active .viewerTop>strong{max-width:42%}
  #viewerModal .teachClasses{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px}
  #viewerModal .teachClass{min-width:0;min-height:42px;padding:6px 4px;font-size:10px;white-space:normal;line-height:1.15}
  #viewerModal .teachControls{display:grid;grid-template-columns:1fr;gap:5px}
  #viewerModal .teachControls select{height:34px}
  #viewerModal .checkline{padding:4px 0;font-size:10px!important}
  #viewerModal #teachPanel>.btnrow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
  #viewerModal #teachPanel>.btnrow .btn{min-width:0;padding:0 5px;font-size:10px}
  #viewerModal .teachStatus{font-size:9px;line-height:1.35}
}
`;
document.head.appendChild(style);

function readFileDataURL(file){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>resolve(fr.result);
    fr.onerror=()=>reject(fr.error||new Error('Cannot read original image bytes'));
    fr.readAsDataURL(file);
  });
}

imageFileToFrame=function(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=async()=>{
      try{
        const c=document.createElement('canvas');
        c.width=img.naturalWidth;c.height=img.naturalHeight;
        c.getContext('2d').drawImage(img,0,0);
        const raw=await readFileDataURL(file);
        URL.revokeObjectURL(url);
        resolve([{canvas:c,raw,sharpness:sharpnessOfCanvas(c),time:0}]);
      }catch(err){
        URL.revokeObjectURL(url);reject(err);
      }
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Cannot read image'))};
    img.src=url;
  });
};

const viewerStage=$('viewerStage');
const viewerBody=$('viewerBody');
const viewerImg=$('viewerImg');
const viewerModal=$('viewerModal');
const overlay=document.createElement('div');
overlay.id='teachOverlayHiRes';
viewerStage.appendChild(overlay);

function syncTeachOverlay(){
  if(!APP.viewer.teaching||!viewerImg.clientWidth||!viewerImg.clientHeight)return;
  overlay.style.left=viewerImg.offsetLeft+'px';
  overlay.style.top=viewerImg.offsetTop+'px';
  overlay.style.width=viewerImg.clientWidth+'px';
  overlay.style.height=viewerImg.clientHeight+'px';
  overlay.style.display='block';
}
function renderTeachMarkers(){
  if(!APP.viewer.teaching){overlay.innerHTML='';overlay.style.display='none';return;}
  syncTeachOverlay();
  overlay.innerHTML='';
  const colors={green:'#22a65b',yellow:'#e1b400',brown:'#8a5833',dry:'#78668f',unknown:'#8b9790',notfruit:'#d44c4c'};
  const letters={green:'G',yellow:'Y',brown:'B',dry:'D',unknown:'?',notfruit:'×'};
  (APP.viewer.corrections||[]).forEach(l=>{
    const m=document.createElement('div');
    m.className='dciTeachMark '+(l.cls==='notfruit'?'notfruit ':'')+(l.partial?'partial':'');
    m.style.left=(l.x*100)+'%';m.style.top=(l.y*100)+'%';m.style.color=colors[l.cls]||'#fff';
    m.textContent=letters[l.cls]||'?';
    overlay.appendChild(m);
  });
}
function showOriginalForTeaching(){
  if(!APP.viewer.rawSrc)return;
  if(viewerImg._dciHiResRaw!==APP.viewer.rawSrc){
    viewerImg._dciHiResRaw=APP.viewer.rawSrc;
    viewerImg.onload=()=>{syncTeachOverlay();renderTeachMarkers();};
    viewerImg.src=APP.viewer.rawSrc;
  }else{
    syncTeachOverlay();renderTeachMarkers();
  }
}

renderTeachImage=function(){
  if(!APP.viewer.teaching||!APP.viewer.rawSrc){
    overlay.innerHTML='';overlay.style.display='none';
    viewerImg._dciHiResRaw=null;
    viewerImg.src=APP.viewer.src;
    return;
  }
  showOriginalForTeaching();
};

const baseOpenViewer=openViewer;
openViewer=function(...args){
  viewerModal.classList.remove('teach-active');
  overlay.innerHTML='';overlay.style.display='none';
  viewerImg._dciHiResRaw=null;
  baseOpenViewer(...args);
};

$('teachHereBtn').onclick=()=>{
  if(APP.viewer.calibrating){toast('Turn calibration off first');return;}
  APP.viewer.teaching=!APP.viewer.teaching;
  $('teachPanel').classList.toggle('on',APP.viewer.teaching);
  viewerBody.classList.toggle('teaching',APP.viewer.teaching);
  viewerModal.classList.toggle('teach-active',APP.viewer.teaching);
  $('teachHereBtn').textContent=APP.viewer.teaching?'Done teaching':'Correct / Teach';
  resetViewerTransform();
  if(APP.viewer.teaching)showOriginalForTeaching();
  else{
    overlay.innerHTML='';overlay.style.display='none';viewerImg._dciHiResRaw=null;viewerImg.src=APP.viewer.src;
  }
  updateTeachStatus();
};

$('teachUndoBtn').onclick=()=>{APP.viewer.corrections.pop();renderTeachMarkers();updateTeachStatus();};
$('teachClearBtn').onclick=()=>{if(confirm('Clear all labels from this frame?')){APP.viewer.corrections=[];renderTeachMarkers();updateTeachStatus();}};

sampleTeachColor=function(img,xNorm,yNorm,cls,partial){
  if(partial||!['green','yellow','brown','notfruit'].includes(cls))return;
  try{
    const nw=img.naturalWidth,nh=img.naturalHeight;
    const radius=Math.max(2,Math.round(Math.min(nw,nh)*.004));
    const cx=Math.round(xNorm*nw),cy=Math.round(yNorm*nh);
    const sx=Math.max(0,cx-radius),sy=Math.max(0,cy-radius);
    const sw=Math.max(1,Math.min(nw-sx,radius*2+1)),sh=Math.max(1,Math.min(nh-sy,radius*2+1));
    const c=document.createElement('canvas');c.width=sw;c.height=sh;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
    const d=ctx.getImageData(0,0,sw,sh).data;
    let rs=0,gs=0,bs=0,n=0;
    for(let i=0;i<d.length;i+=4){rs+=d[i];gs+=d[i+1];bs+=d[i+2];n++;}
    if(!n)return;
    const hsv=rgbToHsv(rs/n,gs/n,bs/n),target=cls==='notfruit'?'ignore':cls;
    APP.calibration[target].push(hsv);
    if(APP.calibration[target].length>80)APP.calibration[target].shift();
  }catch(e){}
};

const gesture={pointers:new Map(),last:null,start:null,moved:false,cancelTap:false,startTime:0,pinchDist:0,pinchZoom:1};
function stopOldTeachPointer(e){
  if(!APP.viewer.teaching||APP.viewer.calibrating)return false;
  e.preventDefault();e.stopImmediatePropagation();return true;
}
viewerBody.addEventListener('pointerdown',e=>{
  if(!stopOldTeachPointer(e))return;
  viewerBody.setPointerCapture?.(e.pointerId);
  if(gesture.pointers.size===0){
    gesture.moved=false;gesture.cancelTap=false;gesture.start={x:e.clientX,y:e.clientY};gesture.startTime=performance.now();
  }
  gesture.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(gesture.pointers.size===1)gesture.last={x:e.clientX,y:e.clientY};
  if(gesture.pointers.size===2){
    const p=[...gesture.pointers.values()];
    gesture.pinchDist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
    gesture.pinchZoom=APP.viewer.zoom;gesture.cancelTap=true;gesture.last=null;
  }
},true);

viewerBody.addEventListener('pointermove',e=>{
  if(!APP.viewer.teaching||APP.viewer.calibrating||!gesture.pointers.has(e.pointerId))return;
  e.preventDefault();e.stopImmediatePropagation();
  gesture.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(gesture.pointers.size>=2){
    const p=[...gesture.pointers.values()].slice(0,2);
    const dist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
    if(gesture.pinchDist>0)setViewerZoom(gesture.pinchZoom*(dist/gesture.pinchDist));
    gesture.cancelTap=true;return;
  }
  if(gesture.start&&Math.hypot(e.clientX-gesture.start.x,e.clientY-gesture.start.y)>6)gesture.moved=true;
  if(APP.viewer.zoom>1&&gesture.last){
    APP.viewer.panX+=e.clientX-gesture.last.x;
    APP.viewer.panY+=e.clientY-gesture.last.y;
    gesture.last={x:e.clientX,y:e.clientY};
    applyViewerTransform();
  }
},true);

function addTeachLabelAt(clientX,clientY){
  const rect=viewerImg.getBoundingClientRect();
  if(!rect.width||!rect.height||clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return;
  const xn=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
  const yn=Math.max(0,Math.min(1,(clientY-rect.top)/rect.height));
  const cls=APP.viewer.teachClass||'yellow',partial=!!$('teachPartial').checked;
  APP.viewer.corrections.push({x:xn,y:yn,cls,partial});
  renderTeachMarkers();updateTeachStatus();
  const raw=new Image();
  raw.onload=()=>{sampleTeachColor(raw,xn,yn,cls,partial);saveLocal();renderCalSummary();};
  raw.src=APP.viewer.rawSrc;
}
function endTeachPointer(e){
  if(!APP.viewer.teaching||APP.viewer.calibrating||!gesture.pointers.has(e.pointerId))return;
  e.preventDefault();e.stopImmediatePropagation();
  const wasSingle=gesture.pointers.size===1;
  const doTap=wasSingle&&!gesture.moved&&!gesture.cancelTap&&(performance.now()-gesture.startTime)<650;
  gesture.pointers.delete(e.pointerId);
  if(doTap)addTeachLabelAt(e.clientX,e.clientY);
  if(gesture.pointers.size===1){
    const p=[...gesture.pointers.values()][0];gesture.last={x:p.x,y:p.y};
  }else if(gesture.pointers.size===0){
    gesture.last=null;gesture.start=null;gesture.pinchDist=0;gesture.moved=false;gesture.cancelTap=false;
  }
}
viewerBody.addEventListener('pointerup',endTeachPointer,true);
viewerBody.addEventListener('pointercancel',endTeachPointer,true);
viewerBody.addEventListener('click',e=>{if(APP.viewer.teaching){e.preventDefault();e.stopImmediatePropagation();}},true);

viewerImg.addEventListener('load',()=>{if(APP.viewer.teaching)requestAnimationFrame(()=>{syncTeachOverlay();renderTeachMarkers();});});
window.addEventListener('resize',()=>{if(APP.viewer.teaching)requestAnimationFrame(()=>{syncTeachOverlay();renderTeachMarkers();});});

const brand=document.querySelector('.brand small');
if(brand)brand.textContent=brand.textContent.replace(/PWA\s+2\.8\.0/,'PWA '+PATCH_VERSION);
setTimeout(()=>{
  const hint=$('dciPwaHint');
  if(hint)hint.textContent=hint.textContent.replace(/PWA\s+2\.8\.0/,'PWA '+PATCH_VERSION);
},1200);
})();
