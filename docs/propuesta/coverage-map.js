'use strict';
(()=>{
 const section=document.querySelector('.coverage-map-section');if(!section)return;
 const buttons=[...section.querySelectorAll('[data-region]')],ids=buttons.map(b=>b.dataset.region),paths=ids.map(id=>section.querySelector(`[data-department="${id}"]`));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let timer=null,index=0,visible=false;
 function stop(){clearInterval(timer);timer=null;}
 function select(i){index=i;const id=ids[i];buttons.forEach(b=>{const active=b.dataset.region===id;b.classList.toggle('is-current',active);b.setAttribute('aria-pressed',String(active));});paths.forEach(p=>{const active=p.dataset.department===id;p.classList.toggle('is-highlighted',active);p.classList.toggle('is-current',active);});}
 function resume(){stop();if(visible&&!document.hidden&&!reduced.matches)timer=setInterval(()=>select((index+1)%ids.length),2500);}
 buttons.forEach(b=>b.addEventListener('click',()=>{select(ids.indexOf(b.dataset.region));resume();}));
 reduced.addEventListener('change',resume);document.addEventListener('visibilitychange',resume);select(0);
 if('IntersectionObserver' in window){new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);resume();},{threshold:.25}).observe(section);}else{visible=true;resume();}
})();
