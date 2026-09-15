'use strict';
(() => {
 const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const apiBase=['127.0.0.1','localhost'].includes(location.hostname)?'':window.AlbanilSettings?.api||'';
 let files=[],busy=false,packet=null,db=null,receiver=!!apiBase,submission=null,sending=false;
 const edits=new Map();
 try{for(const [key,value] of JSON.parse(localStorage.getItem('albanil-intake-edits-v1')||'[]'))edits.set(key,value);}catch{}
 function saveEdits(){try{localStorage.setItem('albanil-intake-edits-v1',JSON.stringify([...edits].slice(-1500)));}catch{}}
 const note=msg=>{$('#intake-status').textContent=msg;};
 const ready=new Promise(resolve=>{const req=indexedDB.open('albanil-intake-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'id'});req.onsuccess=()=>{db=req.result;const r=db.transaction('files').objectStore('files').getAll();r.onsuccess=async()=>{files=r.result;busy=true;renderFiles();try{for(const f of files){if(f.readerVersion!==2)await extract(f);}persist();}finally{busy=false;renderFiles();resolve();}};r.onerror=resolve;};req.onerror=()=>{note('Mantén esta pestaña abierta para conservar tus archivos.');resolve();};});
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
  $('#builder-summary-count').textContent=`${rows.length} ${rows.length===1?'material':'materiales'} · ${files.length} ${files.length===1?'archivo':'archivos'}`;
  $('#builder-summary-empty').hidden=!!(rows.length||files.length||typed);
  $('#builder-summary-items').innerHTML=rows.slice(0,5).map(r=>`<li><span>${esc(r.material)}</span><strong>${esc(r.quantity)} ${esc(r.unit)}</strong></li>`).join('');
  $('#builder-summary-more').textContent=rows.length>5?`Y ${rows.length-5} materiales más.`:'';
  $('#intake-prepare').disabled=busy||sending||!window.AlbanilIntakeBridge||!(rows.length||files.length||typed);
 }
 document.addEventListener('albanil-list-change',syncSummary);
 async function extract(item){
  item.rows=[];item.text='';item.warnings=[];item.status='Leyendo…';
  try{const result=await readFile({name:item.name,arrayBuffer:()=>item.blob.arrayBuffer()});item.rows=result.rows;item.warnings=result.warnings;item.text=result.rows.map(r=>r.original).join('\n');item.status=result.rows.length?`${result.rows.length} materiales leídos${result.warnings.length?' · revisar observaciones':''}`:'Original adjunto · revisión del asesor';}
  catch(e){item.status='Original adjunto · revisión del asesor';item.warnings=[e.message];}
  item.readerVersion=2;
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
 async function prepare(){
  if(busy||sending)return;await ready;const bridge=window.AlbanilIntakeBridge;if(!bridge){note('El catálogo todavía está cargando. Inténtalo nuevamente.');return;}
  const raw=$('#paste-list').value.trim();let rows=collectRows();
  for(const r of rows){const found=/[a-záéíóúñ]{2}/i.test(r.material)?AlbanilListParser.search(r.material,bridge.products,3):[];r.status=r.productId?'Producto seleccionado':found.length?'Coincidencias por revisar':'El asesor buscará este material';r.suggestions=found.map(p=>({id:p.id,title:p.title,brand:p.brand}));}
  if(!rows.length&&!files.length){note('Escribe materiales, agrega productos o carga un archivo primero.');$('#paste-list').focus();return;}
  if(rows.length>500){note('La extracción supera 500 renglones. Reduce el texto o quita el archivo y envíalo directamente al asesor; no se ha descartado información.');return;}
  $('#intake-saved').hidden=true;$('#intake-register-form').hidden=!receiver;$('#intake-register-error').textContent='';
  packet={reference:'ALB-'+crypto.randomUUID().slice(0,8).toUpperCase(),rows,files:[...files],raw};
  renderPreview();
  $('#intake-share').hidden=!(navigator.share&&navigator.canShare);$('#intake-copy-text').hidden=true;$('#intake-whatsapp-short').hidden=true;$('#intake-delivery-status').textContent='Todavía no se ha enviado a la tienda.';
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('#intake-dialog').showModal();
  if(receiver){$('#intake-share').hidden=true;$('#intake-manual-actions').hidden=true;$('#intake-transfer-note').hidden=true;$('#intake-manual-instructions').hidden=true;$('#intake-delivery-status').textContent='Guarda la solicitud para obtener un número. Los archivos quedarán incluidos.';}
 }
 function renderPreview(){
  const rowGroups=[['Productos seleccionados',[]],['Coincidencias por revisar',[]],['Sin coincidencia en el catálogo · el asesor gestionará la búsqueda',[]]];
  packet.rows.forEach((r,i)=>rowGroups[r.productId?0:r.suggestions?.length?1:2][1].push({r,i}));
  $('#intake-rows').innerHTML=rowGroups.filter(([,group])=>group.length).map(([title,group])=>`<tr><th colspan="5" scope="colgroup">${esc(title)} (${group.length})</th></tr>`+group.map(({r,i})=>`<tr><td>${i+1}</td><td><input aria-label="Cantidad renglón ${i+1}" data-intake-index="${i}" inputmode="decimal" data-field="quantity" value="${esc(r.quantity)}" placeholder="Completar"></td><td><input aria-label="Unidad renglón ${i+1}" data-intake-index="${i}" maxlength="30" data-field="unit" value="${esc(r.unit)}" placeholder="Completar"></td><td><textarea aria-label="Material renglón ${i+1}" data-intake-index="${i}" maxlength="500" data-field="material">${esc(r.material)}</textarea><small>${esc(r.source)}</small><details><summary>Ver texto original</summary><small>${esc(r.original||r.material)}</small></details><button class="text-link intake-row-remove" type="button" data-intake-remove="${i}">Quitar material</button></td><td>${esc(r.status)}${r.suggestions?.length?'<small>'+r.suggestions.map(p=>esc(p.title)).join('<br>')+'</small>':''}</td></tr>`).join('')).join('');
  $('#intake-overview').textContent=`${packet.rows.length} renglones · ${files.length} archivos originales. Puedes corregir cantidades o materiales antes de continuar.`;
  $('#intake-manual').textContent=files.filter(f=>!f.rows?.length||f.warnings?.length).map(f=>`${f.name}: revisión manual del original.`).join(' ');
 }
 $('#intake-prepare').addEventListener('click',prepare);
 document.addEventListener('click',e=>{if(e.target.closest('[data-intake-prepare]'))prepare();});
 $('#intake-rows').addEventListener('click',e=>{const b=e.target.closest('[data-intake-remove]');if(!b||sending||!$('#intake-saved').hidden)return;const r=packet.rows[Number(b.dataset.intakeRemove)];edits.set(r._key,{removed:true});saveEdits();packet.rows.splice(Number(b.dataset.intakeRemove),1);renderPreview();syncSummary();});
 $('#intake-rows').addEventListener('input',e=>{const i=e.target.dataset.intakeIndex,f=e.target.dataset.field;if(i!==undefined&&f){const r=packet.rows[+i];r[f]=e.target.value;const edit={...edits.get(r._key),[f]:e.target.value};if(f==='material'){r.productId=null;r.suggestions=[];edit.productId=null;}r.status='Editado por el cliente';edits.set(r._key,edit);saveEdits();syncSummary();}});


 function message(){return ['Hola, quisiera cotizar esta lista:',packet.reference,'',...packet.rows.map((r,i)=>`${i+1}. ${r.quantity||'Cantidad no indicada'} ${r.unit||''} | ${r.material}${r.suggestions?.length?'\n   Posibles coincidencias: '+r.suggestions.map(p=>p.title).join('; '):''}`),'',...packet.files.map(f=>`Archivo: ${f.name} (${f.status})`)].join('\n');}
 $('#intake-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(message());$('#intake-delivery-status').textContent='Solicitud copiada. Pégala en WhatsApp y adjunta allí tus archivos originales.';}catch{ $('#intake-copy-text').hidden=false;$('#intake-copy-text').value=message();$('#intake-copy-text').focus();$('#intake-copy-text').select();$('#intake-delivery-status').textContent='Selecciona y copia el texto para pegarlo en WhatsApp.';}});
 $('#intake-share').addEventListener('click',async()=>{try{const originals=packet.files.map(f=>new File([f.blob],f.name,{type:f.blob.type}));const text=new File([message()],'solicitud-albanil.txt',{type:'text/plain'});const data={files:[text,...originals],title:'Solicitud Albañil',text:packet.reference};if(!navigator.canShare(data))throw Error('Este dispositivo no permite compartir estos archivos. Copia la solicitud y adjunta los originales en WhatsApp.');await navigator.share(data);$('#intake-delivery-status').textContent='Confirma en WhatsApp que enviaste la solicitud al asesor.';}catch(e){$('#intake-delivery-status').textContent=e.name==='AbortError'?'Envío cancelado. Tu solicitud sigue aquí.':e.message;}});
 $('#intake-whatsapp').addEventListener('click',e=>{const text=message();if(encodeURIComponent(text).length>6000){e.preventDefault();$('#intake-copy').click();$('#intake-whatsapp-short').hidden=false;$('#intake-delivery-status').textContent='Por el tamaño de la lista, copia la solicitud y pégala en el chat. Adjunta allí tus archivos originales.';return;}e.currentTarget.href='https://wa.me/51968406042?text='+encodeURIComponent(text);});

 const register=$('#intake-register-form');
 register.elements.delivery.addEventListener('change',()=>{register.elements.destination.required=register.elements.delivery.value==='entrega';});
 function encodeFile(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('No se pudo leer un archivo. Vuelve a cargarlo.'));reader.readAsDataURL(blob);});}
 register.addEventListener('submit',async event=>{
  event.preventDefault();if(sending||!packet||!register.reportValidity())return;sending=true;const button=register.querySelector('button[type=submit]');button.disabled=true;button.textContent='Guardando solicitud…';$('#intake-register-error').textContent='';
  const inputs=[...$('#intake-rows').querySelectorAll('input,textarea')];inputs.forEach(i=>i.disabled=true);
  try{
   const values=Object.fromEntries(new FormData(register));const customer={name:values.name,phone:values.phone,company:values.company||'',delivery:values.delivery,destination:values.destination||''};
   if(!packet.rows.length&&!packet.files.length)throw Error('Agrega al menos un material o archivo.');
   const items=packet.rows.map(r=>({productId:r.productId??null,query:r.material,quantity:r.quantity===''||r.quantity==null?null:Number(String(r.quantity).replace(',','.')),unit:r.unit||'',original:r.original||'',source:r.source||'',suggestionIds:(r.suggestions||[]).map(p=>p.id)}));
   if(items.some(i=>i.quantity!==null&&(!Number.isFinite(i.quantity)||i.quantity<=0||i.quantity>999999)))throw Error('Revisa las cantidades: usa números o deja el campo vacío para confirmar.');
   const attachments=await Promise.all(packet.files.map(async f=>({name:f.name,data:await encodeFile(f.blob)})));
   const body=JSON.stringify({customer,items,attachments,consent:values.consent==='on'});
   if(!submission||submission.body!==body)submission={body,key:crypto.randomUUID()};
   const response=await fetch(apiBase+'/api/requests',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':submission.key},body});
   const result=await response.json();if(!response.ok)throw Error(result.error||'No se confirmó el registro. Inténtalo nuevamente.');
   if(typeof result.reference!=='string'||!/^ALB-[A-Z0-9-]+$/.test(result.reference))throw Error('No recibimos el número de solicitud. Intenta guardar nuevamente.');
   packet.reference=result.reference;$('#intake-saved-reference').textContent=result.reference;$('#intake-saved-whatsapp').href='https://wa.me/51968406042?text='+encodeURIComponent(`Hola, quiero dar seguimiento a mi solicitud de cotización N.º ${result.reference}. Mi lista y archivos están registrados en la plataforma. ¿Me puede atender un asesor?`);
   register.hidden=true;$('#intake-saved').hidden=false;$('#intake-delivery-status').textContent='Solicitud guardada. Continúa por WhatsApp con el número de referencia.';$('#intake-saved').scrollIntoView({block:'nearest'});
  }catch(error){$('#intake-register-error').textContent=error.message;inputs.forEach(i=>i.disabled=false);}
  finally{sending=false;button.disabled=false;button.textContent='Guardar solicitud';}
 });
 if(['127.0.0.1','localhost'].includes(location.hostname))fetch('/api/health').then(r=>r.ok?r.json():null).then(data=>{if(data?.requests){receiver=true;$('#intake-transfer-note').hidden=true;$('#intake-manual-instructions').hidden=true;$('#intake-manual-actions').hidden=true;$('#intake-register-form').hidden=!packet;}}).catch(()=>{});
})();
