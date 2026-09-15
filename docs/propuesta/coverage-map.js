'use strict';
(()=>{
 const section=document.querySelector('.coverage-map-section');if(!section)return;
 const ids=['12','19','09'],buttons=[...section.querySelectorAll('[data-region]')],paths=ids.map(id=>section.querySelector(`[data-department="${id}"]`));
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let timers=[];
 function stop(){timers.forEach(clearTimeout);timers=[];}
 function select(id){buttons.forEach(b=>{const current=b.dataset.region===id;b.classList.toggle('is-current',current);b.setAttribute('aria-pressed',String(current));});paths.forEach(p=>p.classList.toggle('is-current',p.dataset.department===id));}
 function showAll(){stop();paths.forEach(p=>p.classList.add('is-highlighted'));select('12');}
 function play(){stop();if(reduced.matches){showAll();return;}paths.forEach(p=>p.classList.remove('is-highlighted','is-current'));buttons.forEach(b=>{b.classList.remove('is-current');b.setAttribute('aria-pressed','false');});ids.forEach((id,i)=>timers.push(setTimeout(()=>{paths[i].classList.add('is-highlighted');select(id);},400+i*2000)));}
 buttons.forEach(b=>b.addEventListener('click',()=>{showAll();select(b.dataset.region);}));section.querySelector('#replay-coverage').addEventListener('click',play);
 reduced.addEventListener('change',showAll);
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){play();observer.disconnect();}},{threshold:.25});observer.observe(section);}else showAll();
})();
