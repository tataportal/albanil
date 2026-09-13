export const units = new Set(['unidad','par','caja','bolsa','rollo','tubo','plancha','tarro','millar','metro','kg','litro','m2','m3','varilla','envase','saco','hoja','cartucho','lata','galon','juego']);
export async function catalog(env) {
  const response=await fetch('https://tataportal.github.io/albanil/propuesta/catalog.json');
  if(!response.ok)throw Error('Catálogo no disponible');
  const data=await response.json();
  const saved=await env.DB.prepare('SELECT id,data,version FROM product_overrides').all();
  const edits=new Map(saved.results.map(row=>[row.id,{...JSON.parse(row.data),version:row.version}]));
  data.products=data.products.map(p=>({...p,version:0,...edits.get(p.id)}));
  data.exchangeRate=await env.DB.prepare('SELECT rate,version,updated_at FROM exchange_rate WHERE id=1').first();
  return data;
}
export async function editProduct(request,env,id,json) {
 const value=await request.json(),data=await catalog(env),current=data.products.find(p=>p.id===id);
 if(!current)return json({error:'Producto no encontrado.'},404);
 if(!Number.isSafeInteger(value.version)||value.version!==current.version)return json({error:'El producto cambió. Actualiza el panel antes de guardar.'},409);
 const price=value.price===''?null:Number(value.price),stock=value.stock===''?null:Number(value.stock);
 if(!units.has(value.unit)||!['PEN','USD'].includes(value.currency)||!['incluido','no_incluido','confirmar'].includes(value.tax)||typeof value.sku!=='string'||value.sku.length>80||price!==null&&(!Number.isFinite(price)||price<=0||price>999999)||stock!==null&&(!Number.isFinite(stock)||stock<0||stock>999999||!['metro','kg','litro','m2','m3'].includes(value.unit)&&!Number.isInteger(stock)))return json({error:'Revisa unidad, precio y existencias.'},400);
 const update={sku:value.sku,unit:value.unit,price,stock,currency:value.currency,tax:value.tax,availability:stock===null?'Por confirmar':stock>0?'Disponible':'Agotado',dataUpdatedAt:new Date().toISOString()};
 const result=await env.DB.prepare('INSERT INTO product_overrides(id,data,version) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=product_overrides.version+1 WHERE product_overrides.version=? RETURNING version').bind(id,JSON.stringify(update),value.version).first();
 if(!result)return json({error:'Otro usuario modificó el producto. Actualiza el panel.'},409);
 return json({...current,...update,version:result.version});
}
