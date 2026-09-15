'use strict';
(async()=>{
 try{
  const base=window.AlbanilSettings?.api;if(!base)return;
  const response=await fetch(base+'/api/banners',{cache:'no-store'});if(!response.ok)return;
  const data=await response.json();const url=b=>new URL(b.url,base.replace(/\/$/,'')+'/').href;
  const desktop=data['home-desktop'],mobile=data['home-mobile'];
  const hero=document.querySelector('.order-hero-banner');
  if(hero&&desktop&&mobile){hero.style.setProperty('--banner-desktop',`url("${url(desktop)}")`);hero.style.setProperty('--banner-mobile',`url("${url(mobile)}")`);hero.style.setProperty('--banner-ratio',`${desktop.width}/${desktop.height}`);hero.style.setProperty('--banner-mobile-ratio',`${mobile.width}/${mobile.height}`);}
  const img=document.querySelector('.company-banner img');
  if(img&&data['nosotros-desktop']){const d=data['nosotros-desktop'],m=data['nosotros-mobile'];const picture=document.createElement('picture');if(m){const source=document.createElement('source');source.media='(max-width: 700px)';source.srcset=url(m);picture.append(source);}img.replaceWith(picture);picture.append(img);img.src=url(d);img.width=d.width;img.height=d.height;img.style.width='100%';img.style.height='auto';img.style.display='block';}
 }catch{/* Existing banners remain available when the service cannot be reached. */}
})();
