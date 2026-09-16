/* One entry point for the shared materials list, on every public page. */
(() => {
 const key='albanil-list-header-count-v1',link=document.querySelector('.header-list-cta');if(!link)return;
 const initial=link.getAttribute('href'),icon=link.querySelector('svg')?.outerHTML||'';
 const cart='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2l2.5 12h11L21 7H6M8 19h.01M18 19h.01"/><circle cx="8" cy="19" r="1"/><circle cx="18" cy="19" r="1"/></svg>';
 let count=0;
 function render(n){count=Math.max(0,Number(n)||0);link.href=count?initial+'&revisar=1':initial;link.setAttribute('aria-label',count?`Mi lista, ${count} ${count===1?'material':'materiales'}. Ver y editar`:'Arma tu lista');link.innerHTML=(count?cart:icon)+`<span>${count?'Mi lista':'Arma tu lista'}</span>`+(count?`<span class="quote-count">${count}</span>`:'');}
 try{render(localStorage.getItem(key));}catch{render(0);}
 document.addEventListener('albanil-list-count',e=>{render(e.detail);try{localStorage.setItem(key,String(count));}catch{}});
 window.addEventListener('storage',e=>{if(e.key===key)render(e.newValue);});
 link.addEventListener('click',e=>{if(count&&window.AlbanilIntakeBridge&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();e.stopPropagation();document.dispatchEvent(new Event('albanil-open-list'));}});
})();
