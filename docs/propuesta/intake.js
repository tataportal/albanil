'use strict';
(() => {
 const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const apiBase=['127.0.0.1','localhost'].includes(location.hostname)?'':window.AlbanilSettings?.api||'';
 let files=[],busy=false,packet=null,db=null,receiver=!!apiBase,submission=null,sending=false;
 const SEND_STORE='albanil-request-send-v1';
 function savedSend(){try{return JSON.parse(localStorage.getItem(SEND_STORE)||'null');}catch{return null;}}
 function saveSend(value){localStorage.setItem(SEND_STORE,JSON.stringify(value));}
 function showReceipt(saved){
  if(!saved?.reference)return false;
  $('#intake-saved-reference').textContent=saved.reference;
  $('#intake-saved-whatsapp').href='https://wa.me/51968406042?text='+encodeURIComponent(`Hola, quiero dar seguimiento a mi solicitud de cotización N.º ${saved.reference}. Mi lista y archivos están registrados en la plataforma. ¿Me puede atender un asesor?`);
  $('#intake-register-form').hidden=true;$('#intake-saved').hidden=false;return true;
 }
 async function bodyHash(body){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
 const edits=new Map();
 try{for(const [key,value] of JSON.parse(localStorage.getItem('albanil-intake-edits-v1')||'[]'))edits.set(key,value);}catch{}
 function saveEdits(){try{localStorage.setItem('albanil-intake-edits-v1',JSON.stringify([...edits].slice(-1500)));}catch{}}
 const note=msg=>{$('#intake-status').textContent=msg;};
 const ready=new Promise(resolve=>{const req=indexedDB.open('albanil-intake-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'id'});req.onsuccess=()=>{db=req.result;const r=db.transaction('files').objectStore('files').getAll();r.onsuccess=async()=>{files=r.result;busy=true;renderFiles();try{for(const f of files){if(f.readerVersion!==3)await extract(f);}persist();}finally{busy=false;renderFiles();resolve();}};r.onerror=resolve;};req.onerror=()=>{note('Mantén esta pestaña abierta para conservar tus archivos.');resolve();};});
 function persist(){if(!db)return;const tx=db.transaction('files','readwrite'),s=tx.objectStore('files');s.clear();files.forEach(f=>s.put(f));tx.onerror=()=>note('No se pudo guardar el archivo en este navegador. Conserva esta pestaña abierta.');}
 function renderFiles(){ $('#intake-files').innerHTML=files.map(f=>`<li><span><strong>${esc(f.name)}</strong><small>${esc(f.status)}</small>${f.warnings?.length?`<details><summary>Revisar lectura (${f.warnings.length})</summary>${f.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</details>`:''}</span><button type="button" class="text-link" data-file-remove="${f.id}" ${busy?'disabled':''}>Quitar</button></li>`).join('');syncSummary(); }
 function collectRows(){
  const bridge=window.AlbanilIntakeBridge;
  const rows=(bridge?.summary()||[]).map(r=>({_key:'catalog:'+JSON.stringify([r.productId,r.title,r.quantity,r.unit]),productId:r.productId??null,material:r.title,quantity:r.quantity,unit:r.unit||'',source:'Catálogo',status:r.productId?'Producto seleccionado':'Por identificar'}));
  const raw=$('#paste-list').value.trim(),draft=bridge?.draft?.();
  const sources=[{name:'Texto pegado',id:'text',rows:raw?(draft?.length?draft:raw.split(/\r?\n/).filter(s=>s.trim()).map(AlbanilListParser.parseLine)):[]},...files.map(f=>({name:f.name,id:f.id,rows:f.rows||[]}))];
  for(const source of sources)for(const [i,r] of source.rows.entries()){
   rows.push({_key:source.id+':'+i+(source.id==='text'?':'+r.original:''),material:r.query||r.original,quantity:r.quantity??'',unit:r.unit||'',source:source.name+(r.location?' · '+r.location:''),original:r.original||r.query,status:'Por identificar',productId:r.choice&&r.choice!=='pending'?Number(r.choice):null});
  }
  return rows.map(r=>({...r,...edits.get(r._key)})).filter(r=>!r.removed);
 }
 function syncSummary(){
  const rows=collectRows(),typed=$('#paste-list').value.trim();
  document.dispatchEvent(new CustomEvent('albanil-list-count',{detail:rows.length||files.length}));
  $('#builder-summary-count').textContent=`${rows.length} ${rows.length===1?'material':'materiales'} · ${files.length} ${files.length===1?'archivo':'archivos'}`;
  $('#builder-summary-empty').hidden=!!(rows.length||files.length||typed);
  $('#builder-summary-items').innerHTML=rows.slice(0,5).map(r=>`<li><span>${esc(r.material)}</span><strong>${esc(r.quantity)} ${esc(r.unit)}</strong></li>`).join('');
  $('#builder-summary-more').textContent=rows.length>5?`Y ${rows.length-5} materiales más.`:'';
  const unavailable=!!savedSend()?.reference||busy||sending||!window.AlbanilIntakeBridge||!(rows.length||files.length||typed);
  $('#intake-prepare').disabled=unavailable;
  $('#intake-register-form button[type=submit]').disabled=unavailable;
 }
 document.addEventListener('albanil-list-change',syncSummary);
 document.addEventListener('albanil-open-list',()=>prepare());
 let openRequested=new URLSearchParams(location.search).has('revisar');
 document.addEventListener('albanil-list-change',()=>{if(openRequested&&window.AlbanilIntakeBridge){openRequested=false;ready.then(()=>prepare());}});
 async function extract(item){
  item.rows=[];item.text='';item.warnings=[];item.status='Leyendo…';
  try{const result=await readFile({name:item.name,arrayBuffer:()=>item.blob.arrayBuffer()});item.rows=result.rows;item.warnings=result.warnings;item.text=result.rows.map(r=>r.original).join('\n');item.status=result.rows.length?`${result.rows.length} materiales leídos${result.warnings.length?' · revisar observaciones':''}`:'Original adjunto · revisión del asesor';}
  catch(e){item.status='Original adjunto · revisión del asesor';item.warnings=[e.message];}
  item.readerVersion=3;
 }
 function script(src,global){if(window[global])return Promise.resolve(window[global]);return new Promise((resolve,reject)=>{const e=document.createElement('script');e.src=src;e.onload=()=>resolve(window[global]);e.onerror=()=>{e.remove();reject(Error('No se pudo cargar el lector. El original queda adjunto.'));};document.head.append(e);});}
 async function readFile(file){
  const ext=file.name.split('.').pop().toLowerCase(),reader=window.AlbanilDocumentReader;
  if(['xlsx','xls','csv'].includes(ext)){
   const X=await script('assets/vendor/xlsx-0.20.3.min.js','XLSX');const wb=X.read(await file.arrayBuffer(),{type:'array',cellFormula:false,cellHTML:false,sheetRows:5001});
   const sheets=wb.SheetNames.map(name=>{const sheet=wb.Sheets[name];if(sheet['!fullref']&&X.utils.decode_range(sheet['!fullref']).e.r>=5001)throw Error('El archivo supera el límite de lectura. El asesor revisará el original completo.');return {name,rows:X.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false})};});
   const result=reader.excelRows(sheets);if(result.rows.length>500)throw Error('Más de 500 materiales: el asesor revisará el original completo.');return result;
  }
  if(ext==='pdf'){
   const lib=await import('./assets/vendor/pdf.min.mjs');lib.GlobalWorkerOptions.workerSrc='assets/vendor/pdf.worker.min.mjs';const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});task.onPassword=()=>task.destroy();const pdf=await task.promise;
   try{if(pdf.numPages>40)throw Error('Más de 40 páginas: el asesor revisará el PDF completo.');const pages=[];for(let n=1;n<=pdf.numPages;n++)pages.push((await (await pdf.getPage(n)).getTextContent()).items);const result=reader.pdfPages(pages);if(result.rows.length>500)throw Error('Más de 500 materiales: el asesor revisará el original completo.');return result;}finally{await pdf.destroy();}
  }
  return {rows:[],warnings:[]};
 }
 $('#intake-upload').addEventListener('change',async event=>{
  if(busy||sending)return;await ready;busy=true;note('');const errors=[];$('#intake-prepare').disabled=true;
  try{for(const file of event.target.files){if(files.length>=5){errors.push('Máximo 5 archivos. Quita uno antes de agregar otro.');break;}if(file.size>10*1024*1024||files.reduce((s,f)=>s+f.blob.size,0)+file.size>20*1024*1024){errors.push('Máximo 10 MB por archivo y 20 MB en total.');continue;}if(!/\.(pdf|xlsx?|csv|jpe?g|png|webp)$/i.test(file.name)){errors.push('Usa PDF, Excel, CSV, JPG, PNG o WebP.');continue;}
   if(files.some(f=>f.name===file.name&&f.blob.size===file.size&&f.blob.lastModified===file.lastModified)){errors.push(file.name+': ya está adjunto.');continue;}
   const item={id:crypto.randomUUID(),name:file.name,blob:file,text:'',status:'Leyendo…'};files.push(item);renderFiles();note(`Leyendo ${file.name}…`);
   await extract(item);persist();renderFiles();
  }note(errors.join(' '));}finally{busy=false;event.target.value='';renderFiles();}
 });
 $('#intake-files').addEventListener('click',e=>{const b=e.target.closest('[data-file-remove]');if(!b||busy)return;files=files.filter(f=>f.id!==b.dataset.fileRemove);persist();renderFiles();});
 async function prepare({review=true}={}){
  if(showReceipt(savedSend())){$('#intake-saved').scrollIntoView({block:'nearest'});return;}
  if(busy||sending)return;await ready;const bridge=window.AlbanilIntakeBridge;if(!bridge){note('El catálogo todavía está cargando. Inténtalo nuevamente.');return;}
  const raw=$('#paste-list').value.trim();let rows=collectRows();
  for(const r of rows){const found=AlbanilListParser.search(r.material,bridge.products,3);r.status=r.productId?'Producto seleccionado':found.length?'Coincidencias por revisar':'El asesor buscará este material';r.suggestions=found.map(p=>({id:p.id,title:p.title,brand:p.brand}));}
  if(!rows.length&&!files.length){note('Escribe materiales, agrega productos o carga un archivo primero.');$('#paste-list').focus();return;}
  if(rows.length>500){note('La extracción supera 500 renglones. Reduce el texto o quita el archivo y envíalo directamente al asesor; no se ha descartado información.');return;}
  $('#intake-saved').hidden=true;$('#intake-register-form').hidden=!receiver;$('#intake-register-error').textContent='';
  packet={reference:'ALB-'+crypto.randomUUID().slice(0,8).toUpperCase(),rows,files:[...files],raw};
  renderPreview();
  $('#intake-share').hidden=!(navigator.share&&navigator.canShare);$('#intake-copy-text').hidden=true;$('#intake-whatsapp-short').hidden=true;$('#intake-delivery-status').textContent='Todavía no se ha enviado a la tienda.';
  if(review){document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('#intake-dialog').showModal();}
  if(receiver){$('#intake-share').hidden=true;$('#intake-manual-actions').hidden=true;$('#intake-transfer-note').hidden=true;$('#intake-manual-instructions').hidden=true;$('#intake-delivery-status').textContent='Tus cambios se guardan automáticamente.';}
  return true;
 }
 function renderPreview(){
  const rowGroups=[['Productos seleccionados',[]],['Coincidencias por revisar',[]],['Sin coincidencia en el catálogo · el asesor gestionará la búsqueda',[]]];
  packet.rows.forEach((r,i)=>rowGroups[r.productId?0:r.suggestions?.length?1:2][1].push({r,i}));
  const products=window.AlbanilIntakeBridge?.products||[];
  $('#intake-rows').innerHTML=rowGroups.filter(([,group])=>group.length).map(([title,group])=>`<section class="cart-group"><h3>${esc(title)} <span>(${group.length})</span></h3>${group.map(({r,i})=>{
   const p=r.productId?products.find(p=>String(p.id)===String(r.productId)):null;
   const quantity=`<label class="cart-quantity">Cantidad<input aria-label="Cantidad renglón ${i+1}" data-intake-index="${i}" inputmode="${AlbanilListParser.fractionalUnit(r.unit)?'decimal':'numeric'}" data-field="quantity" value="${esc(r.quantity)}" aria-describedby="intake-quantity-error-${i}"><small id="intake-quantity-error-${i}" role="alert"></small></label>`;
   const remove=`<button class="text-link intake-row-remove" type="button" data-intake-remove="${i}" aria-label="Quitar ${esc(r.material)}">×</button>`;
   if(p)return `<article class="cart-item">${p.image?`<img src="${esc(p.image)}" alt="" width="80" height="80">`:'<span class="cart-no-image">Sin foto</span>'}<div class="cart-product"><h4>${esc(r.material)}</h4><small class="cart-code">Código: ${esc(p.reference||p.sku||p.id)}</small><p class="cart-unit-price">${p.pricePEN==null?'Consultar precio':`S/ ${Number(p.pricePEN).toFixed(2)} / ${esc(p.unit)}`}</p><p class="cart-line-total" id="cart-line-total-${i}"></p></div>${quantity}${remove}</article>`;
   return `<article class="cart-item cart-material"><div class="cart-product"><label>Material<textarea aria-label="Material renglón ${i+1}" data-intake-index="${i}" maxlength="500" data-field="material">${esc(r.material)}</textarea></label><details><summary>Texto original</summary><p>${esc(r.original||r.material)}</p></details>${remove}</div><div class="cart-fields">${quantity}<label>Unidad<input aria-label="Unidad renglón ${i+1}" data-intake-index="${i}" maxlength="30" data-field="unit" value="${esc(r.unit)}" placeholder="Completar"></label></div></article>`;
  }).join('')}</section>`).join('');
  $('#intake-overview').textContent=`${packet.rows.length} ${packet.rows.length===1?'material':'materiales'}${files.length?` · ${files.length} archivos adjuntos`:''}`;
  validateRows();updateAmounts();
  $('#intake-manual').textContent=files.filter(f=>!f.rows?.length||f.warnings?.length).map(f=>`${f.name}: revisión manual del original.`).join(' ');
 }
 function updateAmounts(){
  const products=window.AlbanilIntakeBridge?.products||[];let cents=0,pending=0;
  for(const [i,r] of (packet?.rows||[]).entries()){
   const p=r.productId?products.find(p=>String(p.id)===String(r.productId)):null;
   const amount=AlbanilListParser.requestQuantityError(r.quantity,r.unit)?null:window.AlbanilPricing.lineTotal(p,r.quantity,r.unit);
   if(amount===null)pending++;else cents+=Math.round(amount*100);
   const line=$(`#cart-line-total-${i}`);if(line)line.textContent=amount===null?'Importe pendiente':`Subtotal: S/ ${amount.toFixed(2)}`;
  }
  const extra=files.filter(f=>!f.rows?.length).length;
  $('#cart-amounts').innerHTML=`<div class="cart-total"><strong>${pending||extra?'Subtotal de materiales con precio':'Total de materiales'}</strong><strong>S/ ${(cents/100).toFixed(2)}</strong></div><p>Flete no incluido.</p>${pending?`<p>${pending} ${pending===1?'material pendiente':'materiales pendientes'} de cotizar, fuera de este importe.</p>`:''}${extra?'<p>Los archivos pendientes de lectura no están incluidos en este importe.</p>':''}`;
 }
 function validateRows(){
  let first=-1;for(const [i,r] of (packet?.rows||[]).entries()){
   const error=AlbanilListParser.requestQuantityError(r.quantity,r.unit);
   const field=$(`#intake-rows [data-intake-index="${i}"][data-field="quantity"]`),label=$(`#intake-quantity-error-${i}`);
   if(label)label.textContent=error;if(field){field.setCustomValidity(error);field.setAttribute('aria-invalid',String(!!error));}
   if(error&&first<0)first=i;
  }return first;
 }
 $('#intake-prepare').addEventListener('click',prepare);
 document.addEventListener('click',e=>{if(e.target.closest('[data-intake-prepare]'))prepare();});
 $('#intake-rows').addEventListener('click',e=>{const b=e.target.closest('[data-intake-remove]');if(!b||sending||!$('#intake-saved').hidden)return;const r=packet.rows[Number(b.dataset.intakeRemove)];edits.set(r._key,{removed:true});saveEdits();packet.rows.splice(Number(b.dataset.intakeRemove),1);renderPreview();syncSummary();});
 $('#intake-rows').addEventListener('input',e=>{const i=e.target.dataset.intakeIndex,f=e.target.dataset.field;if(i!==undefined&&f){const r=packet.rows[+i];r[f]=e.target.value;const edit={...edits.get(r._key),[f]:e.target.value};if(f==='material'){r.productId=null;r.suggestions=[];edit.productId=null;}r.status='Editado por el cliente';edits.set(r._key,edit);saveEdits();validateRows();updateAmounts();syncSummary();}});


 function message(){return ['Hola, quisiera cotizar esta lista:',packet.reference,'',...packet.rows.map((r,i)=>`${i+1}. ${r.quantity||'Cantidad no indicada'} ${r.unit||''} | ${r.material}${r.suggestions?.length?'\n   Posibles coincidencias: '+r.suggestions.map(p=>p.title).join('; '):''}`),'',...packet.files.map(f=>`Archivo: ${f.name} (${f.status})`)].join('\n');}
 $('#intake-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(message());$('#intake-delivery-status').textContent='Solicitud copiada. Pégala en WhatsApp y adjunta allí tus archivos originales.';}catch{ $('#intake-copy-text').hidden=false;$('#intake-copy-text').value=message();$('#intake-copy-text').focus();$('#intake-copy-text').select();$('#intake-delivery-status').textContent='Selecciona y copia el texto para pegarlo en WhatsApp.';}});
 $('#intake-share').addEventListener('click',async()=>{try{const originals=packet.files.map(f=>new File([f.blob],f.name,{type:f.blob.type}));const text=new File([message()],'solicitud-albanil.txt',{type:'text/plain'});const data={files:[text,...originals],title:'Solicitud Albañil',text:packet.reference};if(!navigator.canShare(data))throw Error('Este dispositivo no permite compartir estos archivos. Copia la solicitud y adjunta los originales en WhatsApp.');await navigator.share(data);$('#intake-delivery-status').textContent='Confirma en WhatsApp que enviaste la solicitud al asesor.';}catch(e){$('#intake-delivery-status').textContent=e.name==='AbortError'?'Envío cancelado. Tu solicitud sigue aquí.':e.message;}});
 $('#intake-whatsapp').addEventListener('click',e=>{const text=message();if(encodeURIComponent(text).length>6000){e.preventDefault();$('#intake-copy').click();$('#intake-whatsapp-short').hidden=false;$('#intake-delivery-status').textContent='Por el tamaño de la lista, copia la solicitud y pégala en el chat. Adjunta allí tus archivos originales.';return;}e.currentTarget.href='https://wa.me/51968406042?text='+encodeURIComponent(text);});

 const register=$('#intake-register-form');
 register.hidden=!receiver;showReceipt(savedSend());
 window.addEventListener('storage',e=>{if(e.key===SEND_STORE){showReceipt(savedSend());syncSummary();}});
 $('#intake-new-request').addEventListener('click',async()=>{
  if(sending||busy)return;await ready;localStorage.removeItem(SEND_STORE);
  for(const key of ['albanil-lista-borrador-v1','albanil-propuesta-cotizacion-v1','albanil-cotizacion-renglones-v1','albanil-intake-edits-v1'])localStorage.removeItem(key);
  sessionStorage.removeItem('albanil-request-contact-v1');
  if(db)await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').clear();tx.oncomplete=resolve;tx.onerror=reject;});
  location.reload();
 });
 try{const contact=JSON.parse(sessionStorage.getItem('albanil-request-contact-v1')||'{}');for(const k of ['name','phone','company','delivery','destination'])if(contact[k])register.elements[k].value=contact[k];}catch{}
 register.addEventListener('input',()=>{try{const v=Object.fromEntries(new FormData(register));delete v.consent;sessionStorage.setItem('albanil-request-contact-v1',JSON.stringify(v));}catch{}});
 register.elements.delivery.addEventListener('change',()=>{register.elements.destination.required=register.elements.delivery.value==='entrega';});
 function encodeFile(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('No se pudo leer un archivo. Vuelve a cargarlo.'));reader.readAsDataURL(blob);});}
 async function submit(event){
  event.preventDefault();if(sending||busy||!register.reportValidity())return;
  if(!await prepare({review:false})||sending)return;
  const invalid=validateRows();if(invalid>=0){$('#intake-dialog').showModal();const field=$(`#intake-rows [data-intake-index="${invalid}"][data-field="quantity"]`);field.focus();field.reportValidity();return;}
  sending=true;const button=register.querySelector('button[type=submit]');button.disabled=true;button.textContent='Guardando solicitud…';$('#intake-register-error').textContent='';
  const inputs=[...document.querySelectorAll('#intake-rows input,#intake-rows textarea,#list-view input,#list-view textarea,#list-view select,#list-view button')].filter(i=>!register.contains(i));const previouslyDisabled=new Map(inputs.map(i=>[i,i.disabled]));inputs.forEach(i=>i.disabled=true);
  try{
   const values=Object.fromEntries(new FormData(register));const customer={name:values.name,phone:values.phone,company:values.company||'',delivery:values.delivery,destination:values.destination||''};
   if(!packet.rows.length&&!packet.files.length)throw Error('Agrega al menos un material o archivo.');
   const items=packet.rows.map(r=>({productId:r.productId??null,query:r.material,quantity:r.quantity===''||r.quantity==null?null:Number(String(r.quantity).replace(',','.')),unit:r.unit||'',original:r.original||'',source:r.source||'',suggestionIds:(r.suggestions||[]).map(p=>p.id)}));
   if(items.some(i=>i.quantity!==null&&(!Number.isFinite(i.quantity)||i.quantity<=0||i.quantity>999999)))throw Error('Revisa las cantidades: usa números o deja el campo vacío para confirmar.');
   const attachments=await Promise.all(packet.files.map(async f=>({name:f.name,data:await encodeFile(f.blob)})));
   const body=JSON.stringify({customer,items,attachments,consent:values.consent==='on'});
   const hash=await bodyHash(body),prior=savedSend();
   if(prior?.reference){showReceipt(prior);return;}
   submission=prior?.hash===hash?prior:{hash,key:crypto.randomUUID()};
   saveSend(submission);
   const response=await fetch(apiBase+'/api/requests',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':submission.key},body});
   const result=await response.json();if(!response.ok)throw Error(result.error||'No se confirmó el registro. Inténtalo nuevamente.');
   if(typeof result.reference!=='string'||!/^ALB-[A-Z0-9-]+$/.test(result.reference))throw Error('No recibimos el número de solicitud. Intenta guardar nuevamente.');
   submission={...submission,reference:result.reference};saveSend(submission);packet.reference=result.reference;showReceipt(submission);
   $('#intake-delivery-status').textContent='Solicitud guardada. Continúa por WhatsApp con el número de referencia.';$('#intake-saved').scrollIntoView({block:'nearest'});
  }catch(error){$('#intake-register-error').textContent=error.message;inputs.forEach(i=>i.disabled=previouslyDisabled.get(i));}
  finally{sending=false;inputs.forEach(i=>i.disabled=previouslyDisabled.get(i));button.textContent='Enviar solicitud al asesor';syncSummary();}
 }
 register.addEventListener('submit',event=>{event.preventDefault();if(navigator.locks)return navigator.locks.request('albanil-register-request',()=>submit(event));return submit(event);});
 if(['127.0.0.1','localhost'].includes(location.hostname))fetch('/api/health').then(r=>r.ok?r.json():null).then(data=>{if(data?.requests){receiver=true;$('#intake-transfer-note').hidden=true;$('#intake-manual-instructions').hidden=true;$('#intake-manual-actions').hidden=true;$('#intake-register-form').hidden=false;}}).catch(()=>{});
})();
