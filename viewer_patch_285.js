(()=>{
'use strict';
const PATCH_VERSION='2.8.5';

const PALETTE={1:[38,170,92],2:[255,215,35],4:[138,88,51],5:[120,102,143],6:[160,168,162]};
let captureActive=false,lastCapture=null;

function exactMaskFromClasses(classes,w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d'),im=ctx.createImageData(w,h),d=im.data;
  for(let q=0;q<classes.length;q++){
    const code=classes[q],rgb=PALETTE[code];if(!rgb)continue;
    const i=q*4;d[i]=rgb[0];d[i+1]=rgb[1];d[i+2]=rgb[2];d[i+3]=205;
  }
  ctx.putImageData(im,0,0);
  return c.toDataURL('image/png');
}

const baseCollect=collectDiagnosticComponents;
collectDiagnosticComponents=function(classes,w,h,x0,y0,x1,y1){
  const out=baseCollect(classes,w,h,x0,y0,x1,y1);
  if(captureActive){
    lastCapture={maskUrl:exactMaskFromClasses(classes,w,h),w,h};
  }
  return out;
};

function normalizePrepickFrame(r){
  if(!r)return r;
  const fe=r.fruitEq||{};
  const candidateGreen=Math.max(0,Number(fe.green)||0),y=Math.max(0,Number(fe.yellow)||0),b=Math.max(0,Number(fe.brown)||0),dry=Math.max(0,Number(fe.dry)||0),unk=Math.max(0,Number(fe.unknown)||0);
  const yb=y+b;
  r.greenCandidate=candidateGreen;
  r.greenCandidatePct=(candidateGreen+yb)>0?100*candidateGreen/(candidateGreen+yb):0;
  fe.green=0;fe.totalValid=yb;fe.totalDetected=yb+dry+unk;
  r.fruitEq=fe;
  r.pct=r.pct||{};
  r.pct.green=0;r.pct.orange=0;
  r.pct.yellow=yb?100*y/yb:0;
  r.pct.brown=yb?100*b/yb:0;
  r.pct.dry=fe.totalDetected?100*dry/fe.totalDetected:0;
  r.pct.unknown=(yb+unk)?100*unk/(yb+unk):0;
  r.prepick={yellowFraction:r.pct.yellow,brownFraction:r.pct.brown,greenCandidate:candidateGreen,greenCandidatePct:r.greenCandidatePct};
  if(yb<3){r.analysisValid=false;r.confidence=0;r.invalidReason='PRE-PICKING: fewer than 3 accepted yellow+brown fruit-equivalents.';}
  return r;
}

const baseAnalyze=analyzeCanvas;
analyzeCanvas=function(sourceCanvas){
  lastCapture=null;captureActive=true;
  let r;
  try{r=baseAnalyze(sourceCanvas);}finally{captureActive=false;}
  if(lastCapture)r.classMaskUrl=lastCapture.maskUrl;
  return normalizePrepickFrame(r);
};

const baseAggregate=aggregateFrames;
aggregateFrames=function(frames){
  const a=baseAggregate(frames);
  const usable=frames.filter(f=>f&&f.analysisValid!==false);
  a.greenCandidate=usable.length?usable.reduce((s,f)=>s+(f.greenCandidate||0),0)/usable.length:0;
  a.greenCandidatePct=usable.length?usable.reduce((s,f)=>s+(f.greenCandidatePct||0),0)/usable.length:0;
  const y=a.fruitEq?.yellow||0,b=a.fruitEq?.brown||0,den=y+b;
  if(a.pct){a.pct.green=0;a.pct.yellow=den?100*y/den:0;a.pct.brown=den?100*b/den:0;}
  return a;
};

if(typeof manualFrameMetrics==='function'){
  const baseManual=manualFrameMetrics;
  manualFrameMetrics=function(labels,oldFrame){
    const m=baseManual(labels,oldFrame),g=(labels||[]).filter(x=>x.cls==='green').length;
    m.greenCandidate=g;
    const y=m.fruitEq?.yellow||0,b=m.fruitEq?.brown||0,dry=m.fruitEq?.dry||0,unk=m.fruitEq?.unknown||0,den=y+b;
    if(m.fruitEq){m.fruitEq.green=0;m.fruitEq.totalValid=den;m.fruitEq.totalDetected=den+dry+unk;}
    if(m.pct){m.pct.green=0;m.pct.yellow=den?100*y/den:0;m.pct.brown=den?100*b/den:0;m.pct.dry=(den+dry+unk)?100*dry/(den+dry+unk):0;m.pct.unknown=(den+unk)?100*unk/(den+unk):0;}
    m.analysisValid=den>0;m.invalidReason=den>0?'':'Pre-picking correction contains no yellow or brown fruit labels.';
    return m;
  };
}

rankingMetrics=function(t){
  const p=t?.avg?.pct||{},den=(p.yellow||0)+(p.brown||0),brown=den?100*(p.brown||0)/den:0;
  return {rawUrgency:brown,basis:'Pre-first-picking: Y/(Y+B); lower yellow = riper. Green-like candidates are excluded.',yellowProgress:den?100*(p.yellow||0)/den:0,brownProgress:brown,brownPresent:brown>0};
};

function normalizeStoredPct(r){
  if(!r?.pct)return;
  const oldG=Number(r.pct.green)||0,y=Number(r.pct.yellow)||0,b=Number(r.pct.brown)||0,den=y+b;
  r.greenCandidatePct=oldG;r.pct.green=0;
  if(den){r.pct.yellow=100*y/den;r.pct.brown=100*b/den;}
}
Object.values(APP.results||{}).forEach(t=>{Object.values(t.sides||{}).forEach(normalizeStoredPct);normalizeStoredPct(t.avg);});
try{combineTreeSides();computeTreeRankings();saveLocal();}catch(e){}

const oldAuto=document.getElementById('autoClassOverlayHiRes');
if(oldAuto)oldAuto.style.setProperty('display','none','important');
const stage=document.getElementById('viewerStage'),img=document.getElementById('viewerImg'),manualLayer=document.getElementById('teachOverlayHiRes');
const mask=document.createElement('img');mask.id='autoFruitMaskHiRes';mask.alt='Exact accepted fruit classification mask';
if(stage&&manualLayer)stage.insertBefore(mask,manualLayer);
const css=document.createElement('style');css.textContent=`#autoClassOverlayHiRes{display:none!important}#autoFruitMaskHiRes{position:absolute;z-index:5;display:none;pointer-events:none;max-width:none!important;max-height:none!important;object-fit:fill;image-rendering:auto}#teachOverlayHiRes{z-index:6!important}`;document.head.appendChild(css);
const showToggle=document.getElementById('showAutoMarks'),opacity=document.getElementById('autoMarksOpacity');
const hint=document.querySelector('#autoMarkControls .autoMarkHint');
if(hint)hint.textContent='Exact accepted analysis mask: Yellow, Brown, Dry/Unknown; green marks are green-like candidates and are ignored in pre-picking ripeness. Your corrections are the small rings on top.';

function syncMask(){
  if(!mask||!img||!APP.viewer.teaching||!showToggle?.checked){if(mask)mask.style.display='none';return;}
  const src=APP.viewer.frameRef?.classMaskUrl;
  if(!src||!img.clientWidth||!img.clientHeight){mask.style.display='none';return;}
  mask.style.left=img.offsetLeft+'px';mask.style.top=img.offsetTop+'px';mask.style.width=img.clientWidth+'px';mask.style.height=img.clientHeight+'px';mask.style.opacity=String((Number(opacity?.value)||62)/100);
  if(mask.src!==src)mask.src=src;
  mask.style.display='block';
}

async function ensureMaskForCurrentFrame(){
  const fr=APP.viewer.frameRef;if(!fr||fr.classMaskUrl||!APP.viewer.rawSrc)return syncMask();
  try{
    const raw=new Image();
    await new Promise((resolve,reject)=>{raw.onload=resolve;raw.onerror=reject;raw.src=APP.viewer.rawSrc;});
    const c=document.createElement('canvas');c.width=raw.naturalWidth;c.height=raw.naturalHeight;c.getContext('2d').drawImage(raw,0,0);
    const probe=analyzeCanvas(c);if(probe.classMaskUrl)fr.classMaskUrl=probe.classMaskUrl;
  }catch(e){console.warn('Could not rebuild classification mask',e);}
  syncMask();
}
showToggle?.addEventListener('change',syncMask);opacity?.addEventListener('input',syncMask);
const teachBtn=document.getElementById('teachHereBtn');
if(teachBtn){const prev=teachBtn.onclick;teachBtn.onclick=function(e){const out=prev?.call(this,e);setTimeout(()=>{if(APP.viewer.teaching)ensureMaskForCurrentFrame();else mask.style.display='none';},0);return out;};}
const modal=document.getElementById('viewerModal');if(modal)new MutationObserver(()=>{if(APP.viewer.teaching)syncMask();else mask.style.display='none';}).observe(modal,{attributes:true,attributeFilter:['class']});
img?.addEventListener('load',()=>{if(APP.viewer.teaching)requestAnimationFrame(syncMask);});window.addEventListener('resize',()=>{if(APP.viewer.teaching)requestAnimationFrame(syncMask);});setInterval(()=>{if(APP.viewer.teaching)syncMask();},300);

const baseRender=renderFileResult;
renderFileResult=function(rec){
  baseRender(rec);
  const box=document.getElementById('resultsList')?.firstElementChild,body=box?.querySelector('.resultBody');
  if(body&&(rec.greenCandidate||0)>0){body.insertAdjacentHTML('afterbegin',`<div class="note warn"><b>Green-like candidate signal ≈ ${(rec.greenCandidate||0).toFixed(1)} fruit-equivalents (${(rec.greenCandidatePct||0).toFixed(1)}% diagnostic).</b> It is excluded from the pre-first-picking fruit percentage and ranking. Inspect the green mask in Correct / Teach and relabel false detections.</div>`);}
};

const legend=document.querySelector('.viewerLegend');if(legend){const first=legend.querySelector('.lg');if(first)first.innerHTML='<span class="sw"></span>Green-like candidate — shown for diagnosis, NOT counted in pre-picking ripeness';}
const brand=document.querySelector('.brand small');if(brand)brand.textContent=brand.textContent.replace(/PWA\s+2\.8\.[0-9]+/,'PWA '+PATCH_VERSION);
setTimeout(()=>{const h=document.getElementById('dciPwaHint');if(h)h.textContent=h.textContent.replace(/PWA\s+2\.8\.[0-9]+/,'PWA '+PATCH_VERSION);},500);
})();
