const assert=require('node:assert/strict');
const D=require('../../docs/propuesta/document-reader.js');
const sheet=rows=>[{name:'Materiales',rows}];
let r=D.excelRows(sheet([
 ['SISTEMA INTEGRADO DE GESTION'],['ITEM','CANT','UND','INSUMO / SERVICIO','DESCRIPCION / MARCA','LUGAR DE USO'],
 ['1','1500','Und','TUBERIA PVC SAP 3/4"','-','OBRA'],['2','20','Galon','PEGAMENTO','OATEY','OBRA'],['8','1,000','Und','CONECTOR PVC','-','OBRA'],['AUTORIZADO:'],['SOLICITANTE','JEFE DE ALMACEN']
]));
assert.equal(r.rows.length,3);assert.deepEqual(r.rows.map(r=>r.quantity),[1500,20,1000]);assert.equal(r.rows[1].query,'PEGAMENTO · OATEY');assert.equal(r.rows[0].unit,'Und');
assert.equal(D.excelRows(sheet([['cantidad','producto','unidad'],['3','Cemento','bolsas']])).rows[0].quantity,3);
assert.equal(D.excelRows(sheet([['Formato desconocido'],['1','20','Cemento']])).rows.length,0);
assert.equal(D.excelRows(sheet([['Formato desconocido']])).warnings.length,1);
assert.equal(D.quantity('1.500,25'),1500.25);assert.equal(D.quantity('1,500.25'),1500.25);assert.equal(D.quantity('2 gal'), '');
const item=(str,x,y,width=8)=>({str,transform:[1,0,0,1,x,y],width});
const head=[item('ITEM',66,700),item('FRENTE',300,700,14),item('CANTIDAD',336,700,17),item('UNIDAD MEDIDA',363,700,27)];
const row=(n,y,q,material)=>[item(String(n),68,y,4),item(material,110,y-3,150),item(String(q),344,y-3,4),item('UND',373,y+3),item('BLOQUE A',283,y-3,22)];
r=D.pdfPages([[...head,...row(1,680,23,'SELLADOR DE 1 GAL'),...row(2,665,36,'PLANCHAS DE TECNOPOR 1"')],[...row(3,780,12,'Filtros 3m'),item('1',68,750,4),item('Firmas',110,750)]]);
assert.equal(r.rows.length,3);assert.deepEqual(r.rows.map(r=>r.quantity),[23,36,12]);assert.ok(r.rows.every(r=>r.unit==='UND'&&!r.query.includes('BLOQUE')));
const split=row(1,680,'','Tubo');split.push(item('para agua',110,677,60));
r=D.pdfPages([[...head,...split]]);assert.equal(r.rows[0].quantity,'');assert.match(r.rows[0].query,/para agua/);
assert.equal(D.pdfPages([[item('No hay tabla',100,400)]]).warnings.length,1);
assert.equal(D.excelRows(sheet([['ITEM','CANT','UND','MATERIAL'],...Array.from({length:500},(_,i)=>[i+1,2,'und','Clavos'])])).rows.length,500);
console.log('Document reader: column mapping, quantities, metadata, wrapped rows, page continuation, missing quantities and 500 items passed.');
