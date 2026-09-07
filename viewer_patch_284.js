(()=>{
'use strict';
const PATCH_VERSION='2.8.4';

const stage=document.getElementById('viewerStage');
const img=document.getElementById('viewerImg');
const manualLayer=document.getElementById('teachOverlayHiRes');
const modal=document.getElementById('viewerModal');
const panel=document.getElementById('teachPanel');
if(!stage||!img||!manualLayer||!modal||!panel)return;

const style=document.createElement('style');
style.textContent=`
#autoClassOverlayHiRes{position:absolute;z-index:5;display:none;pointer-events:none;max-width:none!important;max-height:none!important;object-fit:fill;opacity:.48}
#teachOverlayHiRes{z-index:6!important}
#autoMarkControls{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:0 0 8px;padding:7px 9px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:10px;color:var(--muted)}
#autoMarkControls label{display:flex;align-items:center;gap:6px;font-weight:850;color:var(--text)}
#autoMarkControls input[type=checkbox]{width:18px;height:18px;accent-color:var(--green)}
#autoMarkControls input[type=range]{width:110px;accent-color:var(--green)}
#autoMarkControls .autoMarkHint{flex:1 1 220px;line-height:1.3}
#savedTeachNotice{font-weight:850;color:var(--green);display:none}
@media(max-width:760px){#autoMarkControls{position:sticky;top:0;z-index:20;background:#fff}#autoMarkControls input[type=range]{width:88px}}
`;
document.head.appendChild(style);

const autoLayer=document.createElement('img');
autoLayer.id='autoClassOverlayHiRes';
autoLayer.alt='Automatic classification overlay';
stage.insertBefore(autoLayer,manualLayer);

const controls=document.createElement('div');
controls.id='autoMarkControls';
controls.innerHTML=`<label><input type="checkbox" id="showAutoMarks" checked> Show app markings</label><label>Opacity <input type="range" id="autoMarksOpacity" min="20" max="75" value="55"></label><span class="autoMarkHint">App classification is the colored layer. Your corrections are the small lettered rings on top.</span><span id="savedTeachNotice">Saved labels restored</span>`;
const classes=panel.querySelector('.teachClasses');
panel.insertBefore(controls,classes||panel.firstChild);
const showToggle=document.getElementById('showAutoMarks');
const opacity=document.getElementById('autoMarksOpacity');
const savedNotice=document.getElementById('savedTeachNotice');

function syncAutoLayer(){
  if(!APP.viewer.teaching||!showToggle.checked||!APP.viewer.src||!img.clientWidth||!img.clientHeight){autoLayer.style.display='none';return;}
  autoLayer.style.left=img.offsetLeft+'px';
  autoLayer.style.top=img.offsetTop+'px';
  autoLayer.style.width=img.clientWidth+'px';
  autoLayer.style.height=img.clientHeight+'px';
  autoLayer.style.opacity=String((Number(opacity.value)||48)/100);
  if(autoLayer.src!==APP.viewer.src)autoLayer.src=APP.viewer.src;
  autoLayer.style.display='block';
}
showToggle.onchange=syncAutoLayer;
opacity.oninput=syncAutoLayer;

function showSavedNotice(n,full){
  savedNotice.textContent=`Saved labels restored: ${n}${full?' · full correction':''}`;
  savedNotice.style.display='inline';
}
function clearSavedNotice(){savedNotice.style.display='none';savedNotice.textContent='';}

async function restoreSavedTeachingForCurrentImage(){
  clearSavedNotice();
  const raw=APP.viewer.rawSrc;
  if(!raw||typeof dbAllTraining!=='function')return;
  try{
    const all=await dbAllTraining();
    const matches=all.filter(ex=>ex&&ex.imageData===raw&&Array.isArray(ex.labels)&&ex.labels.length);
    if(!matches.length)return;
    matches.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const ex=matches[0];
    const fr=APP.viewer.frameRef,rec=APP.viewer.recRef;
    if(!(APP.viewer.corrections||[]).length){
      APP.viewer.corrections=ex.labels.map(x=>({...x}));
    }
    APP.viewer.teachCondition=ex.condition||'normal';
    APP.viewer.teachComplete=!!ex.fullyCorrected;
    const cond=document.getElementById('teachCondition'),complete=document.getElementById('teachComplete');
    if(cond)cond.value=APP.viewer.teachCondition;
    if(complete)complete.checked=APP.viewer.teachComplete;
    if(fr){
      fr.trainingId=ex.id;
      fr.manualCorrections=ex.labels.map(x=>({...x}));
      fr.teachCondition=ex.condition||'normal';
      if(ex.fullyCorrected&&typeof manualFrameMetrics==='function'){
        const m=manualFrameMetrics(ex.labels,fr);
        Object.assign(fr,m,{manualTruth:true});
        if(rec&&Array.isArray(rec.frames)&&typeof aggregateFrames==='function')Object.assign(rec,aggregateFrames(rec.frames));
      }
    }
    if(APP.viewer.teaching&&typeof renderTeachImage==='function')renderTeachImage();
    if(typeof updateTeachStatus==='function')updateTeachStatus();
    showSavedNotice(ex.labels.length,!!ex.fullyCorrected);
  }catch(e){console.warn('Could not restore saved teaching labels',e);}
}

const previousOpenViewer=openViewer;
openViewer=function(...args){
  clearSavedNotice();
  autoLayer.style.display='none';
  previousOpenViewer(...args);
  setTimeout(()=>{restoreSavedTeachingForCurrentImage();syncAutoLayer();},0);
};

const teachBtn=document.getElementById('teachHereBtn');
if(teachBtn){
  const previousTeach=teachBtn.onclick;
  teachBtn.onclick=function(e){
    const out=previousTeach?.call(this,e);
    setTimeout(()=>{
      if(APP.viewer.teaching){
        syncAutoLayer();
        restoreSavedTeachingForCurrentImage();
      }else autoLayer.style.display='none';
    },0);
    return out;
  };
}

const saveBtn=document.getElementById('teachSaveBtn');
const complete=document.getElementById('teachComplete');
function clarifySaveButton(){
  if(!saveBtn)return;
  saveBtn.textContent=complete?.checked?'Save & apply full correction':'Save teaching labels';
}
if(complete){complete.addEventListener('change',clarifySaveButton);}
clarifySaveButton();

if(saveBtn&&typeof dbAllTraining==='function'){
  const previousSave=saveBtn.onclick;
  saveBtn.onclick=async function(e){
    const raw=APP.viewer.rawSrc;
    const before=(APP.viewer.corrections||[]).length;
    const out=await previousSave?.call(this,e);
    try{
      const all=await dbAllTraining();
      const hit=all.filter(ex=>ex&&ex.imageData===raw&&Array.isArray(ex.labels)).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
      if(hit&&hit.labels.length>=before){
        showSavedNotice(hit.labels.length,!!hit.fullyCorrected);
      }
    }catch(err){}
    return out;
  };
}

img.addEventListener('load',()=>{if(APP.viewer.teaching)requestAnimationFrame(syncAutoLayer);});
window.addEventListener('resize',()=>{if(APP.viewer.teaching)requestAnimationFrame(syncAutoLayer);});
setInterval(()=>{if(APP.viewer.teaching)syncAutoLayer();},300);

const brand=document.querySelector('.brand small');
if(brand)brand.textContent=brand.textContent.replace(/PWA\s+2\.8\.[0-9]+/,'PWA '+PATCH_VERSION);
setTimeout(()=>{
  const hint=document.getElementById('dciPwaHint');
  if(hint)hint.textContent=hint.textContent.replace(/PWA\s+2\.8\.[0-9]+/,'PWA '+PATCH_VERSION);
},500);
})();
