/* Read document tables without flattening item numbers into quantities. No OCR. */
(function(root){
 'use strict';
 const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
 const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.:]/g,'');
 const footer=v=>/^(autorizado|solicitante|solicitado por|firma|observaciones generales|recomendaciones|notas|total|subtotal|gerencia|residente de obra|jefe de|aprobado|condiciones)\b/.test(norm(v));
 function quantity(v){
  let s=clean(v).replace(/\s/g,'');
  if(/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s))s=s.replace(/,/g,'');
  else if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
  else s=s.replace(',','.');
  return /^\d+(\.\d{1,2})?$/.test(s)&&Number(s)>0&&Number(s)<=999999?Number(s):'';
 }
 function header(row){
  const n=row.map(norm),find=re=>n.findIndex(v=>re.test(v));
  const qty=find(/^(cantidad(?: solicitada)?|cant|qty)$/),unit=find(/^(unidad(?: de medida| medida)?|und|unid|u\s*m|um)$/),index=find(/^(item|n[°ºo]?|numero|nro)$/);
  let desc=find(/^(insumo(?:\s*\/\s*servicio)?|producto|material|articulo|nombre(?: del producto)?)s?$/);
  if(desc<0)desc=find(/^(descripcion|detalle)(?:\b.*)?$/);
  if(desc<0||qty<0)return null;
  const extra=n.map((v,i)=>i!==desc&&/^(descripcion|marca|detalle)(?:\b.*)?$/.test(v)?i:-1).filter(i=>i>=0);
  return {desc,qty,unit,index,extra};
 }
 function excelRows(sheets){
  const rows=[],warnings=[];
  for(const sheet of sheets){let map=null,recognized=false;
   for(let i=0;i<sheet.rows.length;i++){
    const cells=sheet.rows[i].map(clean);if(!cells.some(Boolean))continue;
    const h=header(cells);if(h){map=h;recognized=true;continue;}
    if(!map)continue;
    if(cells.some(footer)){map=null;continue;}
    const description=cells[map.desc]||'';
    if(!/[a-záéíóúñ]/i.test(description))continue;
    if(map.index>=0&&!/^\d+[.)]?$/.test(cells[map.index])){warnings.push(`${sheet.name}, fila ${i+1}: revisar en el original.`);continue;}
    const details=map.extra.map(j=>cells[j]).filter(v=>v&&!/^[-—]+$/.test(v));
    rows.push({query:[description,...details].join(' · '),quantity:quantity(cells[map.qty]),unit:map.unit>=0?cells[map.unit]:'',original:cells.join(' | '),location:`${sheet.name}, fila ${i+1}`});
   }
   if(!recognized)warnings.push(`${sheet.name}: no se reconocieron las columnas; revisar el original.`);
  }
  return {rows,warnings};
 }
 const center=i=>i.x+i.w/2;
 function pdfPages(pages){
  const rows=[],warnings=[];let columns=null,lastIndex=0;
  for(let p=0;p<pages.length;p++){
   const items=pages[p].filter(i=>clean(i.str)).map(i=>({text:clean(i.str),x:i.transform[4],y:i.transform[5],w:i.width||0}));
   const ih=items.find(i=>/^item$/i.test(i.text));
   const qh=ih&&items.find(i=>Math.abs(i.y-ih.y)<8&&/^(cantidad|cant\.?)$/i.test(i.text));
   const uh=ih&&items.find(i=>Math.abs(i.y-ih.y)<8&&/^unidad|^und\.?$/i.test(i.text));
   if(ih&&qh&&uh){
    const heads=items.filter(i=>Math.abs(i.y-ih.y)<8),dh=heads.find(i=>/^(descripcion|material|producto|insumo|detalle)/i.test(i.text));
    const front=heads.find(i=>/^frente$/i.test(i.text));
    const before=front||dh;
    columns={index:center(ih),headerY:ih.y,descStart:ih.x+ih.w+3,descEnd:front?front.x-(qh.x-front.x)*.65:(center(qh)-(center(qh)-(dh?center(dh):center(ih)))*.18),qtyStart:before?(center(before)+center(qh))/2:qh.x-5,qtyEnd:(center(qh)+center(uh))/2,unitEnd:uh.x+uh.w+3};
    if(front)columns.qtyStart=(center(front)+center(qh))/2;
   }
   if(!columns){warnings.push(`Página ${p+1}: revisar el original; no se reconoció la tabla.`);continue;}
   const c=columns;
   const candidates=items.filter(i=>Math.abs(center(i)-c.index)<8&&/^\d{1,4}$/.test(i.text)&&(!(ih&&qh&&uh)||i.y<ih.y-5)).sort((a,b)=>b.y-a.y);
   const anchors=[];
   for(const item of candidates){const n=Number(item.text);if(n<=lastIndex){if(anchors.length)break;continue;}anchors.push(item);lastIndex=n;}
   if(!anchors.length){warnings.push(`Página ${p+1}: revisar el original; no se identificaron ítems.`);continue;}
   const gaps=anchors.slice(1).map((a,i)=>anchors[i].y-a.y).sort((a,b)=>a-b),gap=gaps[Math.floor(gaps.length/2)]||16;
   for(let j=0;j<anchors.length;j++){
    const a=anchors[j],top=j?(anchors[j-1].y+a.y)/2:a.y+gap/2,bottom=j<anchors.length-1?(a.y+anchors[j+1].y)/2:a.y-gap/2;
    const band=items.filter(i=>i.y<=top&&i.y>bottom&&center(i)>c.descStart);
    const join=xs=>xs.sort((a,b)=>Math.abs(a.y-b.y)>2?b.y-a.y:a.x-b.x).map(i=>i.text).join(' ');
    const description=join(band.filter(i=>center(i)<c.descEnd));
    const extra=join(band.filter(i=>i.x>=c.unitEnd&&!footer(i.text)));
    const query=[description,extra].filter(Boolean).join(' · ');
    if(!/[a-záéíóúñ]/i.test(query)){warnings.push(`Página ${p+1}, ítem ${a.text}: revisar el original.`);continue;}
    const qtyText=join(band.filter(i=>center(i)>=c.qtyStart&&center(i)<c.qtyEnd));
    const unit=join(band.filter(i=>center(i)>=c.qtyEnd&&center(i)<c.unitEnd));
    rows.push({query,quantity:quantity(qtyText),unit,original:join(band),location:`Página ${p+1}, ítem ${a.text}`});
   }
  }
  return {rows,warnings};
 }
 const api={excelRows,pdfPages,quantity};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AlbanilDocumentReader=api;
})(globalThis);
