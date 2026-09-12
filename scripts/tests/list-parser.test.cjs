const assert = require('node:assert/strict');
const fs = require('node:fs');
const parser = require('../../docs/propuesta/list-parser.js');
const products = JSON.parse(fs.readFileSync(new URL('../../docs/propuesta/catalog.json',`file://${__filename}`),'utf8')).products;
let rows=parser.parse('10 bolsas de cemento Andino\r\n50 m de cable THW90 14\n4 tubos para agua de 1/2"');
assert.deepEqual(rows.map(r=>[r.quantity,r.unit]),[[10,'bolsas'],[50,'m'],[4,'']]);
assert.equal(rows[2].query,'tubos para agua de 1/2"');
assert.equal(rows[0].choice,''); // A suggested product is never automatically selected.
assert(parser.search(rows[0].query,products).some(p=>p.id===375));
assert(parser.search(rows[1].query,products).some(p=>p.id===348));
assert(parser.search(rows[2].query,products).some(p=>p.id===257));
assert.equal(parser.parseLine('1/2 pulgada tubo PVC').quantity,'');
assert.equal(parser.parseLine('1,000 cemento Andino').quantity,''); // Ambiguous grouping is not guessed.
assert.equal(parser.parseLine('1,5 kg de aditivo').quantity,1.5);
assert.equal(parser.parseLine('cemento Andino - 20 bolsas').quantity,20);
assert.equal(parser.parseLine('tubo PVC 1/2 x 3').quantity,''); // Product dimensions are not quantities.
assert.equal(parser.parseLine('2. 10 cemento Andino').quantity,10);
assert.equal(parser.parseLine('cemento Andino').quantity,'');
assert.equal(parser.validQuantity(0),false);
assert.equal(parser.validQuantity(0.001),false);
assert.equal(parser.validQuantity(1000000),false);
assert.throws(()=>parser.parse(' \n '));
assert.throws(()=>parser.parse(Array(501).fill('1 cemento').join('\n')));
const candidates=[{id:1,title:'Tubo de 1/2',brand:'Nicoll',category:'TUBOS'},{id:2,title:'Tubo de 3/4',brand:'Nicoll',category:'TUBOS'}];
assert.deepEqual(parser.search('tubo 1/2',candidates).map(p=>p.id),[1]);
assert.deepEqual(parser.search('tubo 1/4',candidates),[]);
assert.deepEqual(parser.search('producto inexistente xyz',products),[]);
assert.equal(parser.parseLine('<img src=x onerror=alert(1)>').original,'<img src=x onerror=alert(1)>');
console.log('List parser: quantities, fractions, units, ambiguous input, exact dimensions and real catalog matches passed.');
// Regression: the exact numbered Markdown/LaTeX format pasted by the user.
const pasted = String.raw`1. **Cemento Portland:** 1 bolsa (42.5 kg)
2. **Arena gruesa:** 1 metro cúbico ($1\text{ m}^3$)
3. **Arena fina:** 1 metro cúbico ($1\text{ m}^3$)
4. **Piedra chancada:** 1 metro cúbico ($1\text{ m}^3$)
5. **Ladrillo King Kong:** 1 millar (1,000 unidades)`;
const repaired = parser.parse(pasted);
assert.deepEqual(repaired.map(r=>[r.query,r.quantity,r.unit]),[
 ['Cemento Portland',1,'bolsa'],['Arena gruesa',1,'metro cúbico'],['Arena fina',1,'metro cúbico'],['Piedra chancada',1,'metro cúbico'],['Ladrillo King Kong',1,'millar']
]);
assert.deepEqual(parser.search(repaired[0].query,products).map(p=>p.id).sort((a,b)=>a-b),[375,562,100046]);
assert.deepEqual(parser.search(repaired[4].query,products).map(p=>p.id).sort((a,b)=>a-b),[84,85,86,87]);
for(const row of repaired.slice(1,4)) assert.equal(parser.search(row.query,products).length,0); // Never substitute sand-colored tanks for sand.
assert.equal(repaired[4].original,pasted.split('\n')[4]);
assert.equal(repaired[4].quantity,1); // A millar is retained, never silently converted to 1,000 units.
assert.equal(parser.parseLine('**Cemento Portland:**1 bolsa (42.5 kg)').quantity,1);
assert.equal(parser.parseLine('Cemento Portland: 2').quantity,2);
assert.equal(parser.parseLine('1 millar de ladrillos King Kong').unit,'millar');
assert.equal(parser.parseLine('Cemento: 1,000 bolsas').quantity,'');
assert.equal(parser.displayLine(pasted.split('\n')[1]),'Arena gruesa: 1 metro cúbico (1 m³)');
const legacy={original:pasted.split('\n')[0],query:'**Cemento Portland:** 1 bolsa (42.5 kg)',quantity:'',unit:'',choice:''};
assert.deepEqual(parser.upgradeDraftRow(legacy),repaired[0]);
for(const edited of [{...legacy,quantity:4},{...legacy,query:'cemento andino'},{...legacy,choice:'pending'},{...legacy,unit:'sacos'}]) assert.deepEqual(parser.upgradeDraftRow(edited),edited);
assert.equal(parser.parseLine('Tubo PVC de 1/2: 4 unidades').query,'Tubo PVC de 1/2');
assert.deepEqual(parser.search(parser.parseLine('Tubo PVC de 1/2: 4 unidades').query,[{id:1,title:'Tubo PVC 1/2',brand:'',category:''},{id:2,title:'Tubo PVC 3/4',brand:'',category:''}]).map(p=>p.id),[1]);
console.log('Formatted lists: Markdown, quantities after names, cubic units, packaging notes, real matches and draft-preserving repair passed.');
// Regression: container units and pipe dimensions from the second failed list.
const constructionList = String.raw`Triplay: 1 plancha (1.22 m \times 2.44 m, 4 mm a 18 mm)
Tubos de PVC para desagüe: 1 tubo (de 4 pulgadas x 3 metros)
Tubos de PVC para agua fría: 1 tubo (de 1/2 pulgada x 5 metros)
Pegamento para PVC: 1 tarro (de 1/4 galón o 240 ml)`;
const constructionRows = parser.parse(constructionList);
assert.deepEqual(constructionRows.map(r=>[r.query,r.quantity,r.unit]),[
 ['Triplay',1,'plancha'],['Tubos de PVC para desagüe 4 pulgada',1,'tubo'],
 ['Tubos de PVC para agua fría 1/2 pulgada',1,'tubo'],['Pegamento para PVC',1,'tarro']
]);
assert.deepEqual(parser.search(constructionRows[1].query,products).map(p=>p.id),[253,256]);
assert.deepEqual(parser.search(constructionRows[2].query,products).map(p=>p.id),[257,258,259,260]);
assert.deepEqual(parser.search(constructionRows[0].query,products).map(p=>p.id),[100045]);
assert.equal(parser.search(constructionRows[3].query,products).length,0); // Never replace PVC glue with ceramic adhesive.
for(const [i,row] of constructionRows.entries()) {
 assert.equal(row.original,constructionList.split('\n')[i]);
 assert.equal(row.choice,'');
 const failed={original:row.original,query:parser.displayLine(row.original),quantity:'',unit:'',choice:''};
 assert.deepEqual(parser.upgradeDraftRow(failed),row);
 for(const edited of [{...failed,quantity:2},{...failed,choice:'pending'},{...failed,query:'tubo nicoll'},{...failed,unit:'unidades'}]) assert.deepEqual(parser.upgradeDraftRow(edited),edited);
}
assert.equal(parser.displayLine(constructionRows[0].original),'Triplay: 1 plancha (1.22 m × 2.44 m, 4 mm a 18 mm)');
assert.equal(parser.parseLine('Triplay - 2 planchas (1.22 m × 2.44 m)').quantity,2);
assert.equal(parser.parseLine('Tubo: 1 tubo (de ½ pulgada x 5 metros)').query,'Tubo ½ pulgada');
assert.deepEqual(parser.search('tubo PVC agua fría 1/2',[
 {id:1,title:'Tubo para agua 1/2 - agua caliente',brand:'',category:'TUBOS'},
 {id:2,title:'Tubo para agua de 3/4',brand:'',category:'TUBOS'},
 {id:3,title:'Codo para agua de 1/2',brand:'',category:'TUBOS'},
 {id:4,title:'Tubo para desagüe de 1/2',brand:'',category:'TUBOS'}
]),[]);
console.log('Construction list: container units, exact pipe diameters, cold-water exclusions, absent products and saved-draft migration passed.');
// Quantities follow the explicitly indicated unit, not the product's price.
for(const unit of ['', 'unidad', 'unidades', 'pares', 'bolsas', 'tubos', 'planchas', 'tarros']) {
 assert.equal(parser.validOrderQuantity(1.54,unit),false);
 assert.equal(parser.validOrderQuantity(2,unit),true);
}
for(const unit of ['m','metros','m³','metro cúbico','kg','litros']) {
 assert.equal(parser.validOrderQuantity(1.54,unit),true);
 assert.equal(parser.validOrderQuantity(0.5,unit),true);
 assert.equal(parser.validOrderQuantity(0,unit),false);
 assert.equal(parser.validOrderQuantity(1.541,unit),false);
}
assert.equal(parser.validOrderQuantity(1000000),false);
console.log('Order quantities: integer counts and explicitly measured decimals passed.');

assert.equal(parser.parse(Array(200).fill('2 bolsas de cemento').join('\n')).length,200);
