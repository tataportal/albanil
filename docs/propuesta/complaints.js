'use strict';
(()=>{
 const form=document.querySelector('#complaint-form'),error=document.querySelector('#complaint-error');let key='',lastBody='',receipt=null;
 if(location.hostname==='tataportal.github.io'){location.replace('https://albanil.pe/nueva/reclamaciones.html');return;}
 const api=new URL('api/complaints',location.href).href;
 function minor(){document.querySelector('#representative-label').hidden=!form.elements.minor.checked;form.elements.representative.required=form.elements.minor.checked;}
 form.elements.minor.addEventListener('change',minor);
 form.elements.responseChannel.addEventListener('change',()=>{form.elements.email.required=form.elements.responseChannel.value==='Correo electrónico';document.querySelector('#complaint-email-label').textContent=form.elements.email.required?'Correo electrónico':'Correo electrónico (opcional)';});
 form.addEventListener('submit',async e=>{e.preventDefault();error.textContent='';const button=form.querySelector('[type=submit]');button.disabled=true;
 try{const value=Object.fromEntries(new FormData(form));value.minor=form.elements.minor.checked;value.amount=Number(value.amount);if(!value.minor)value.representative='';const body=JSON.stringify(value);if(body!==lastBody){key=crypto.randomUUID();lastBody=body;}
 const res=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body}),data=await res.json();if(!res.ok)throw Error(data.error||'No se pudo registrar. Inténtalo nuevamente.');receipt=data.complaint;document.querySelector('#receipt-email-status').textContent=data.copyStatus==='accepted'?`Enviamos una copia a ${receipt.email}. Revisa también tu carpeta de spam.`:data.copyStatus==='pending'?`Tu registro está guardado. La copia a ${receipt.email} está pendiente de envío; lo reintentaremos automáticamente. Puedes descargarla aquí.`:'Puedes descargar o imprimir tu copia aquí.';form.hidden=true;document.querySelector('#complaint-success').hidden=false;document.querySelector('#receipt-number').textContent=receipt.reference;document.querySelector('#receipt-content').innerHTML=AlbanilComplaintReceipt.html(receipt);document.querySelector('#receipt-heading').setAttribute('tabindex','-1');document.querySelector('#receipt-heading').focus();
 }catch(e){error.textContent=e instanceof SyntaxError?'No pudimos conectar. Inténtalo nuevamente; conservamos tus datos en este formulario.':e.message;}finally{button.disabled=false;}});
 document.querySelector('#receipt-download').addEventListener('click',()=>{if(receipt)AlbanilComplaintReceipt.download(receipt);});
 document.querySelector('#receipt-print').addEventListener('click',()=>window.print());
})();
