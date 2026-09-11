'use strict';
window.createAlbanilRequest = function ({getItems, service, notify, escape:esc}) {
 const $=s=>document.querySelector(s);
 let key='',lastPayload='',sending=false;
 function render(){
  const items=getItems();
  $('#request-materials').innerHTML=items.map(i=>`<li><div><strong>${esc(i.title)}</strong><small>${i.productId?`Ref. ${i.productId}`:'Pendiente de identificar'}${i.original?` · ${esc(i.original)}`:''}</small></div><span>${esc(i.quantity)} ${esc(i.unit||'unidad por confirmar')}</span></li>`).join('')||'<li>No has agregado materiales.</li>';
  $('#request-item-count').textContent=`${items.length} ${items.length===1?'renglón':'renglones'}`;
  $('#request-submit').hidden=!service;$('#request-submit').disabled=!items.length;
  $('#request-download').disabled=!items.length;
  $('#request-mode-note').textContent=service?'Piloto local: la solicitud se guardará en el panel de este equipo. No se envían mensajes automáticos.':'Esta publicación aún no recibe solicitudes. Puedes descargar la solicitud estructurada para compartirla con el vendedor.';
 }
 function delivery(){const pick=$('#customer-delivery').value==='retiro';$('#destination-field').hidden=pick;$('#customer-destination').required=!pick;$('#request-freight').textContent=pick?'No aplica por retiro':'Por calcular según destino y cantidad';}
 $('#customer-delivery').addEventListener('change',delivery);
 function payload(){
  if(!$('#customer-form').reportValidity())return null;
  const items=getItems();if(!items.length){notify('Agrega al menos un material.');return null;}
  if(items.length>100){notify('Divide tu solicitud en grupos de hasta 100 renglones.');return null;}
  if(items.some(i=>!AlbanilListParser.validOrderQuantity(i.quantity,i.unit))){notify('Revisa las cantidades de tu lista antes de continuar.');return null;}
  const values=Object.fromEntries(new FormData($('#customer-form')));
  return {customer:{name:values.name,phone:values.phone,email:values.email||'',company:values.company||'',ruc:values.ruc||'',delivery:values.delivery,destination:values.delivery==='entrega'?values.destination:'',notes:values.notes||''},consent:values.consent==='on',items:items.map(i=>({productId:i.productId,query:i.title,quantity:i.quantity,unit:i.unit,original:i.original||''}))};
 }
 $('#customer-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!service||sending)return;
  const data=payload();if(!data)return;
  const serialized=JSON.stringify(data);if(serialized!==lastPayload){key=crypto.randomUUID();lastPayload=serialized;}
  sending=true;$('#request-submit').disabled=true;$('#request-error').textContent='';
  try{
   const response=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:serialized});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo guardar la solicitud.');
   $('#request-form-area').hidden=true;$('#request-success').hidden=false;$('#request-reference').textContent=result.reference;
   $('#request-success-title').focus();
  }catch(err){$('#request-error').textContent=err.message||'No se confirmó el envío. Puedes reintentar sin duplicar tu solicitud.';}
  finally{sending=false;$('#request-submit').disabled=false;}
 });
 $('#request-download').addEventListener('click',()=>{
  const p=payload();if(!p)return;const c=p.customer;
  const lines=['ALBAÑIL | SOLICITUD DE COTIZACIÓN','Documento preparado por el cliente. No enviado ni registrado en la tienda.',`Fecha: ${new Date().toLocaleString('es-PE')}`,'',`Cliente: ${c.name}`,`WhatsApp / teléfono: ${c.phone}`,`Correo: ${c.email||'No indicado'}`,`Empresa: ${c.company||'No indicada'}`,`RUC: ${c.ruc||'No indicado'}`,`Modalidad: ${c.delivery==='retiro'?'Retiro en tienda':'Entrega'}`,`Destino: ${c.destination||'Retiro en tienda'}`,'','MATERIALES',...p.items.map((i,n)=>`${n+1}. ${i.quantity} ${i.unit||'(unidad por confirmar)'} × ${i.query}\n   ${i.productId?'Ref. '+i.productId:'PENDIENTE DE IDENTIFICAR'}${i.original?'\n   Texto original: '+i.original:''}`),'',`Observaciones: ${c.notes||'Sin observaciones'}`,`Flete: ${c.delivery==='retiro'?'No aplica por retiro':'Por calcular según destino y cantidad'}`,'Precios, presentación, IGV y disponibilidad por confirmar con el vendedor. Esta solicitud no constituye una venta ni reserva existencias.'];
  const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='albanil-solicitud-de-cotizacion.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Solicitud descargada. Aún no se ha enviado a la tienda.');
 });
 $('#request-new').addEventListener('click',()=>{$('#request-success').hidden=true;$('#request-form-area').hidden=false;$('#customer-form').reset();key='';lastPayload='';delivery();render();});
 delivery();return {render};
};
