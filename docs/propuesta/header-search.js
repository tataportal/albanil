/* Shared, non-navigating suggestions for the public header. */
(() => {
 const input=document.querySelector('#search-input'),form=input?.closest('form');if(!form)return;
 const panel=document.createElement('div');panel.className='header-search-results';panel.id='header-search-results';panel.hidden=true;panel.setAttribute('aria-label','Productos encontrados');form.append(panel);
 const status=document.createElement('span');status.className='sr-only';status.setAttribute('role','status');form.append(status);
 input.setAttribute('aria-controls',panel.id);input.setAttribute('aria-expanded','false');
 let pending,products,timer,revision=0;
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const base=document.querySelector('#catalog-view')?'':'./';
 const close=()=>{revision++;panel.hidden=true;input.setAttribute('aria-expanded','false');};
 async function load(){
  if(window.AlbanilIntakeBridge?.products)return window.AlbanilIntakeBridge.products;
  if(products)return products;
  if(!pending)pending=(async()=>{let response;try{response=await fetch(window.AlbanilSettings.api+'/api/catalog',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();}catch{response=await fetch('catalog.json');}if(!response.ok)throw Error();const data=await response.json();return products=data.products.filter(p=>p.state!=='INACTIVO');})().catch(e=>{pending=null;throw e;});
  return pending;
 }
 function note(text){panel.replaceChildren();const p=document.createElement('p');p.textContent=text;panel.append(p);}
 async function show(){
  const q=input.value.trim(),ticket=++revision;if(!q){close();return;}
  panel.hidden=false;input.setAttribute('aria-expanded','true');note('Buscando productos…');
  try{
   const all=await load();if(ticket!==revision||q!==input.value.trim())return;
   const tokens=normalize(q).split(/\s+/).filter(Boolean);
   const matches=window.AlbanilListParser?AlbanilListParser.catalogSearch(q,all):all.filter(p=>tokens.every(t=>normalize(`${p.title} ${p.brand} ${p.category} ${p.reference||p.id}`).includes(t)));
   panel.replaceChildren();status.textContent=`${matches.length} productos encontrados`;
   if(!matches.length)note('No encontramos productos. Prueba con otra palabra o código.');
   matches.slice(0,6).forEach(p=>{
    const a=document.createElement('a');a.href=`${base}?producto=${encodeURIComponent(p.id)}`;a.className='header-search-result';
    const img=document.createElement('img');img.src=p.imageSmall||p.image;img.alt='';img.width=48;img.height=48;img.addEventListener('error',()=>{img.hidden=true;},{once:true});
    const text=document.createElement('span'),title=document.createElement('strong'),code=document.createElement('small');title.textContent=p.title;code.textContent=`Código ${p.reference||p.id}${p.brand?' · '+p.brand:''}`;text.append(title,code);a.append(img,text);panel.append(a);
   });
   if(matches.length){const more=document.createElement('a');more.href=`${base}?q=${encodeURIComponent(q)}`;more.className='header-search-all';more.textContent=`Ver los ${matches.length} resultados →`;panel.append(more);}
  }catch{if(ticket===revision)note('No pudimos cargar los productos. Intenta nuevamente.');}
 }
 input.addEventListener('input',()=>{revision++;clearTimeout(timer);if(!input.value.trim())close();else timer=setTimeout(show,120);});
 input.addEventListener('focus',()=>{if(input.value.trim())show();});
 form.addEventListener('keydown',e=>{const links=[...panel.querySelectorAll('a')];if(e.key==='Escape'){input.focus();close();}else if(!panel.hidden&&['ArrowDown','ArrowUp'].includes(e.key)&&links.length){e.preventDefault();const i=links.indexOf(document.activeElement),next=e.key==='ArrowDown'?i+1:i-1;if(next<0)input.focus();else links[Math.min(next,links.length-1)].focus();}});
 form.addEventListener('submit',close);panel.addEventListener('click',e=>{if(e.target.closest('a'))close();});
 document.addEventListener('click',e=>{if(!form.contains(e.target))close();});
 form.addEventListener('focusout',()=>setTimeout(()=>{if(!form.contains(document.activeElement))close();},0));
})();
