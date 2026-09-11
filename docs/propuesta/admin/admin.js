'use strict';
(() => {
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const local=['127.0.0.1','localhost'].includes(location.hostname);
 const demo=!local||new URLSearchParams(location.search).has('demo');
 let exchangeRate={rate:null,version:0,updated_at:null};
 let csrf='',products=[],requests=[],limit=30,editing=null,requestEditing=null;
 const fractional=new Set(['metro','kg','litro','m2','m3']);
 const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const money=p=>p.price===null||p.price===undefined?'Por confirmar':`${p.currency==='USD'?'US$':'S/'} ${Number(p.price).toFixed(2)}`;
 function message(t){$('#message').textContent=t;}
 async function api(path,options={}) {
  if(demo){
   if(!options.method){if(path==='products')return {products};if(path==='requests')return {requests};if(path==='exchange-rate')return exchangeRate;}
   if(options.method==='PATCH'){const values=JSON.parse(options.body);if(path==='exchange-rate'){if(!AlbanilPricing.validRate(values.rate))throw Error('Tipo de cambio inválido.');return {rate:Number(values.rate),version:exchangeRate.version+1,updated_at:new Date().toISOString()};}const collection=path.startsWith('products/')?products:requests;const item=collection.find(i=>String(i.id??i.reference)===path.split('/')[1]);if(!item)throw Error('Ejemplo no encontrado.');const result={...item,...values,version:(item.version||0)+1};if(path.startsWith('products/')){result.price=values.price===''?null:Number(values.price);result.stock=values.stock===''?null:Number(values.stock);result.availability=result.stock===null?'Por confirmar':result.stock>0?'Disponible':'Agotado';}return result;}
   throw Error('Acción no disponible en la demostración.');
  }
  const response=await fetch('/api/'+path,{...options,cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
  let data;try{data=await response.json();}catch{throw new Error('No pudimos conectar con el servicio privado.');}
  if(response.status===401){$('#workspace').hidden=true;$('#login-view').hidden=false;$('#logout').hidden=true;csrf='';}
  if(!response.ok)throw new Error(data.error||'No pudimos completar la operación.');return data;
 }
 function renderProducts(){
  const q=normalize($('#product-search').value),state=$('#stock-filter').value;
  const found=products.filter(p=>(!q||normalize(`${p.id} ${p.sku} ${p.title} ${p.brand}`).includes(q))&&(!state||p.availability===state));
  $('#product-count').textContent=`${Math.min(limit,found.length)} de ${found.length} productos`;
  $('#product-rows').innerHTML=found.slice(0,limit).map(p=>`<tr><td><div class="table-product"><img src="../${esc(p.image)}" alt="" width="50" height="50"><div><strong>${esc(p.title)}</strong><small>${esc(p.brand)} · ${p.sku?`SKU ${esc(p.sku)}`:`Ref. ${p.id}`}</small></div></div></td><td>${money(p)}${p.currency==='USD'?`<small>En la web: ${AlbanilPricing.label(AlbanilPricing.apply(p,exchangeRate.rate))}</small>`:''}<small>${esc(p.unit||'Unidad por confirmar')}</small></td><td>${p.stock===null?'—':esc(p.stock)}</td><td><span class="availability" data-state="${esc(p.availability)}">${esc(p.availability)}</span></td><td><button class="secondary-button" data-edit="${p.id}" aria-label="Editar ${esc(p.title)}">Editar</button></td></tr>`).join('')||'<tr><td colspan="5">No encontramos productos con esos filtros.</td></tr>';
  $('#more-products').hidden=limit>=found.length;$('#more-products').textContent=`Ver ${Math.min(30,found.length-limit)} más`;
 }
 function savePreview(){
  if(!demo)return;
  try{localStorage.setItem(AlbanilPricing.demoKey,JSON.stringify({rate:exchangeRate.rate,updated_at:exchangeRate.updated_at,products:products.filter(p=>p.price!=null).map(p=>({id:p.id,price:p.price,currency:p.currency,unit:p.unit,tax:p.tax}))}));}catch{throw Error('El navegador no permite guardar la vista de prueba.');}
 }
 function renderFX(){
  $('#fx-current').textContent=exchangeRate.rate?`Actual: 1 US$ = S/ ${Number(exchangeRate.rate).toFixed(4)}${exchangeRate.updated_at?' · Actualizado '+new Date(exchangeRate.updated_at).toLocaleString('es-PE'):''}`:'Todavía no hay un tipo de cambio guardado.';
  $('#fx-rate').value=exchangeRate.rate??'';$('#fx-demo-note').hidden=!demo;
  $('#fx-catalog-link').href=demo?'../?ver=todo&demo=tipo-cambio':'../?ver=todo';$('#fx-home-link').href=demo?'../?demo=tipo-cambio':'../';previewFX();
 }
 function previewFX(){
  const value=$('#fx-rate').value,valid=AlbanilPricing.validRate(value),affected=products.filter(p=>p.currency==='USD'&&p.price!=null);
  $('#fx-impact-count').textContent=`${affected.length} productos en dólares con precio. ${valid?'Así se verán en la web:':'Ingresa un tipo de cambio para comparar.'}`;
  $('#fx-preview').innerHTML=affected.slice(0,5).map(p=>`<tr><td>${esc(p.title)}<small>${money(p)}</small></td><td>${AlbanilPricing.label(AlbanilPricing.apply(p,exchangeRate.rate))}</td><td>${valid?AlbanilPricing.label(AlbanilPricing.apply(p,value)):'—'}</td></tr>`).join('')||'<tr><td colspan="3">Selecciona USD al editar un producto para incluirlo en la conversión.</td></tr>';
 }
 $('#fx-rate').addEventListener('input',previewFX);
 [$('#fx-catalog-link'),$('#fx-home-link')].forEach(link=>link.addEventListener('click',e=>{try{savePreview();}catch(error){e.preventDefault();$('#fx-error').textContent=error.message;}}));
 $('#fx-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;$('#fx-error').textContent='';
  try{if(!AlbanilPricing.validRate($('#fx-rate').value))throw Error('Ingresa un tipo de cambio positivo con máximo 4 decimales.');
   exchangeRate=await api('exchange-rate',{method:'PATCH',body:JSON.stringify({rate:Number($('#fx-rate').value),version:exchangeRate.version})});
   if(demo)savePreview();renderFX();renderProducts();message(demo?'Tipo de cambio aplicado a la vista de prueba. Abre «Ver precios en la web».':'Tipo de cambio guardado. La web lo usará al cargar los precios.');
  }catch(error){$('#fx-error').textContent=error.message;}finally{button.disabled=false;}
 });
 const pending=r=>!['Terminada','Cerrada','Cotizada'].includes(r.status)&&(r.status==='Cotización parcial'||r.items.some(i=>i.pending||i.quantity===null)||!r.items.length);
 function renderRequests(){
  const q=normalize($('#request-search').value),state=$('#request-filter').value;
  const found=requests.filter(r=>(!state||(state==='pending'?pending(r):r.status===state))&&normalize(`${r.reference} ${r.customer.name} ${r.customer.phone} ${r.customer.company}`).includes(q));
  $('#stat-new').textContent=requests.filter(r=>r.status==='Nueva').length;$('#stat-active').textContent=requests.filter(r=>r.status==='En atención').length;$('#stat-pending').textContent=requests.filter(pending).length;$('#request-count').textContent=`${found.length} solicitudes · ordenadas por llegada`;
  $('#new-count').textContent=requests.filter(r=>r.status==='Nueva').length||'';
  $('#request-rows').innerHTML=found.map(r=>`<article class="request-row"><div><p>${esc(r.reference)} · ${esc(new Date(r.created_at).toLocaleString('es-PE'))}</p><h2>${esc(r.customer.name)}</h2><p>${r.items.length} materiales · ${(r.attachments||[]).length} archivos · ${esc(r.status)}${r.agent?' · '+esc(r.agent):' · Sin asignar'}</p></div><button class="secondary-button" data-request="${esc(r.reference)}" aria-label="Ver solicitud ${esc(r.reference)}">Ver solicitud →</button></article>`).join('')||'<p class="admin-intro">No hay solicitudes para mostrar.</p>';
 }
 async function refresh(){const [p,r,fx]=await Promise.all([api('products'),api('requests'),api('exchange-rate')]);products=p.products;requests=r.requests;exchangeRate=fx;renderProducts();renderRequests();renderFX();}
 async function enter(data){csrf=data.csrf;await refresh();$('#login-view').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;message('');}
 $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await enter(await api('login',{method:'POST',body:JSON.stringify({password:$('#password').value})}));$('#password').value='';}catch(err){message(err.message);}finally{button.disabled=false;}});
 $('#logout').addEventListener('click',async()=>{try{await api('logout',{method:'POST',body:'{}'});location.reload();}catch(e){message(e.message);}});
 document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.removeAttribute('aria-current'));button.setAttribute('aria-current','page');const p=button.dataset.tab==='products';$('#products-view').hidden=!p;$('#requests-view').hidden=p;$('#page-title').textContent=p?'Productos':'Solicitudes';}));
 $('#product-search').addEventListener('input',()=>{limit=30;renderProducts();});$('#stock-filter').addEventListener('change',()=>{limit=30;renderProducts();});$('#more-products').addEventListener('click',()=>{limit+=30;renderProducts();});
 document.querySelectorAll('[data-quick]').forEach(b=>b.addEventListener('click',()=>{$('#request-filter').value=b.dataset.quick;renderRequests();}));
 $('#request-search').addEventListener('input',renderRequests);$('#request-filter').addEventListener('change',renderRequests);
 $('#refresh-requests').addEventListener('click',async()=>{try{await refresh();message('Solicitudes actualizadas.');}catch(e){message(e.message);}});
 function stockPreview(){const f=$('#edit-form').elements,hasUnit=!!f.unit.value;f.stock.step=fractional.has(f.unit.value)?'0.01':'1';f.stock.inputMode=fractional.has(f.unit.value)?'decimal':'numeric';$('#stock-preview').textContent=f.stock.value===''?'Disponibilidad: Por confirmar':!hasUnit?'Elige la unidad de venta para registrar stock.':Number(f.stock.value)>0?'Disponibilidad: Disponible':'Disponibilidad: Agotado';}
 $('#edit-form [name=stock]').addEventListener('input',stockPreview);$('#edit-form [name=unit]').addEventListener('change',stockPreview);
 $('#product-rows').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(!b)return;editing=products.find(p=>p.id===Number(b.dataset.edit));$('#edit-title').textContent=editing.title;$('#edit-reference').textContent=`${editing.brand} · Ref. ${editing.id}`;const f=$('#edit-form').elements;for(const k of ['sku','unit','price','currency','tax','stock'])f[k].value=editing[k]??'';$('#edit-error').textContent='';stockPreview();$('#edit-dialog').showModal();f.price.focus();});
 $('#edit-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;const values=Object.fromEntries(new FormData(e.target));try{const updated=await api(`products/${editing.id}`,{method:'PATCH',body:JSON.stringify({...values,version:editing.version})});products=products.map(p=>p.id===updated.id?updated:p);renderProducts();previewFX();if(demo)savePreview();$('#edit-dialog').close();message(demo?'Cambio de demostración. No modifica el catálogo y se reinicia al recargar.':'Precio y stock guardados. El catálogo los leerá al cargar la página.');}catch(err){$('#edit-error').textContent=err.message;}finally{b.disabled=false;}});
 function whatsapp(r){let phone=r.customer.phone.replace(/\D/g,'');if(phone.length===9)phone='51'+phone;return 'https://wa.me/'+phone+'?text='+encodeURIComponent(`Hola ${r.customer.name}, te escribimos de Albañil por tu solicitud ${r.reference}.`);}
 $('#request-rows').addEventListener('click',e=>{const b=e.target.closest('[data-request]');if(!b)return;requestEditing=requests.find(r=>r.reference===b.dataset.request);const r=requestEditing,c=r.customer;
 $('#request-content').innerHTML=`<p class="admin-kicker">Solicitud de cotización</p><h2 id="request-title">${esc(r.reference)}</h2><p class="request-title-note">${esc(new Date(r.created_at).toLocaleString('es-PE'))} · ${esc(r.status)}</p><div class="request-meta"><dl><dt>Cliente</dt><dd>${esc(c.name)}</dd><dt>Teléfono</dt><dd><a ${demo?'aria-disabled="true"':`href="tel:${esc(c.phone.replace(/[^+\d]/g,''))}"`}>${esc(c.phone)}</a></dd><dt>Correo</dt><dd>${esc(c.email||'No indicado')}</dd></dl><dl><dt>Empresa / RUC</dt><dd>${esc(c.company||'No indicado')} ${esc(c.ruc)}</dd><dt>Modalidad</dt><dd>${c.delivery==='retiro'?'Retiro en tienda':'Entrega'}</dd><dt>Destino</dt><dd>${esc(c.destination||'Retiro en tienda')}</dd></dl></div><div class="advisor-actions"><a class="primary-button" ${demo?'aria-disabled="true"':`href="${whatsapp(r)}"`} target="_blank" rel="noopener noreferrer">Responder por WhatsApp ↗</a><span>${demo?'Demostración: envío desactivado. Mensaje: Hola, te escribimos de Albañil por tu solicitud '+esc(r.reference):'Incluye el número de solicitud'}</span></div><h3>Archivos originales</h3><ul class="request-files">${(r.attachments||[]).map(f=>`<li><a href="${demo?'demo-lista.csv':'/api/requests/'+encodeURIComponent(r.reference)+'/files/'+f.id}" download>${esc(f.name)}</a><span>${Math.ceil(f.size/1024)} KB · ${demo?'archivo ficticio':'acceso privado'}</span></li>`).join('')||'<li>Sin archivos adjuntos.</li>'}</ul><h3>Materiales solicitados</h3><div class="table-scroll"><table class="request-lines"><thead><tr><th>Producto / pedido original</th><th>Cantidad</th><th>Referencia al recibir</th></tr></thead><tbody>${r.items.map(i=>`<tr><td>${esc(i.title)}<small>${i.pending?'Pendiente de identificar':`${esc(i.brand)} · ${i.sku?esc(i.sku):'Ref. '+i.productId}`}</small>${i.original?`<small>Texto original: ${esc(i.original)}</small>`:''}${i.source?`<small>Origen: ${esc(i.source)}</small>`:''}${i.suggestions?.length?`<small>Posibles coincidencias (sin confirmar): ${i.suggestions.map(s=>esc(s.title)).join('; ')}</small>`:''}</td><td>${esc(i.quantity??'Por confirmar')} ${esc(i.unit||'unidad por confirmar')}</td><td>${money(i)}${i.currency==='USD'&&i.pricePEN!=null?`<small>S/ ${Number(i.pricePEN).toFixed(2)} · TC ${esc(i.exchangeRate)} al recibir</small>`:''}<small>${esc(i.saleUnit||'Unidad por confirmar')} · ${esc(i.availability)}</small>${i.unit&&i.saleUnit&&i.unit!==i.saleUnit?'<small>Revisar equivalencia de unidad solicitada.</small>':''}</td></tr>`).join('')}</tbody></table></div><h3>Observaciones del cliente</h3><p class="request-customer-note">${esc(c.notes||'Sin observaciones.')}</p><div class="request-footer"><strong>Flete: ${c.delivery==='retiro'?'No aplica por retiro':'Por calcular'}</strong><p>Confirmar precio, presentación, IGV y disponibilidad antes de emitir la proforma. Esta solicitud no es una venta y no reserva stock.</p></div>`;
 const f=$('#request-form').elements;f.status.value=r.status;f.agent.value=r.agent;f.notes.value=r.notes;$('#request-error').textContent='';$('#request-dialog').showModal();});
 $('#request-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const r=await api(`requests/${requestEditing.reference}`,{method:'PATCH',body:JSON.stringify({...Object.fromEntries(new FormData(e.target)),version:requestEditing.version})});requests=requests.map(old=>old.reference===r.reference?r:old);renderRequests();$('#request-dialog').close();message(demo?'Seguimiento de demostración. Se reinicia al recargar.':'Seguimiento guardado. El stock no se modificó.');}catch(err){$('#request-error').textContent=err.message;}finally{button.disabled=false;}});
 $('#print-request').addEventListener('click',()=>window.print());document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
 if(demo){
  $('#login-view').hidden=true;$('#workspace').hidden=false;
  $('.pilot-banner').textContent='DEMOSTRACIÓN · Datos ficticios. Puedes explorar y probar cambios; se reinician al recargar. No ingreses información real.';
  Promise.all([fetch('demo.json').then(r=>r.json()),fetch('../catalog.json').then(r=>r.json())]).then(([data,catalog])=>{requests=data.requests;products=catalog.products.map(p=>({...p,sku:'',unit:p.unit||'',stock:null,availability:'Por confirmar',currency:'PEN',tax:'confirmar',version:0}));products=products.map(p=>p.id===601?{...p,price:20,currency:'USD',unit:'unidad'}:p.id===43?{...p,price:3.5,currency:'USD',unit:'par'}:p);exchangeRate={rate:3.75,version:0,updated_at:null};renderProducts();renderRequests();renderFX();}).catch(()=>message('No se pudo cargar la demostración. Recarga la página.'));
  return;
 }
 $('#connection-note').textContent='Piloto local. Los datos se guardan en el servicio de este equipo.';
 api('session').then(enter).catch(e=>{if(!e.message.includes('Inicia sesión'))message('Inicia el servicio local para entrar al panel.');});
})();
