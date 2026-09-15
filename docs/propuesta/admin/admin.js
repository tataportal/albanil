'use strict';
(() => {
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const local=['127.0.0.1','localhost'].includes(location.hostname);
 const demo=false;
 const apiBase=local?'':window.AlbanilSettings.api;
 let token='';
 let currentUser=null;
 const permitted=section=>!currentUser||currentUser.permissions.includes(section);
 let exchangeRate={rate:null,version:0,updated_at:null};
 let csrf='',products=[],requests=[],limit=30,editing=null,requestEditing=null;
 const fractional=new Set(['metro','kg','litro','m2','m3']);
 const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const money=p=>p.price===null||p.price===undefined?'Sin precio registrado':`${p.currency==='USD'?'US$':'S/'} ${Number(p.price).toFixed(2)}`;
 function message(t){$('#message').textContent=t;}
 async function api(path,options={}) {
  const response=await fetch(apiBase+'/api/'+path,{...options,cache:'no-store',headers:{'Content-Type':'application/json',...(apiBase?{}:{'X-CSRF-Token':csrf}),...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
  let data;try{data=await response.json();}catch{throw new Error('No pudimos conectar con el servicio privado.');}
  if(response.status===401){$('#workspace').hidden=true;$('#login-view').hidden=false;$('#logout').hidden=true;csrf='';token='';}
  if(!response.ok)throw new Error(data.error||'No pudimos completar la operación.');return data;
 }
 function renderProducts(){
  const q=normalize($('#product-search').value),state=$('#stock-filter').value;
  const found=products.filter(p=>(!q||normalize(`${p.id} ${p.reference||''} ${p.sku} ${p.title} ${p.brand}`).includes(q))&&(!state||p.availability===state));
  $('#product-count').textContent=`${Math.min(limit,found.length)} de ${found.length} productos`;
  $('#product-rows').innerHTML=found.slice(0,limit).map(p=>`<tr><td><div class="table-product"><img src="../${esc(p.image)}" alt="" width="50" height="50"><div><strong>${esc(p.title)}</strong><small>${p.state==='INACTIVO'?'Oculto · ':''}${esc(p.brand)} · ${p.sku?`SKU ${esc(p.sku)}`:`Ref. ${esc(p.reference||p.id)}`}</small></div></div></td><td>${money(p)}${p.currency==='USD'?`<small>En la web: ${AlbanilPricing.label(AlbanilPricing.apply(p,exchangeRate.rate))}</small>`:''}<small>${esc(p.unit||'')}</small></td><td>${p.stock===null?'—':esc(p.stock)}</td><td><span class="availability" data-state="${esc(p.availability)}">${esc(p.availability==='Por confirmar'?'Stock sin registrar':p.availability)}</span></td><td><button class="secondary-button" data-edit="${p.id}" aria-label="Editar ${esc(p.title)}">Editar</button></td></tr>`).join('')||'<tr><td colspan="5">No encontramos productos con esos filtros.</td></tr>';
  $('#more-products').hidden=limit>=found.length;$('#more-products').textContent=`Ver ${Math.min(30,found.length-limit)} más`;
 }
 function renderFX(){
  $('#fx-current').textContent=exchangeRate.rate?`Actual: 1 US$ = S/ ${Number(exchangeRate.rate).toFixed(4)}${exchangeRate.updated_at?' · Actualizado '+new Date(exchangeRate.updated_at).toLocaleString('es-PE'):''}`:'Todavía no hay un tipo de cambio guardado.';
  $('#fx-rate').value=exchangeRate.rate??'';
  $('#fx-catalog-link').href=demo?'../?ver=todo&precios=local':'../?ver=todo';$('#fx-home-link').href=demo?'../?precios=local':'../';previewFX();
 }
 function previewFX(){
  const value=$('#fx-rate').value,valid=AlbanilPricing.validRate(value),affected=products.filter(p=>p.currency==='USD'&&p.price!=null);
  $('#fx-impact-count').textContent=`${affected.length} productos en dólares con precio. ${valid?'Así se verán en la web:':'Ingresa un tipo de cambio para comparar.'}`;
  $('#fx-preview').innerHTML=affected.slice(0,5).map(p=>`<tr><td>${esc(p.title)}<small>${money(p)}</small></td><td>${AlbanilPricing.label(AlbanilPricing.apply(p,exchangeRate.rate))}</td><td>${valid?AlbanilPricing.label(AlbanilPricing.apply(p,value)):'—'}</td></tr>`).join('')||'<tr><td colspan="3">Selecciona USD al editar un producto para incluirlo en la conversión.</td></tr>';
 }
 $('#fx-rate').addEventListener('input',previewFX);
 $('#fx-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;$('#fx-error').textContent='';
  try{if(!AlbanilPricing.validRate($('#fx-rate').value))throw Error('Ingresa un tipo de cambio positivo con máximo 4 decimales.');
   exchangeRate=await api('exchange-rate',{method:'PATCH',body:JSON.stringify({rate:Number($('#fx-rate').value),version:exchangeRate.version})});
   renderFX();renderProducts();message(demo?'Tipo de cambio aplicado en este navegador. Abre «Ver precios en la web».':'Tipo de cambio guardado. La web lo usará al cargar los precios.');
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
 async function refresh(){
  const [p,r,fx]=await Promise.all([permitted('products')?api('products'):Promise.resolve({products:[]}),permitted('requests')?api('requests'):Promise.resolve({requests:[]}),permitted('exchange')?api('exchange-rate'):Promise.resolve({rate:null,version:0,updated_at:null})]);
  products=p.products;requests=r.requests;exchangeRate=fx;
  $('#new-product').hidden=!permitted('products')||!(await api('health').catch(()=>({}))).productCreation;
  renderProducts();renderRequests();renderFX();
 }
 async function enter(data){token=data.token||'';csrf=data.csrf||'';currentUser=data.user||null;await refresh();$('#login-view').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;showSection();message(currentUser?'Sesión: '+currentUser.username:'');}
 $('#login-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await enter(await api('login',{method:'POST',body:JSON.stringify({username:$('#username').value.trim(),password:$('#password').value})}));$('#password').value='';}catch(err){message(err.message);}finally{button.disabled=false;}});
 $('#logout').addEventListener('click',async()=>{try{await api('logout',{method:'POST',body:'{}'});location.reload();}catch(e){message(e.message);}});
 const sections={requests:{title:'Solicitudes',hash:'solicitudes'},products:{title:'Productos y stock',hash:'productos'},exchange:{title:'Tipo de cambio',hash:'tipo-cambio'}};
 function showSection(){
  const selected=Object.keys(sections).find(key=>permitted(key)&&sections[key].hash===location.hash.slice(1))||Object.keys(sections).find(permitted)||'requests';
  for(const [key,section] of Object.entries(sections))$('#'+key+'-view').hidden=key!==selected;
  document.querySelectorAll('[data-tab]').forEach(button=>{button.hidden=!permitted(button.dataset.tab);if(button.dataset.tab===selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  $('#page-title').textContent=sections[selected].title;
 }
 document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{location.hash=sections[button.dataset.tab].hash;showSection();}));
 window.addEventListener('hashchange',showSection);
 showSection();
 $('#product-search').addEventListener('input',()=>{limit=30;renderProducts();});$('#stock-filter').addEventListener('change',()=>{limit=30;renderProducts();});$('#more-products').addEventListener('click',()=>{limit+=30;renderProducts();});
 document.querySelectorAll('[data-quick]').forEach(b=>b.addEventListener('click',()=>{$('#request-filter').value=b.dataset.quick;renderRequests();}));
 $('#request-search').addEventListener('input',renderRequests);$('#request-filter').addEventListener('change',renderRequests);
 $('#refresh-requests').addEventListener('click',async()=>{try{await refresh();message('Solicitudes actualizadas.');}catch(e){message(e.message);}});
 let newKey='',newBody='',creating=false,previewURL='';
 const newForm=$('#new-product-form');
 $('#new-product').addEventListener('click',async()=>{
  try{const cat=await api('catalog');newForm.reset();newForm.elements.category.innerHTML='<option value="">Seleccionar categoría</option>'+cat.categories.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');newKey='';newBody='';$('#new-product-error').textContent='';$('#new-product-preview').hidden=true;$('#new-product-dialog').showModal();newForm.elements.title.focus();}catch(e){message(e.message);}
 });
 newForm.elements.unit.addEventListener('change',()=>{newForm.elements.stock.step=fractional.has(newForm.elements.unit.value)?'0.01':'1';});
 newForm.elements.photo.addEventListener('change',()=>{if(previewURL)URL.revokeObjectURL(previewURL);const file=newForm.elements.photo.files[0];$('#new-product-preview').hidden=!file;if(file){previewURL=URL.createObjectURL(file);$('#new-product-preview').src=previewURL;}});
 newForm.addEventListener('submit',async e=>{
  e.preventDefault();if(creating||!newForm.reportValidity())return;creating=true;const button=newForm.querySelector('[type=submit]');button.disabled=true;$('#new-product-error').textContent='';
  try{
   const file=newForm.elements.photo.files[0];if(!file||file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Selecciona una foto JPG, PNG o WebP de hasta 5 MB.');
   const values=Object.fromEntries(new FormData(newForm));values.photo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('No se pudo leer la foto.'));reader.readAsDataURL(file);});
   const body=JSON.stringify(values);if(body!==newBody){newKey=crypto.randomUUID();newBody=body;}
   const product=await api('products',{method:'POST',headers:{'Idempotency-Key':newKey},body});products=[product,...products.filter(p=>p.id!==product.id)];$('#product-search').value=product.reference;$('#stock-filter').value='';limit=30;renderProducts();previewFX();$('#new-product-dialog').close();message(`Producto ${product.reference} guardado. ${product.state==='ACTIVO'?'Ya está disponible en el catálogo web.':'Quedó oculto; puedes publicarlo desde Editar.'}`);
  }catch(e){$('#new-product-error').textContent=e.message;}finally{creating=false;button.disabled=false;}
 });
 function stockPreview(){const f=$('#edit-form').elements,hasUnit=!!f.unit.value;f.stock.step=fractional.has(f.unit.value)?'0.01':'1';f.stock.inputMode=fractional.has(f.unit.value)?'decimal':'numeric';$('#stock-preview').textContent=f.stock.value===''?'Stock sin registrar':!hasUnit?'Elige la unidad de venta para registrar stock.':Number(f.stock.value)>0?'Disponibilidad: Disponible':'Disponibilidad: Agotado';}
 $('#edit-form [name=stock]').addEventListener('input',stockPreview);$('#edit-form [name=unit]').addEventListener('change',stockPreview);
 $('#product-rows').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(!b)return;editing=products.find(p=>p.id===Number(b.dataset.edit));$('#edit-title').textContent=editing.title;$('#edit-reference').textContent=`${editing.brand} · Ref. ${editing.reference||editing.id}`;const f=$('#edit-form').elements;for(const k of ['sku','unit','price','currency','tax','stock','state'])f[k].value=editing[k]??(k==='state'?'ACTIVO':'');$('#edit-error').textContent='';stockPreview();$('#edit-dialog').showModal();f.price.focus();});
 $('#edit-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;const values=Object.fromEntries(new FormData(e.target));try{const updated=await api(`products/${editing.id}`,{method:'PATCH',body:JSON.stringify({...values,version:editing.version})});products=products.map(p=>p.id===updated.id?updated:p);renderProducts();previewFX();$('#edit-dialog').close();message(demo?'Cambios aplicados en este navegador.':'Precio y stock guardados. El catálogo los leerá al cargar la página.');}catch(err){$('#edit-error').textContent=err.message;}finally{b.disabled=false;}});
 function materialGroups(items){
  const groups=[['Productos identificados',[]],['Productos agotados · gestionar abastecimiento',[]],['Coincidencias por revisar',[]],['Sin coincidencia en el catálogo · gestionar búsqueda',[]]];
  items.forEach(i=>{const pending=i.pending||!i.productId;const index=pending?(i.suggestions?.length?2:3):(i.availability==='Agotado'?1:0);groups[index][1].push(i);});
  return groups.filter(([,items])=>items.length);
 }
 function requestMaterialRows(items){return materialGroups(items).map(([title,group])=>`<tr class="request-group"><th colspan="3" scope="colgroup">${esc(title)} (${group.length})</th></tr>`+group.map(i=>`<tr><td>${esc(i.title)}<small>${i.pending?'Pendiente de identificar':`${esc(i.brand)} · ${i.sku?esc(i.sku):'Ref. '+i.productId}`}</small>${i.original?`<small>Texto original: ${esc(i.original)}</small>`:''}${i.source?`<small>Origen: ${esc(i.source)}</small>`:''}${i.suggestions?.length?`<small>Posibles coincidencias (sin confirmar): ${i.suggestions.map(s=>esc(s.title)).join('; ')}</small>`:''}</td><td>${esc(i.quantity??'No indicada')} ${esc(i.unit||'unidad no indicada')}</td><td>${money(i)}${i.currency==='USD'&&i.pricePEN!=null?`<small>S/ ${Number(i.pricePEN).toFixed(2)} · TC ${esc(i.exchangeRate)} al recibir</small>`:''}<small>${esc(i.saleUnit||i.unit||'')} · ${esc(i.availability==='Por confirmar'?'Stock sin registrar':i.availability)}</small>${i.unit&&i.saleUnit&&i.unit!==i.saleUnit?'<small>Revisar equivalencia de unidad solicitada.</small>':''}</td></tr>`).join('')).join('');}
 function whatsapp(r){let phone=r.customer.phone.replace(/\D/g,'');if(phone.length===9)phone='51'+phone;return 'https://wa.me/'+phone+'?text='+encodeURIComponent(`Hola ${r.customer.name}, te escribimos de Albañil por tu solicitud ${r.reference}.`);}
 $('#request-rows').addEventListener('click',async e=>{const b=e.target.closest('[data-request]');if(!b)return;try{requestEditing=await api('requests/'+encodeURIComponent(b.dataset.request));}catch(error){message(error.message);return;}const r=requestEditing,c=r.customer;
 $('#request-content').innerHTML=`<p class="admin-kicker">Solicitud de cotización</p><h2 id="request-title">${esc(r.reference)}</h2><p class="request-title-note">${esc(new Date(r.created_at).toLocaleString('es-PE'))} · ${esc(r.status)}</p><div class="request-meta"><dl><dt>Cliente</dt><dd>${esc(c.name)}</dd><dt>Teléfono</dt><dd><a ${demo?'aria-disabled="true"':`href="tel:${esc(c.phone.replace(/[^+\d]/g,''))}"`}>${esc(c.phone)}</a></dd><dt>Correo</dt><dd>${esc(c.email||'No indicado')}</dd></dl><dl><dt>Empresa / RUC</dt><dd>${esc(c.company||'No indicado')} ${esc(c.ruc)}</dd><dt>Modalidad</dt><dd>${c.delivery==='retiro'?'Retiro en tienda':'Entrega'}</dd><dt>Destino</dt><dd>${esc(c.destination||'Retiro en tienda')}</dd></dl></div><div class="advisor-actions"><a class="primary-button" ${demo?'aria-disabled="true"':`href="${whatsapp(r)}"`} target="_blank" rel="noopener noreferrer">Responder por WhatsApp ↗</a><span>${demo?'Mensaje: Hola, te escribimos de Albañil por tu solicitud '+esc(r.reference):'Incluye el número de solicitud'}</span></div><h3>Archivos originales</h3><ul class="request-files">${(r.attachments||[]).map(f=>`<li><a href="${apiBase+'/api/requests/'+encodeURIComponent(r.reference)+'/files/'+f.id}" data-file-name="${esc(f.name)}" download>${esc(f.name)}</a><span>${Math.ceil(f.size/1024)} KB · ${demo?'archivo adjunto':'acceso privado'}</span></li>`).join('')||'<li>Sin archivos adjuntos.</li>'}</ul><h3>Materiales solicitados</h3><div class="table-scroll"><table class="request-lines"><thead><tr><th>Producto / pedido original</th><th>Cantidad</th><th>Referencia al recibir</th></tr></thead><tbody>${requestMaterialRows(r.items)}</tbody></table></div>${r.updatedBy?`<p>Último cambio: ${esc(r.updatedBy)} · ${esc(new Date(r.updatedAt).toLocaleString('es-PE'))}</p>`:''}<h3>Observaciones del cliente</h3><p class="request-customer-note">${esc(c.notes||'Sin observaciones.')}</p><div class="request-footer"><strong>Flete: ${c.delivery==='retiro'?'No aplica por retiro':'Por calcular'}</strong><p>La solicitud no descuenta stock.</p></div>`;
 const f=$('#request-form').elements;f.status.value=r.status;f.agent.value=r.agent;f.notes.value=r.notes;$('#request-error').textContent='';$('#request-dialog').showModal();});
 $('#request-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const r=await api(`requests/${requestEditing.reference}`,{method:'PATCH',body:JSON.stringify({...Object.fromEntries(new FormData(e.target)),version:requestEditing.version})});requests=requests.map(old=>old.reference===r.reference?r:old);requestEditing=r;renderRequests();$('#request-dialog').close();message(demo?'Seguimiento actualizado en este navegador.':'Seguimiento guardado. El stock no se modificó.');}catch(err){$('#request-error').textContent=err.message;}finally{button.disabled=false;}});
 $('#print-request').addEventListener('click',()=>window.print());document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
 $('#request-content').addEventListener('click',async event=>{
  const link=event.target.closest('[data-file-name]');if(!link||!apiBase)return;event.preventDefault();
  try{const response=await fetch(link.href,{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('Vuelve a iniciar sesión para descargar el archivo.');const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=link.dataset.fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){message(error.message);}
 });
 $('#connection-note').textContent='Acceso del equipo de ventas.';
 if(local)api('session').then(enter).catch(()=>{});
})();
