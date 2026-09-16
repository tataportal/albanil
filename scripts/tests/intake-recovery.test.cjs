const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const code=fs.readFileSync(require('node:path').join(__dirname,'../../docs/propuesta/intake.js'),'utf8');
const persistent=new Map(),contacts=new Map();
const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
const values={name:'Verificación',phone:'968406042',company:'',delivery:'retiro',destination:'',consent:'on'};
function boot(fetcher,quantity=2){
 const nodes=new Map();
 function node(key){if(!nodes.has(key))nodes.set(key,{value:key==='#paste-list'?'':'' ,hidden:false,disabled:false,textContent:'',innerHTML:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn},setAttribute(){},setCustomValidity(v){this.validation=v},reportValidity(){return true},focus(){},scrollIntoView(){},showModal(){this.open=true},close(){this.open=false},querySelector(sel){return node(key+' '+sel)},contains(){return false}});return nodes.get(key)}
 node('#intake-saved').hidden=true;
 const register=node('#intake-register-form');register.elements=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{...node('element-'+k),value:v}]));
 const doc={querySelector:node,querySelectorAll:()=>[],addEventListener(){},dispatchEvent(){}};
 const sandbox={URLSearchParams,CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail}},console,Map,Set,Promise,Number,String,JSON,Uint8Array,TextEncoder,crypto:webcrypto,localStorage:storage(persistent),sessionStorage:storage(contacts),document:doc,location:{hostname:'albanil.pe',reload(){}},navigator:{locks:{request:async(_,fn)=>fn()}},indexedDB:{open(){const req={};queueMicrotask(()=>req.onerror());return req}},FormData:class{constructor(){}*[Symbol.iterator](){yield*Object.entries(values)}},fetch:fetcher,AlbanilListParser:require('../../docs/propuesta/list-parser.js')};
 sandbox.window={AlbanilPricing:require('../../docs/propuesta/pricing.js'),AlbanilSettings:{api:'https://albanil.pe/nueva'},AlbanilIntakeBridge:{summary:()=>[{productId:1,title:'Tornillos',quantity,unit:'unidad'}],products:[]},addEventListener(){},dispatchEvent(){}};
 vm.runInNewContext(code,sandbox);
 return {nodes,node,submit:()=>register.handlers.submit({preventDefault(){}})};
}
(async()=>{
 let requests=[];
 const lost=boot(async(url,opts)=>{requests.push(opts);throw Error('Respuesta perdida');});
 await lost.submit();assert.equal(requests.length,1);assert.ok(JSON.parse(persistent.get('albanil-request-send-v1')).key);
 const retry=boot(async(url,opts)=>{requests.push(opts);return {ok:true,json:async()=>({reference:'ALB-20260915-RECOVERY'})}});
 await retry.submit();assert.equal(requests.length,2);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);assert.equal(requests[0].body,requests[1].body);
 const reloaded=boot(async()=>{throw Error('No debe volver a enviar')});
 assert.equal(reloaded.node('#intake-saved-reference').textContent,'ALB-20260915-RECOVERY');assert.equal(reloaded.node('#intake-register-form').hidden,true);await reloaded.submit();assert.equal(requests.length,2);
 persistent.clear();const invalid=boot(async()=>{throw Error('Cantidad inválida no debe enviarse')},1.54);await invalid.submit();assert.equal(invalid.node('#intake-dialog').open,true);assert.equal(persistent.has('albanil-request-send-v1'),false);
 console.log('Intake: lost response retry keeps key/body after reload; receipt restored; duplicate submit blocked; fractional units stop before network.');
})().catch(e=>{console.error(e);process.exitCode=1});
