import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import worker from './worker.mjs';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 const DB={prepare(query){let values=[];const statement={bind(...v){values=v;return statement;},async first(){return sql.prepare(query).get(...values)??null;},async run(){return sql.prepare(query).run(...values);},async all(){return {results:sql.prepare(query).all(...values)};}};return statement;},async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.all());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const password='random-test-access-key-not-used-in-production';
 const env={DB,ALLOWED_ORIGINS:'https://tataportal.github.io',ADMIN_PASSWORD_HASH:createHash('sha256').update(password).digest('hex')};
 const call=(path,method='GET',data,token,origin='https://tataportal.github.io',extra={})=>worker.fetch(new Request('https://worker.example/api/'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})}),env);
 return {sql,call,password};
}
test('Published rate is public; edits require password and an allowed origin',async()=>{
 const {call,password}=fixture();
 assert.equal((await (await call('exchange-rate')).json()).rate,3.4);
 assert.equal((await call('exchange-rate','PATCH',{rate:4,version:0})).status,401);
 assert.equal((await call('login','POST',{username:'administrador',password:'wrong'})).status,401);
 assert.equal((await call('login','POST',{username:'administrador',password},null,'https://attacker.example')).status,403);
 assert.equal((await call('login','POST',{username:'otro',password})).status,401);
 const login=await call('login','POST',{username:'administrador',password});assert.equal(login.status,200);
 assert.equal(login.headers.get('Access-Control-Allow-Origin'),'https://tataportal.github.io');
 const {token}=await login.json();
 assert.equal((await call('exchange-rate','PATCH',{rate:3.45,version:0},token,'https://attacker.example')).status,403);
});
test('Save persists for independent reads, preserves audit, rejects invalid and stale edits, logout revokes access',async()=>{
 const {call,password,sql}=fixture();const {token}=await (await call('login','POST',{username:'administrador',password})).json();
 for(const rate of [0,-1,101,3.12345,'3.4',null,true])assert.equal((await call('exchange-rate','PATCH',{rate,version:0},token)).status,400);
 const saved=await (await call('exchange-rate','PATCH',{rate:3.45,version:0},token)).json();
 assert.equal(saved.rate,3.45);assert.equal(saved.version,1);
 assert.equal((await (await call('exchange-rate')).json()).rate,3.45);
 assert.equal((await call('exchange-rate','PATCH',{rate:3.50,version:0},token)).status,409);
 const audit=sql.prepare('SELECT * FROM exchange_audit').all();assert.equal(audit.length,1);assert.equal(audit[0].previous_rate,3.4);
 assert.equal((await call('exchange-rate','PATCH',{rate:3.45,version:1},token)).status,200);
 assert.equal((await call('logout','POST',{},token)).status,200);
 assert.equal((await call('exchange-rate','PATCH',{rate:3.4,version:2},token)).status,401);
});
test('Repeated login attempts are rate limited',async()=>{
 const {call}=fixture();for(let i=0;i<8;i++)assert.equal((await call('login','POST',{username:'administrador',password:'wrong'})).status,401);
 assert.equal((await call('login','POST',{username:'administrador',password:'wrong'})).status,429);
});
test('Large request preserves originals, number is idempotent, records and files require login',async t=>{
 const source=JSON.parse(readFileSync(new URL('../../docs/propuesta/catalog.json',import.meta.url),'utf8'));
 t.mock.method(globalThis,'fetch',async()=>Response.json(source));
 const {call,password,sql}=fixture();const {token}=await (await call('login','POST',{username:'administrador',password})).json();
 const bytes=Buffer.alloc(1200000,37),original=bytes.toString('base64');
 const data={consent:true,customer:{name:'Validación interna',phone:'999999999',delivery:'retiro'},items:Array.from({length:200},(_,i)=>({query:'Material '+i,quantity:i+1,unit:'unidad'})),attachments:[{name:'original.pdf',data:original}]};
 const headers={'Idempotency-Key':'12345678-1234-1234-1234-123456789012'};
 const first=await call('requests','POST',data,null,undefined,headers);assert.equal(first.status,201);const {reference}=await first.json();assert.match(reference,/^ALB-\d{8}-[A-F0-9]{12}$/);
 assert.equal((await (await call('requests','POST',data,null,undefined,headers)).json()).reference,reference);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM requests').get().n,1);
 assert.equal((await call('requests')).status,401);
 assert.equal((await call('requests/'+reference)).status,401);
 const record=await (await call('requests/'+reference,'GET',null,token)).json();assert.equal(record.items.length,200);assert.equal(record.attachments.length,1);
 const file='requests/'+reference+'/files/'+record.attachments[0].id;
 assert.equal((await call(file)).status,401);
 const download=await call(file,'GET',null,token);assert.equal(download.headers.get('Content-Type'),'application/octet-stream');assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
 assert.equal((await call('requests','POST',{...data,consent:false},null,undefined,{'Idempotency-Key':'different-1234567890'})).status,400);
 assert.equal((await call('requests/'+reference,'PATCH',{status:'En atención',agent:'Ventas',notes:'Revisión',version:0},token)).status,200);
 assert.equal((await call('requests/'+reference,'PATCH',{status:'Cotizada',version:0},token)).status,409);
});
test('Product units and stock persist and concurrent edits do not overwrite newer values',async t=>{
 const source=JSON.parse(readFileSync(new URL('../../docs/propuesta/catalog.json',import.meta.url),'utf8'));
 t.mock.method(globalThis,'fetch',async()=>Response.json(source));
 const {call,password}=fixture();const {token}=await (await call('login','POST',{username:'administrador',password})).json();
 const update={unit:'par',price:'10.45',stock:'5',currency:'PEN',tax:'confirmar',sku:'',version:0};
 assert.equal((await call('products/43','PATCH',update)).status,401);
 assert.equal((await call('products/43','PATCH',update,token)).status,200);
 const data=await (await call('catalog')).json();const p=data.products.find(p=>p.id===43);assert.equal(p.unit,'par');assert.equal(p.stock,5);assert.equal(p.version,1);
 assert.equal((await call('products/43','PATCH',update,token)).status,409);
 assert.equal((await call('products/43','PATCH',{...update,stock:'1.5',version:1},token)).status,400);
});
