'use strict';
(() => {
 const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let files=[],busy=false,packet=null,db=null,receiver=false,submission=null,sending=false;
 const note=msg=>{$('#intake-status').textContent=msg;};
 const ready=new Promise(resolve=>{const req=indexedDB.open('albanil-intake-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'id'});req.onsuccess=()=>{db=req.result;const r=db.transaction('files').objectStore('files').getAll();r.onsuccess=()=>{files=r.result;renderFiles();resolve();};r.onerror=resolve;};req.onerror=()=>{note('Los archivos durarán mientras mantengas esta pestaña abierta.');resolve();};});
 function persist(){if(!db)return;const tx=db.transaction('files','readwrite'),s=tx.objectStore('files');s.clear();files.forEach(f=>s.put(f));tx.onerror=()=>note('No se pudo guardar el archivo en este navegador. Conserva esta pestaña abierta.');}
 function renderFiles(){ $('#intake-files').innerHTML=files.map(f=>`<li><span><strong>${esc(f.name)}</strong><small>${esc(f.status)}</small></span><button type="button" class="text-link" data-file-remove="${f.id}">Quitar</button></li>`).join(''); }
 function script(src,global){if(window[global])return Promise.resolve(window[global]);return new Promise((resolve,reject)=>{const e=document.createElement('script');e.src=src;e.onload=()=>resolve(window[global]);e.onerror=()=>{e.remove();reject(Error('No se pudo cargar el lector. El original queda adjunto.'));};document.head.append(e);});}
 const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 async function readFile(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(['xlsx','xls','csv'].includes(ext)){
   const X=await script('assets/vendor/xlsx-0.20.3.min.js','XLSX');const wb=X.read(await file.arrayBuffer(),{type:'array',cellFormula:false,cellHTML:false,sheetRows:501});let lines=[];
   for(const name of wb.SheetNames){const sheet=wb.Sheets[name];if(sheet['!fullref']&&X.utils.decode_range(sheet['!fullref']).e.r>=501)throw Error('Más de 500 filas: el asesor revisará el archivo completo.');const rows=X.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});let map=null;
    for(const row of rows){if(!row.some(v=>String(v).trim()))continue;const n=row.map(norm),desc=n.findIndex(v=>/^(descripcion|producto|material|detalle)( del producto)?$/.test(v)),qty=n.findIndex(v=>/^(cantidad|cant\.?|qty)$/.test(v)),unit=n.findIndex(v=>/^(unidad|und\.?|u\.m\.?|um)$/.test(v));
     if(desc>=0){map={desc,qty,unit};continue;}const line=map?`${map.qty>=0?row[map.qty]:''} ${map.unit>=0?row[map.unit]:''} ${row[map.desc]||''}`.trim():row.filter(v=>String(v).trim()).join(' ');if(line)lines.push(line);
    }
   }if(lines.length>500)throw Error('Más de 500 filas: el asesor revisará el archivo completo.');return lines.join('\n');
  }
  if(ext==='pdf'){
   const lib=await import('./assets/vendor/pdf.min.mjs');lib.GlobalWorkerOptions.workerSrc='assets/vendor/pdf.worker.min.mjs';const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});task.onPassword=()=>task.destroy();const pdf=await task.promise;
   try{if(pdf.numPages>40)throw Error('Más de 40 páginas: el asesor revisará el PDF completo.');let out=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),text=await page.getTextContent();let line='',y=null;for(const item of text.items){if(!('str' in item))continue;const ny=Math.round(item.transform[5]);if(y!==null&&Math.abs(y-ny)>3){if(line.trim())out.push(line.trim());line='';}line+=' '+item.str;y=ny;if(item.hasEOL){if(line.trim())out.push(line.trim());line='';y=null;}}if(line.trim())out.push(line.trim());}return out.join('\n');}finally{await pdf.destroy();}
  }
  return '';
 }
 $('#intake-upload').addEventListener('change',async event=>{
  if(busy||sending)return;await ready;busy=true;$('#intake-prepare').disabled=true;
  try{for(const file of event.target.files){if(files.length>=5){note('Máximo 5 archivos. Quita uno antes de agregar otro.');break;}if(file.size>10*1024*1024||files.reduce((s,f)=>s+f.blob.size,0)+file.size>20*1024*1024){note('Máximo 10 MB por archivo y 20 MB en total.');continue;}if(!/\.(pdf|xlsx?|csv|jpe?g|png|webp)$/i.test(file.name)){note('Usa PDF, Excel, CSV, JPG, PNG o WebP.');continue;}
   const item={id:crypto.randomUUID(),name:file.name,blob:file,text:'',status:'Leyendo…'};files.push(item);renderFiles();note(`Leyendo ${file.name}…`);
   try{item.text=await readFile(file);item.status=item.text.trim()?'Texto extraído · revisión pendiente':'Sin texto extraíble · original para revisión del asesor';}catch(e){item.status='Revisión manual: '+e.message;}persist();renderFiles();
  }note('Archivos incorporados. Prepara la solicitud para revisar todos los materiales juntos.');}finally{busy=false;event.target.value='';$('#intake-prepare').disabled=false;}
 });
 $('#intake-files').addEventListener('click',e=>{const b=e.target.closest('[data-file-remove]');if(!b||busy)return;files=files.filter(f=>f.id!==b.dataset.fileRemove);persist();renderFiles();});
 async function prepare(){
  if(busy||sending)return;await ready;const bridge=window.AlbanilIntakeBridge;if(!bridge){note('El catálogo todavía está cargando. Inténtalo nuevamente.');return;}
  const raw=$('#paste-list').value.trim();let rows=bridge.summary().map(r=>({productId:r.productId??null,material:r.title,quantity:r.quantity,unit:r.unit||'',source:'Mi lista',status:r.productId?'Producto seleccionado por el cliente':'Pendiente de identificar'}));
  const sources=[{name:'Texto escrito o pegado',text:raw,rows:bridge.draft?.()},...files.map(f=>({name:f.name,text:f.text}))];
  for(const source of sources){if(!source.text.trim())continue;const lines=source.rows?.length?source.rows:source.text.split(/\r?\n/).filter(s=>s.trim());for(const entry of lines){const original=typeof entry==='string'?entry:entry.original;const r=typeof entry==='string'?AlbanilListParser.parseLine(entry):entry,found=AlbanilListParser.search(r.query,bridge.products,3);rows.push({material:r.query||original,quantity:r.quantity,unit:r.unit,source:source.name,original,status:found.length?'Coincidencias sugeridas · confirmar':'Pendiente de identificar',suggestions:found.map(p=>({id:p.id,title:p.title,brand:p.brand}))});}}
  if(!rows.length&&!files.length){note('Escribe materiales, agrega productos o carga un archivo primero.');$('#paste-list').focus();return;}
  if(rows.length>500){note('La extracción supera 500 renglones. Reduce el texto o quita el archivo y envíalo directamente al asesor; no se ha descartado información.');return;}
  $('#intake-saved').hidden=true;$('#intake-register-form').hidden=!receiver;$('#intake-register-error').textContent='';
  packet={reference:'ALB-'+crypto.randomUUID().slice(0,8).toUpperCase(),rows,files:[...files],raw};
  $('#intake-rows').innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td><input aria-label="Cantidad renglón ${i+1}" data-intake-index="${i}" data-field="quantity" value="${esc(r.quantity)}" placeholder="Por confirmar"></td><td><input aria-label="Unidad renglón ${i+1}" data-intake-index="${i}" data-field="unit" value="${esc(r.unit)}" placeholder="Por confirmar"></td><td><textarea aria-label="Material renglón ${i+1}" data-intake-index="${i}" data-field="material">${esc(r.material)}</textarea><small>${esc(r.source)}</small></td><td>${esc(r.status)}${r.suggestions?.length?'<small>'+r.suggestions.map(p=>esc(p.title)).join('<br>')+'</small>':''}</td></tr>`).join('');
  $('#intake-overview').textContent=`${rows.length} renglones · ${files.length} archivos originales. Las coincidencias son sugerencias: el asesor confirma producto, cantidad, unidad y precio.`;
  $('#intake-manual').textContent=files.filter(f=>!f.text.trim()).map(f=>`${f.name}: revisión manual del original.`).join(' ');
  $('#intake-share').hidden=!(navigator.share&&navigator.canShare);$('#intake-copy-text').hidden=true;$('#intake-whatsapp-short').hidden=true;$('#intake-delivery-status').textContent='Todavía no se ha enviado a la tienda.';
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('#intake-dialog').showModal();
  if(receiver){$('#intake-manual-actions').hidden=true;$('#intake-transfer-note').hidden=true;$('#intake-manual-instructions').hidden=true;$('#intake-delivery-status').textContent='Guarda la solicitud para obtener un número. Los archivos quedarán incluidos.';}
 }
 $('#intake-prepare').addEventListener('click',prepare);
 document.addEventListener('click',e=>{if(e.target.closest('[data-intake-prepare]'))prepare();});
 $('#intake-rows').addEventListener('input',e=>{const i=e.target.dataset.intakeIndex,f=e.target.dataset.field;if(i!==undefined&&f){packet.rows[+i][f]=e.target.value;if(f==='material')packet.rows[+i].productId=null;packet.rows[+i].status='Editado por el cliente · confirmar';}});

 function message(){return ['Hola, quisiera cotizar esta lista:',packet.reference,'',...packet.rows.map((r,i)=>`${i+1}. ${r.quantity||'Cantidad por confirmar'} ${r.unit||''} | ${r.material}${r.suggestions?.length?'\n   Posibles coincidencias: '+r.suggestions.map(p=>p.title).join('; '):''}`),'',...packet.files.map(f=>`Archivo: ${f.name} (${f.status})`),'Precios, unidades y flete por confirmar.'].join('\n');}
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
   const items=packet.rows.map(r=>({productId:r.productId??null,query:r.material,quantity:r.quantity===''||r.quantity==null?null:Number(String(r.quantity).replace(',','.')),unit:r.unit||'',original:r.original||'',source:r.source||'',suggestionIds:(r.suggestions||[]).map(p=>p.id)}));
   if(items.some(i=>i.quantity!==null&&!Number.isFinite(i.quantity)))throw Error('Revisa las cantidades: usa números o deja el campo vacío para confirmar.');
   const attachments=await Promise.all(packet.files.map(async f=>({name:f.name,data:await encodeFile(f.blob)})));
   const body=JSON.stringify({customer,items,attachments,consent:values.consent==='on'});
   if(!submission||submission.body!==body)submission={body,key:crypto.randomUUID()};
   const response=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':submission.key},body});
   const result=await response.json();if(!response.ok)throw Error(result.error||'No se confirmó el registro. Inténtalo nuevamente.');
   $('#intake-saved-reference').textContent=result.reference;$('#intake-saved-whatsapp').href='https://wa.me/51968406042?text='+encodeURIComponent(`Hola, quisiera cotizar mi solicitud ${result.reference}. Incluye ${items.length} materiales y ${attachments.length} archivos, ya guardados para el asesor.`);
   register.hidden=true;$('#intake-saved').hidden=false;$('#intake-delivery-status').textContent='Guardada en el panel local. WhatsApp solo comunica el número.';$('#intake-saved').scrollIntoView({block:'nearest'});
  }catch(error){$('#intake-register-error').textContent=error.message;inputs.forEach(i=>i.disabled=false);}
  finally{sending=false;button.disabled=false;button.textContent='Guardar solicitud';}
 });
 if(['127.0.0.1','localhost'].includes(location.hostname))fetch('/api/health').then(r=>r.ok?r.json():null).then(data=>{if(data?.requests){receiver=true;$('#intake-transfer-note').hidden=true;$('#intake-manual-instructions').hidden=true;$('#intake-manual-actions').hidden=true;$('#intake-register-form').hidden=!packet;}}).catch(()=>{});
})();
