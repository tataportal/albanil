const assert=require('node:assert/strict'),fs=require('node:fs');
const parser=require('../../docs/propuesta/list-parser.js');
const products=JSON.parse(fs.readFileSync('docs/propuesta/catalog.json')).products;
const approved=JSON.parse(fs.readFileSync('scripts/consolidated-products.json')).products;
assert.deepEqual(products.map(p=>p.id).sort((a,b)=>a-b),approved.map(p=>p.id).sort((a,b)=>a-b),'Only approved products belong in the base catalog');
for(const p of products){
 assert(parser.catalogSearch(p.title,products).some(r=>r.id===p.id),`Missing title: ${p.title}`);
 if(p.reference)assert(parser.catalogSearch(p.reference,products).some(r=>r.id===p.id),`Missing ref: ${p.reference}`);
 assert(parser.catalogSearch(p.category,products).some(r=>r.id===p.id),`Missing category: ${p.category}`);
}
for(const q of ['ladrillo','ladrillos',' LADRILLO ','ladri'])assert.equal(parser.catalogSearch(q,products).length,products.filter(p=>p.category==='LADRILLOS').length,q);
assert(parser.catalogSearch('fortes ladrillo',products).some(p=>p.id===84));
for(const [a,b] of [['amoladora','amoladoras'],['guante','guantes'],['lija','lijas'],['panel led','paneles led'],['fierro','fierros'],['triplay','tripley']])assert.deepEqual(parser.catalogSearch(a,products).map(p=>p.id),parser.catalogSearch(b,products).map(p=>p.id),a);
assert.equal(parser.catalogSearch('340-2',products).length,1);
assert.equal(parser.catalogSearch('xyznoexiste',products).length,0);
assert.equal(parser.catalogSearch('   ',products).length,products.length);
const fixture=[{id:1,reference:'AA-1',sku:'SKU-123',title:'Tubo 1/2',brand:'Marca',category:'Tubos'},{id:2,reference:'AA-2',title:'Tubo 1/4',category:'Tubos'}];
assert.deepEqual(parser.catalogSearch('tubos ½',fixture).map(p=>p.id),[1]);
assert.deepEqual(parser.catalogSearch('sku-123',fixture).map(p=>p.id),[1]);
assert.deepEqual(parser.search('AA-2',fixture).map(p=>p.id),[2]);
assert(!parser.search('broca 1/2 madera',products).some(p=>/tornillo/i.test(p.title)));
console.log(`PASS: ${products.length} product titles, references and categories; singular/plural, partial text, SKU, dimensions and absent materials.`);
// The request panel searches combined customer/reference/agent terms without writing requests.
const vm=require('node:vm'),admin=fs.readFileSync('docs/propuesta/admin/admin.js','utf8');
const predicate=admin.match(/const found=requests.filter\(r=>(.*)\);/)[1];
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const request={reference:'ALB-20260915-ABC123',customer:{name:'José Pérez',phone:'+51 968 406 042',company:'Obras Junín'},agent:'Edson Pacheco',status:'Nueva',items:[]};
for(const q of ['jose','perez jose','junin jose','968406042','ABC123','edson',' jose  junin '])assert(vm.runInNewContext(predicate,{r:request,q:normalize(q).trim(),state:'',normalize,pending:()=>true}),q);
assert(!vm.runInNewContext(predicate,{r:request,q:'',state:'Cerrada',normalize,pending:()=>true}));
console.log('PASS request reference, name, company, phone, assigned seller and status filters.');
