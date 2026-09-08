(()=>{
'use strict';
const PATCH_VERSION='2.8.8';
const FAV='./icons/favicon-32.png';

let fav=document.querySelector('link[rel~="icon"]');
if(!fav){fav=document.createElement('link');fav.rel='icon';document.head.appendChild(fav);}
fav.type='image/png';fav.sizes='32x32';fav.href=FAV+'?v=288';

let shortcut=document.querySelector('link[rel="shortcut icon"]');
if(!shortcut){shortcut=document.createElement('link');shortcut.rel='shortcut icon';document.head.appendChild(shortcut);}
shortcut.type='image/png';shortcut.href=FAV+'?v=288';

const logo=document.querySelector('.logo');
if(logo){
  logo.innerHTML=`<img src="${FAV}?v=288" alt="NAVIDATE" style="display:block;width:100%;height:100%;object-fit:cover">`;
  logo.style.background='none';logo.style.padding='0';logo.style.overflow='hidden';logo.style.color='transparent';
}

const brand=document.querySelector('.brand small');
if(brand)brand.textContent=brand.textContent.replace(/PWA\s+2\.8\.[0-9]+/,'PWA '+PATCH_VERSION);
setTimeout(()=>{const h=document.getElementById('dciPwaHint');if(h)h.textContent=h.textContent.replace(/PWA\s+2\.8\.[0-9]+/,'PWA '+PATCH_VERSION);},500);
})();
