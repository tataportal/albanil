(function(root){
 'use strict';
 root.createAlbanilListBuilder=function({products,addProduct,getSummary,escape,notify}){
  const $=s=>document.querySelector(s),parser=root.AlbanilListParser,byId=new Map(products.map(p=>[p.id,p]));
  const STORE='albanil-lista-borrador-v1';let text='',rows=[];
  try{const saved=JSON.parse(localStorage.getItem(STORE)||'{}');text=typeof saved.text==='string'?saved.text.slice(0,100000):'';
   rows=Array.isArray(saved.rows)?saved.rows.filter(r=>r&&typeof r.query==='string'&&typeof r.original==='string').slice(0,500):[];
  }catch{}
  const price=p=>p.price!=null?`${AlbanilPricing.label(p)}${p.pricePEN!=null&&p.unit?' / '+escape(p.unit):''}`:'Consultar precio';
  function summary(){document.dispatchEvent(new Event('albanil-list-change'));}
  $('#paste-list').value=text;
  $('#paste-list').addEventListener('input',()=>{text=$('#paste-list').value;rows=[];try{localStorage.setItem(STORE,JSON.stringify({version:4,text,rows}));}catch{notify('Mantén esta pestaña abierta para conservar tu lista.');}summary();});
  $('#paste-form').addEventListener('submit',event=>event.preventDefault());
    function searchManual() {
      const query=$('#builder-search').value.trim();
      if(!query){$('#manual-results').innerHTML='';$('#manual-count').textContent='Busca por producto, marca o medida.';const more=$('#manual-mode>a');more.href='?ver=todo';more.textContent='Ver catálogo completo →';return;}
      const matches=parser.catalogSearch(query,products),found=matches.slice(0,12);
      const more=$('#manual-mode>a');more.href='?q='+encodeURIComponent(query);more.textContent=matches.length>12?`Ver los ${matches.length} resultados →`:'Ver resultados en el catálogo →';
      $('#manual-count').textContent=found.length?`${found.length} de ${matches.length} ${matches.length===1?'resultado':'resultados'}. Revisa el producto y su presentación.`:'No encontramos coincidencias. Prueba otro nombre o deja el material pendiente desde «Pegar mi lista».';
      $('#manual-results').innerHTML=found.map(p=>`<article class="manual-product"><a href="?producto=${p.id}" data-product="${p.id}"><img src="${escape(p.image)}" width="64" height="64" alt="${escape(p.title)}"></a><div><p class="product-brand">${escape(p.brand || 'Albañil')}</p><h3><a href="?producto=${p.id}" data-product="${p.id}">${escape(p.title)}</a></h3><p class="manual-reference">Ref. ${escape(p.reference||p.id)} · ${price(p)}</p></div><div class="manual-add"><label class="sr-only" for="manual-qty-${p.id}">Cantidad de ${escape(p.title)}</label><input id="manual-qty-${p.id}" type="number" min="${parser.fractionalUnit(p.unit)?0.01:1}" max="999999" step="${parser.fractionalUnit(p.unit)?0.01:1}" value="1" inputmode="${parser.fractionalUnit(p.unit)?'decimal':'numeric'}"><button class="secondary-button" type="button" data-manual-add="${p.id}">Agregar</button></div></article>`).join('');
    }
    $('#builder-search-form').addEventListener('submit',event=>{event.preventDefault();searchManual();});
    $('#manual-results').addEventListener('click',event=>{
      const button=event.target.closest('[data-manual-add]');if(!button)return;
      const id=Number(button.dataset.manualAdd),input=$(`#manual-qty-${id}`);
      if(!input.reportValidity() || !parser.validOrderQuantity(input.value,byId.get(id)?.unit))return;
      addProduct(id,Number(input.value));summary();
    });

  return {summary,draft:()=>rows.map(r=>({...r})),show(mode){
   const active=['buscar','pegar'].includes(mode)?mode:'archivo';
   $('#paste-mode').hidden=active!=='pegar';$('#manual-mode').hidden=active!=='buscar';$('#upload-mode').hidden=active!=='archivo';
   document.querySelectorAll('[data-builder-mode]').forEach(link=>{if(link.dataset.builderMode===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
   summary();
  }};
 };
})(globalThis);
