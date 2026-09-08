(()=>{
'use strict';
const PATCH_VERSION='2.8.7';
const ICON='./icons/icon-192.png';

// --- One visual identity everywhere ---
let fav=document.querySelector('link[rel~="icon"]');
if(!fav){fav=document.createElement('link');fav.rel='icon';document.head.appendChild(fav);}
fav.type='image/png';fav.href=ICON+'?v=287b';
let apple=document.querySelector('link[rel="apple-touch-icon"]');
if(!apple){apple=document.createElement('link');apple.rel='apple-touch-icon';document.head.appendChild(apple);}
apple.href=ICON+'?v=287b';
const logo=document.querySelector('.logo');
if(logo){
  logo.innerHTML=`<img src="${ICON}?v=287b" alt="NAVIDATE" style="display:block;width:100%;height:100%;object-fit:cover">`;
  logo.style.background='none';logo.style.padding='0';logo.style.overflow='hidden';logo.style.color='transparent';
}

// --- Automatic classification: contours only, never opaque fruit fill ---
const stage=document.getElementById('viewerStage');
const viewerBody=document.getElementById('viewerBody');
const viewerImg=document.getElementById('viewerImg');
const manualLayer=document.getElementById('teachOverlayHiRes');
const oldFilled=document.getElementById('autoFruitMaskHiRes');
if(oldFilled)oldFilled.style.setProperty('display','none','important');
const old284=document.getElementById('autoClassOverlayHiRes');
if(old284)old284.style.setProperty('display','none','important');

const css=document.createElement('style');
css.textContent=`
#autoFruitMaskHiRes,#autoClassOverlayHiRes{display:none!important}
#autoContourHiRes{position:absolute;z-index:5;display:none;pointer-events:none;max-width:none!important;max-height:none!important;object-fit:fill}
#teachOverlayHiRes{z-index:6!important}
#teachUndoFloating{position:absolute;left:8px;top:8px;z-index:40;display:none;min-height:40px;padding:0 12px;border:1px solid rgba(255,255,255,.75);border-radius:11px;background:rgba(20,35,24,.88);color:#fff;font:850 12px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.28)}
#viewerModal.teach-active #teachUndoFloating{display:block}
#viewerModal.teach-active #teachUndoBtn{display:none!important}
`;
document.head.appendChild(css);

const contour=document.createElement('img');
contour.id='autoContourHiRes';contour.alt='Automatic fruit classification contours';
if(stage&&manualLayer)stage.insertBefore(contour,manualLayer);

const contourCache=new Map();
function contourFromMask(maskUrl){
  if(contourCache.has(maskUrl))return Promise.resolve(contourCache.get(maskUrl));
  return new Promise((resolve,reject)=>{
    const im=new Image();
    im.onload=()=>{
      try{
        const w=im.naturalWidth,h=im.naturalHeight,c=document.createElement('canvas');c.width=w;c.height=h;
        const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,w,h);
        const src=ctx.getImageData(0,0,w,h),sd=src.data,out=ctx.createImageData(w,h),od=out.data;
        const same=(q1,q2)=>sd[q1+3]>0&&sd[q2+3]>0&&Math.abs(sd[q1]-sd[q2])<12&&Math.abs(sd[q1+1]-sd[q2+1])<12&&Math.abs(sd[q1+2]-sd[q2+2])<12;
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const q=(y*w+x)*4;if(sd[q+3]===0)continue;
          let edge=x===0||x===w-1||y===0||y===h-1;
          if(!edge){
            const n=[q-4,q+4,q-w*4,q+w*4,q-w*4-4,q-w*4+4,q+w*4-4,q+w*4+4];
            for(const j of n){if(sd[j+3]===0||!same(q,j)){edge=true;break;}}
          }
          if(edge){od[q]=sd[q];od[q+1]=sd[q+1];od[q+2]=sd[q+2];od[q+3]=255;}
        }
        // Add one neighbouring pixel for visibility while keeping fruit interiors transparent.
        const first=od.slice();
        for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
          const q=(y*w+x)*4;if(first[q+3])continue;
          const n=[q-4,q+4,q-w*4,q+w*4];
          const hit=n.find(j=>first[j+3]>0);
          if(hit!==undefined){od[q]=first[hit];od[q+1]=first[hit+1];od[q+2]=first[hit+2];od[q+3]=215;}
        }
        ctx.clearRect(0,0,w,h);ctx.putImageData(out,0,0);
        const url=c.toDataURL('image/png');contourCache.set(maskUrl,url);resolve(url);
      }catch(e){reject(e);}
    };
    im.onerror=reject;im.src=maskUrl;
  });
}

const showToggle=document.getElementById('showAutoMarks');
const opacity=document.getElementById('autoMarksOpacity');
const markHint=document.querySelector('#autoMarkControls .autoMarkHint');
if(markHint)markHint.textContent='App markings are thin colored contours only. Fruit interiors stay visible; your manual corrections are the small lettered rings.';
let currentMask='';
async function syncContour(){
  if(!contour||!viewerImg||!APP.viewer?.teaching||!showToggle?.checked){if(contour)contour.style.display='none';return;}
  const mask=APP.viewer.frameRef?.classMaskUrl;
  if(!mask||!viewerImg.clientWidth||!viewerImg.clientHeight){contour.style.display='none';return;}
  contour.style.left=viewerImg.offsetLeft+'px';contour.style.top=viewerImg.offsetTop+'px';contour.style.width=viewerImg.clientWidth+'px';contour.style.height=viewerImg.clientHeight+'px';
  contour.style.opacity=String((Number(opacity?.value)||72)/100);
  if(mask!==currentMask){
    currentMask=mask;
    try{contour.src=await contourFromMask(mask);}catch(e){console.warn('Could not build classification contours',e);contour.style.display='none';return;}
  }
  contour.style.display='block';
}
showToggle?.addEventListener('change',syncContour);opacity?.addEventListener('input',syncContour);
viewerImg?.addEventListener('load',()=>{if(APP.viewer?.teaching)requestAnimationFrame(syncContour);});
window.addEventListener('resize',()=>{if(APP.viewer?.teaching)requestAnimationFrame(syncContour);});
setInterval(()=>{if(APP.viewer?.teaching)syncContour();else if(contour)contour.style.display='none';},350);

// --- Undo: always reachable at upper-left of the photo while teaching ---
const originalUndo=document.getElementById('teachUndoBtn');
if(viewerBody&&originalUndo){
  const u=document.createElement('button');u.id='teachUndoFloating';u.type='button';u.textContent='↶ Undo';
  u.onclick=e=>{e.preventDefault();e.stopPropagation();originalUndo.click();setTimeout(syncContour,0);};
  viewerBody.appendChild(u);
}

const brand=document.querySelector('.brand small');
if(brand)brand.textContent=brand.textContent.replace(/PWA\s+2\.8\.[0-9]+/,'PWA '+PATCH_VERSION);
setTimeout(()=>{const h=document.getElementById('dciPwaHint');if(h)h.textContent=h.textContent.replace(/PWA\s+2\.8\.[0-9]+/,'PWA '+PATCH_VERSION);},500);
})();
