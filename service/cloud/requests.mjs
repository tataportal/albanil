import {catalog} from './catalog.mjs';
const statuses=['Nueva','En atención','Cotización parcial','Cotizada','Terminada','Cerrada'];
const invalid=message=>Object.assign(new Error(message),{status:400});
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())throw invalid('Revisa los campos de la solicitud.');return value.trim();};
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function validateSubmission(input){
 if(input.consent!==true||!input.customer||!Array.isArray(input.items)||input.items.length>500)throw invalid('Revisa tus datos y materiales.');
 const c=input.customer;
 const customer={name:text(c.name,100,true),phone:text(c.phone,24,true),company:text(c.company||'',160),email:text(c.email||'',160),ruc:text(c.ruc||'',20),delivery:c.delivery,destination:text(c.destination||'',300),notes:text(c.notes||'',2000)};
 if(!/^[+0-9 ()-]{7,24}$/.test(customer.phone)||!['retiro','entrega'].includes(c.delivery)||c.delivery==='entrega'&&!customer.destination)throw invalid('Revisa el teléfono y el destino de entrega.');
 const items=input.items.map(i=>{
  const quantity=i.quantity==null?null:i.quantity;
  if(quantity!==null&&(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>999999||Math.abs(quantity*100-Math.round(quantity*100))>1e-7))throw invalid('Cantidad inválida.');
  if(i.productId!=null&&!Number.isSafeInteger(i.productId))throw invalid('Producto inválido.');
  const unit=text(i.unit||'',30);
  if(quantity!==null&&unit&&!['m','metro','metros','kg','kilogramo','kilogramos','litro','litros','l','m2','m3'].includes(unit.toLowerCase())&&!Number.isInteger(quantity))throw invalid('Esta unidad requiere cantidades enteras.');
  return {productId:i.productId??null,query:text(i.query,500,true),quantity,unit,original:text(i.original||'',2000),source:text(i.source||'',260),suggestionIds:Array.isArray(i.suggestionIds)?i.suggestionIds.filter(Number.isSafeInteger).slice(0,3):[]};
 });
 const files=input.attachments||[];
 if(!Array.isArray(files)||files.length>5||!items.length&&!files.length)throw invalid('Incluye materiales o un archivo.');
 let total=0;
 const attachments=files.map(f=>{
  const name=text(f.name,200,true).replace(/[\\/\r\n]/g,'_');
  if(!/\.(pdf|xlsx?|csv|jpe?g|png|webp)$/i.test(name)||typeof f.data!=='string'||f.data.length>13981016||f.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.data))throw invalid('Archivo inválido.');
  const size=f.data.length*3/4-(f.data.endsWith('==')?2:f.data.endsWith('=')?1:0);total+=size;
  if(!size||size>10*1024*1024)throw invalid('Máximo 10 MB por archivo.');
  return {id:crypto.randomUUID(),name,size,data:f.data};
 });
 if(total>20*1024*1024)throw invalid('Máximo 20 MB de archivos por solicitud.');
 return {customer,items,attachments};
}
export async function submitRequest(request,env,json){
 const key=request.headers.get('Idempotency-Key');
 if(!key||!/^[a-zA-Z0-9-]{16,80}$/.test(key))return json({error:'Identificador de envío inválido.'},400);
 const declared=Number(request.headers.get('Content-Length')||0);
 if(declared>30*1024*1024)return json({error:'Solicitud demasiado grande.'},413);
 const raw=await request.text();if(raw.length>30*1024*1024)return json({error:'Solicitud demasiado grande.'},413);
 const hash=await sha(raw),keyHash=await sha(key);
 const prior=await env.DB.prepare('SELECT reference,body_hash FROM requests WHERE idempotency_key=?').bind(keyHash).first();
 if(prior)return prior.body_hash===hash?json({reference:prior.reference},200):json({error:'El contenido cambió. Prepara un nuevo envío.'},409);
 const value=validateSubmission(JSON.parse(raw));
 const rateKey='requests:'+await sha((request.headers.get('CF-Connecting-IP')||'unknown')+':'+Math.floor(Date.now()/3600000));
 const attempt=await env.DB.prepare('INSERT INTO login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(rateKey,Date.now()+7200000).first();
 if(attempt.attempts>20)return json({error:'Has enviado varias solicitudes. Vuelve a intentarlo más tarde.'},429);
 const data=await catalog(env),byId=new Map(data.products.filter(p=>p.state!=='INACTIVO').map(p=>[p.id,p]));
 const items=value.items.map(i=>{const p=byId.get(i.productId);return {...i,title:p?.title||i.query,productId:p?.id||null,pending:!p,brand:p?.brand||'',sku:p?.sku||'',saleUnit:p?.unit||'',price:p?.price??null,currency:p?.currency||'PEN',pricePEN:p?.price==null?null:p.currency==='USD'?Math.round(p.price*data.exchangeRate.rate*100)/100:p.price,exchangeRate:p?.currency==='USD'?data.exchangeRate.rate:null,availability:p?.availability||'',suggestions:i.suggestionIds.map(id=>byId.get(id)).filter(Boolean).map(p=>({id:p.id,title:p.title}))};});
 const reference='ALB-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
 const packet={reference,created_at:new Date().toISOString(),customer:value.customer,items,attachments:value.attachments.map(({data,...meta})=>meta),status:'Nueva',agent:'',notes:'',version:0};
 const summary={...packet,items:items.map(i=>({pending:i.pending,quantity:i.quantity})),attachments:packet.attachments};
 if(new TextEncoder().encode(JSON.stringify(packet)+JSON.stringify(summary)).length>1800000)throw invalid('El texto de la solicitud es demasiado extenso. Adjunta el documento original.');
 const statements=[env.DB.prepare('INSERT INTO requests(reference,idempotency_key,body_hash,data,summary,version,created_at) VALUES(?,?,?,?,?,0,?)').bind(reference,keyHash,hash,JSON.stringify(packet),JSON.stringify(summary),packet.created_at)];
 for(const file of value.attachments){
  statements.push(env.DB.prepare('INSERT INTO request_files(id,reference,name,size) VALUES(?,?,?,?)').bind(file.id,reference,file.name,file.size));
  for(let start=0,n=0;start<file.data.length;start+=1024*1024,n++)statements.push(env.DB.prepare('INSERT INTO file_chunks(file_id,part,data) VALUES(?,?,?)').bind(file.id,n,file.data.slice(start,start+1024*1024)));
 }
 // D1 batches are transactional: a reference is returned only after all original files are stored.
 try{await env.DB.batch(statements);}catch(error){const saved=await env.DB.prepare('SELECT reference,body_hash FROM requests WHERE idempotency_key=?').bind(keyHash).first();if(saved&&saved.body_hash===hash)return json({reference:saved.reference});throw error;}
 return json({reference},201);
}
export async function privateRequests(request,env,path,json){
 if(request.method==='GET'&&path==='/api/requests'){
  const result=await env.DB.prepare('SELECT summary,version FROM requests ORDER BY created_at DESC').all();
  return json({requests:result.results.map(row=>({...JSON.parse(row.summary),version:row.version}))});
 }
 const fileMatch=path.match(/^\/api\/requests\/(ALB-[A-Z0-9-]+)\/files\/([a-f0-9-]+)$/);
 if(fileMatch&&request.method==='GET'){
  const file=await env.DB.prepare('SELECT id,name,size FROM request_files WHERE id=? AND reference=?').bind(fileMatch[2],fileMatch[1]).first();
  if(!file)return json({error:'Archivo no encontrado.'},404);
  const rows=await env.DB.prepare('SELECT data FROM file_chunks WHERE file_id=? ORDER BY part').bind(file.id).all();
  const stream=new ReadableStream({start(controller){for(const row of rows.results){const raw=atob(row.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));controller.enqueue(bytes);}controller.close();}});
  return new Response(stream,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 const match=path.match(/^\/api\/requests\/(ALB-[A-Z0-9-]+)$/);
 if(!match)return null;
 const row=await env.DB.prepare('SELECT data,version FROM requests WHERE reference=?').bind(match[1]).first();
 if(!row)return json({error:'Solicitud no encontrada.'},404);
 const packet={...JSON.parse(row.data),version:row.version};
 if(request.method==='GET')return json(packet);
 if(request.method==='PATCH'){
  const raw=await request.text();if(raw.length>10000)throw invalid('Notas demasiado largas.');
  const input=JSON.parse(raw);
  if(!statuses.includes(input.status)||input.version!==row.version)return json({error:'Actualiza la solicitud antes de guardar.'},409);
  Object.assign(packet,{status:input.status,agent:text(input.agent||'',100),notes:text(input.notes||'',4000),version:row.version+1});
  const summary={...packet,items:packet.items.map(i=>({pending:i.pending,quantity:i.quantity}))};
  const saved=await env.DB.prepare('UPDATE requests SET data=?,summary=?,version=version+1 WHERE reference=? AND version=? RETURNING version').bind(JSON.stringify(packet),JSON.stringify(summary),packet.reference,row.version).first();
  return saved?json(packet):json({error:'Otro asesor actualizó la solicitud. Actualiza el panel.'},409);
 }
 return null;
}
