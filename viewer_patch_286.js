(()=>{
'use strict';
const PATCH_VERSION='2.8.6';
const ML_DB='dci_ml_v1', ML_STORE='samples';
const ML_CLASSES=['yellow','brown','dry','green','notfruit'];
const CODE_TO_CLASS={1:'green',2:'yellow',4:'brown',5:'dry'};
const CLASS_TO_CODE={green:1,yellow:2,brown:4,dry:5,notfruit:0};

function openMLDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(ML_DB,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(ML_STORE)){
        const s=db.createObjectStore(ML_STORE,{keyPath:'id'});
        s.createIndex('sourceKey','sourceKey',{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Learning database error'));
  });
}
async function mlAll(){
  const db=await openMLDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ML_STORE,'readonly'),req=tx.objectStore(ML_STORE).getAll();
    req.onsuccess=()=>{db.close();resolve(req.result||[])};
    req.onerror=()=>{db.close();reject(req.error)};
  });
}
async function mlReplaceSource(sourceKey,samples){
  const db=await openMLDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(ML_STORE,'readwrite'),store=tx.objectStore(ML_STORE),idx=store.index('sourceKey'),req=idx.getAllKeys(sourceKey);
    req.onsuccess=()=>{
      (req.result||[]).forEach(k=>store.delete(k));
      samples.forEach(s=>store.put(s));
    };
    req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>{db.close();reject(tx.error)};
    tx.onabort=()=>{db.close();reject(tx.error)};
  });
}
let ML_CACHE=[];
async function reloadML(){
  try{ML_CACHE=(await mlAll()).filter(s=>s&&ML_CLASSES.includes(s.cls)&&Array.isArray(s.f));}
  catch(e){console.warn('Learning model unavailable',e);ML_CACHE=[];}
  renderMLStatus();
}
function hashString(s){
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
  return h.toString(36);
}
function sourceKey(raw){
  raw=String(raw||'');
  const edge=raw.length>8192?raw.slice(0,4096)+raw.slice(-4096):raw;
  return 'img_'+hashString(raw.length+'|'+edge);
}
function meanStd(vals){
  if(!vals.length)return [0,0];
  let s=0,s2=0;for(const v of vals){s+=v;s2+=v*v;}
  const m=s/vals.length;return [m,Math.sqrt(Math.max(0,s2/vals.length-m*m))];
}
function featureFromImageData(data,w,h,x0,y0,x1,y1){
  x0=Math.max(0,Math.floor(x0));y0=Math.max(0,Math.floor(y0));x1=Math.min(w,Math.ceil(x1));y1=Math.min(h,Math.ceil(y1));
  const sats=[],vals=[],grays=[];let sr=0,sg=0,sb=0,shx=0,shy=0,n=0,edge=0,en=0;
  const step=Math.max(1,Math.floor(Math.max(x1-x0,y1-y0)/32));
  for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){
    const i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2],hsv=rgbToHsv(r,g,b),gray=(.299*r+.587*g+.114*b)/255;
    const hr=hsv.h*Math.PI/180;shx+=Math.cos(hr);shy+=Math.sin(hr);sats.push(hsv.s);vals.push(hsv.v);grays.push(gray);
    sr+=r/255;sg+=g/255;sb+=b/255;n++;
    if(x+step<x1){const j=(y*w+(x+step))*4;edge+=Math.abs(gray-(.299*data[j]+.587*data[j+1]+.114*data[j+2])/255);en++;}
    if(y+step<y1){const j=((y+step)*w+x)*4;edge+=Math.abs(gray-(.299*data[j]+.587*data[j+1]+.114*data[j+2])/255);en++;}
  }
  if(!n)return null;
  const [ms,ss]=meanStd(sats),[mv,sv]=meanStd(vals),[mg,sgy]=meanStd(grays);
  const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=Math.max(1,(x1-x0)*.25),ry=Math.max(1,(y1-y0)*.25);
  let cr=0,cg=0,cb=0,cn=0;
  for(let y=Math.max(y0,Math.floor(cy-ry));y<Math.min(y1,Math.ceil(cy+ry));y+=step)for(let x=Math.max(x0,Math.floor(cx-rx));x<Math.min(x1,Math.ceil(cx+rx));x+=step){
    const i=(y*w+x)*4;cr+=data[i]/255;cg+=data[i+1]/255;cb+=data[i+2]/255;cn++;
  }
  return [shx/n,shy/n,ms,ss,mv,sv,sr/n,sg/n,sb/n,mg,sgy,en?edge/en:0,cn?cr/cn:sr/n,cn?cg/cn:sg/n,cn?cb/cn:sb/n];
}
function featureDistance(a,b){
  const wt=[1.35,1.35,1.1,.55,.75,.55,.45,.45,.45,.45,.7,.85,.35,.35,.35];
  let s=0,ws=0;for(let i=0;i<Math.min(a.length,b.length,wt.length);i++){const d=a[i]-b[i];s+=wt[i]*d*d;ws+=wt[i];}
  return Math.sqrt(s/Math.max(.001,ws));
}
function mlPredict(f,condition){
  if(!f||ML_CACHE.length<3)return null;
  const nn=ML_CACHE.map(s=>({s,d:featureDistance(f,s.f)*(s.condition&&condition&&s.condition!==condition?1.08:1)})).sort((a,b)=>a.d-b.d).slice(0,7);
  if(!nn.length)return null;
  const votes={};for(const q of nn){const w=1/Math.pow(q.d+.035,2);votes[q.s.cls]=(votes[q.s.cls]||0)+w;}
  const ranked=Object.entries(votes).sort((a,b)=>b[1]-a[1]),top=ranked[0],second=ranked[1]?.[1]||0,total=ranked.reduce((s,x)=>s+x[1],0);
  const confidence=top[1]/Math.max(.0001,total),margin=(top[1]-second)/Math.max(.0001,top[1]),nearest=nn[0].d;
  if(confidence<.56||margin<.16||nearest>.48)return null;
  return {cls:top[0],confidence,nearest};
}

function canvasPixels(source,w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,w,h);
  return ctx.getImageData(0,0,w,h).data;
}
let ML_CURRENT_CANVAS=null,ML_LAST_MASK=null,ML_LAST_DECISIONS=[];
const collectBeforeML=collectDiagnosticComponents;
collectDiagnosticComponents=function(classes,w,h,x0,y0,x1,y1){
  const comps=collectBeforeML(classes,w,h,x0,y0,x1,y1);
  ML_LAST_DECISIONS=[];
  if(!ML_CURRENT_CANVAS||ML_CACHE.length<3)return comps;
  let data;try{data=canvasPixels(ML_CURRENT_CANVAS,w,h);}catch(e){return comps;}
  const original=classes.slice(),condition=APP.viewer?.teachCondition||'normal';
  for(const c of comps){
    if(![1,2,4,5,6].includes(c.code))continue;
    const pad=Math.max(2,Math.round(Math.min(c.maxX-c.minX+1,c.maxY-c.minY+1)*.18));
    const f=featureFromImageData(data,w,h,c.minX-pad,c.minY-pad,c.maxX+1+pad,c.maxY+1+pad);
    const pred=mlPredict(f,condition);if(!pred)continue;
    const oldCode=c.code,newCode=CLASS_TO_CODE[pred.cls];if(newCode===undefined)continue;
    c.mlOriginalCode=oldCode;c.mlPrediction=pred.cls;c.mlConfidence=pred.confidence;
    ML_LAST_DECISIONS.push({from:CODE_TO_CLASS[oldCode]||'unknown',to:pred.cls,confidence:pred.confidence});
    for(let y=c.minY;y<=c.maxY;y++)for(let x=c.minX;x<=c.maxX;x++){const q=y*w+x;if(original[q]===oldCode)classes[q]=newCode;}
    c.code=newCode;
  }
  try{
    const cv=document.createElement('canvas');cv.width=w;cv.height=h;const ctx=cv.getContext('2d'),im=ctx.createImageData(w,h),d=im.data;
    const pal={1:[38,170,92],2:[255,215,35],4:[138,88,51],5:[120,102,143],6:[160,168,162]};
    for(let q=0;q<classes.length;q++){const rgb=pal[classes[q]];if(!rgb)continue;const i=q*4;d[i]=rgb[0];d[i+1]=rgb[1];d[i+2]=rgb[2];d[i+3]=210;}
    ctx.putImageData(im,0,0);ML_LAST_MASK=cv.toDataURL('image/png');
  }catch(e){}
  return comps.filter(c=>c.code!==0);
};

const analyzeBeforeML=analyzeCanvas;
analyzeCanvas=function(sourceCanvas){
  ML_CURRENT_CANVAS=sourceCanvas;ML_LAST_MASK=null;ML_LAST_DECISIONS=[];
  let r;try{r=analyzeBeforeML(sourceCanvas);}finally{ML_CURRENT_CANVAS=null;}
  if(ML_LAST_MASK)r.classMaskUrl=ML_LAST_MASK;
  r.mlDecisions=ML_LAST_DECISIONS.slice();r.mlModelSize=ML_CACHE.length;
  return r;
};

async function imageFromDataURL(raw){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=raw;});}
function labelPatchRadius(img,fr){
  const aw=Number(fr?.analysisWidth)||420,ts=Number(fr?.fruitEq?.typicalShort)||18,scale=img.naturalWidth/Math.max(1,aw);
  return Math.max(8,Math.min(Math.min(img.naturalWidth,img.naturalHeight)*.055,ts*scale*.72));
}
async function samplesFromViewer(){
  const raw=APP.viewer.rawSrc,labels=APP.viewer.corrections||[],fr=APP.viewer.frameRef,condition=APP.viewer.teachCondition||'normal';
  if(!raw||!labels.length)return {sourceKey:null,samples:[],skipped:0};
  const image=await imageFromDataURL(raw),c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data,r=labelPatchRadius(image,fr),key=sourceKey(raw);
  const samples=[];let skipped=0;
  labels.forEach((l,i)=>{
    if(!ML_CLASSES.includes(l.cls)){skipped++;return;}
    const x=l.x*c.width,y=l.y*c.height,f=featureFromImageData(data,c.width,c.height,x-r,y-r,x+r,y+r);if(!f){skipped++;return;}
    samples.push({id:key+'_'+i+'_'+l.cls+'_'+Math.round(l.x*10000)+'_'+Math.round(l.y*10000),sourceKey:key,cls:l.cls,f,condition,partial:!!l.partial,x:l.x,y:l.y,createdAt:new Date().toISOString()});
  });
  return {sourceKey:key,samples,skipped};
}
async function backfillSavedTraining(){
  if(typeof dbAllTraining!=='function')return;
  try{
    const all=await dbAllTraining(),existing=new Set(ML_CACHE.map(s=>s.sourceKey));
    for(const ex of all){
      if(!ex?.imageData||!Array.isArray(ex.labels)||!ex.labels.length)continue;
      const key=sourceKey(ex.imageData);if(existing.has(key))continue;
      const im=await imageFromDataURL(ex.imageData),c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
      const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data,r=Math.max(8,Math.min(c.width,c.height)*.018),samples=[];
      ex.labels.forEach((l,i)=>{
        if(!ML_CLASSES.includes(l.cls))return;
        const x=l.x*c.width,y=l.y*c.height,f=featureFromImageData(data,c.width,c.height,x-r,y-r,x+r,y+r);if(f)samples.push({id:key+'_'+i+'_'+l.cls+'_'+Math.round(l.x*10000)+'_'+Math.round(l.y*10000),sourceKey:key,cls:l.cls,f,condition:ex.condition||'normal',partial:!!l.partial,x:l.x,y:l.y,createdAt:ex.createdAt||new Date().toISOString()});
      });
      if(samples.length){await mlReplaceSource(key,samples);existing.add(key);ML_CACHE.push(...samples);}
      await new Promise(r=>setTimeout(r,0));
    }
    renderMLStatus();
  }catch(e){console.warn('Could not backfill saved teaching examples',e);}
}

const fullRow=document.getElementById('teachComplete')?.closest('label');if(fullRow)fullRow.style.display='none';
const partial=document.getElementById('teachPartial')?.closest('label');
if(partial)partial.insertAdjacentHTML('afterend','<div id="mlTeachExplainer" style="font-size:10px;line-height:1.4;color:var(--muted);padding:5px 0"><b>Teach selected fruits only.</b> You do not need to finish the picture. Every saved Yellow, Brown, Dry, Green or Not-fruit label becomes a persistent training example for future images. “Uncertain” is saved for review but does not train the classifier.</div>');
const saveBtn=document.getElementById('teachSaveBtn'),oldSave=saveBtn?.onclick;
if(saveBtn){
  saveBtn.textContent='Teach selected fruits';
  saveBtn.onclick=async function(e){
    const complete=document.getElementById('teachComplete');if(complete)complete.checked=false;APP.viewer.teachComplete=false;
    let pack=null;try{pack=await samplesFromViewer();}catch(err){console.warn('Could not extract learning samples',err);}
    const out=await oldSave?.call(this,e);
    if(pack?.sourceKey&&pack.samples.length){
      try{await mlReplaceSource(pack.sourceKey,pack.samples);await reloadML();toast(`Learned ${pack.samples.length} selected fruit${pack.samples.length===1?'':'s'} · model ${ML_CACHE.length}`);}
      catch(err){toast('Teaching labels saved, but learning model could not update');}
    }else if(pack?.skipped){toast('Labels saved; Uncertain labels do not train the model');}
    return out;
  };
}

const panel=document.getElementById('teachPanel'),statusBox=document.createElement('div');statusBox.id='mlModelStatus';statusBox.className='note ok';statusBox.style.margin='8px 0 0';panel?.appendChild(statusBox);
function renderMLStatus(){
  if(!statusBox)return;
  const counts={yellow:0,brown:0,dry:0,green:0,notfruit:0};ML_CACHE.forEach(s=>{if(counts[s.cls]!==undefined)counts[s.cls]++;});
  statusBox.innerHTML=`<b>Persistent learning model:</b> ${ML_CACHE.length} examples · Yellow ${counts.yellow} · Brown ${counts.brown} · Dry ${counts.dry} · Green/reject ${counts.green} · Not fruit ${counts.notfruit}. These examples are used to reclassify accepted fruit candidates in future analyses.`;
}
const oldUpdateTeachStatus=updateTeachStatus;
updateTeachStatus=function(){
  oldUpdateTeachStatus?.();
  const s=document.getElementById('teachStatus');if(!s)return;
  const n=(APP.viewer.corrections||[]).length;
  s.innerHTML=`Selected labels in this picture: <b>${n}</b>. You do <b>not</b> need to label the whole picture. Save when you have useful examples; they train future analyses.`;
};

reloadML().then(()=>backfillSavedTraining());
const brand=document.querySelector('.brand small');if(brand)brand.textContent=brand.textContent.replace(/PWA\s+2\.8\.[0-9]+/,'PWA '+PATCH_VERSION);
setTimeout(()=>{const h=document.getElementById('dciPwaHint');if(h)h.textContent=h.textContent.replace(/PWA\s+2\.8\.[0-9]+/,'PWA '+PATCH_VERSION);},500);
})();
