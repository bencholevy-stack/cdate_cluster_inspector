(()=>{
'use strict';
const PATCH_VERSION='2.8.3';

const uiStyle=document.createElement('style');
uiStyle.textContent=`
#teachOverlayHiRes .dciTeachMark{
  width:14px!important;height:14px!important;border-width:2px!important;
  background:rgba(255,255,255,.55)!important;
  box-shadow:0 1px 3px rgba(0,0,0,.32)!important;
  font:900 8px/1 system-ui!important;
  transform-origin:center center!important;
}
#teachOverlayHiRes .dciTeachMark.notfruit{font-size:13px!important}
#teachOverlayHiRes .dciTeachMark.partial{outline-width:1px!important;outline-offset:2px!important}
`;
document.head.appendChild(uiStyle);

function syncMarkerScale(){
  const z=Math.max(1,Number(APP?.viewer?.zoom)||1);
  const inv=1/z;
  document.querySelectorAll('#teachOverlayHiRes .dciTeachMark').forEach(m=>{
    m.style.transform=`translate(-50%,-50%) scale(${inv})`;
  });
}

function queueState(){
  const files=(APP.files||[]).filter(f=>f&&f.type==='image');
  const pending=files.filter(f=>f.status!=='done'&&f.status!=='error').length;
  return {total:files.length,pending};
}

function syncPwaBar(){
  const bar=document.getElementById('dciPwaBar');
  if(!bar)return;
  const {total,pending}=queueState();
  const viewerOpen=document.getElementById('viewerModal')?.classList.contains('on');
  const hide=!!viewerOpen || (total>0 && pending===0);
  bar.style.setProperty('display',hide?'none':'block','important');
  if(hide){
    document.body.style.setProperty('padding-bottom','0','important');
  }else{
    document.body.style.setProperty('padding-bottom','116px','important');
  }
}

const oldQueuePickedFiles=queuePickedFiles;
queuePickedFiles=function(...args){
  const out=oldQueuePickedFiles(...args);
  const pc=document.getElementById('progressCard');
  if(pc)pc.style.display='none';
  setTimeout(syncPwaBar,0);
  return out;
};

const overlay=document.getElementById('teachOverlayHiRes');
if(overlay){
  new MutationObserver(syncMarkerScale).observe(overlay,{childList:true,subtree:true});
}

const viewerModal=document.getElementById('viewerModal');
if(viewerModal){
  new MutationObserver(()=>{syncMarkerScale();syncPwaBar();}).observe(viewerModal,{attributes:true,attributeFilter:['class']});
}

setInterval(()=>{
  if(APP?.viewer?.teaching)syncMarkerScale();
  syncPwaBar();
},250);

const brand=document.querySelector('.brand small');
if(brand)brand.textContent=brand.textContent.replace(/PWA\s+2\.8\.[023]/,'PWA '+PATCH_VERSION);
setTimeout(()=>{
  const hint=document.getElementById('dciPwaHint');
  if(hint)hint.textContent=hint.textContent.replace(/PWA\s+2\.8\.[023]/,'PWA '+PATCH_VERSION);
  syncMarkerScale();syncPwaBar();
},500);
})();
