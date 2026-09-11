/* USD is the stored currency; PEN is the customer-facing converted amount. */
(function(root){
 const demoKey='albanil-fx-preview-v1';
 const validRate=v=>v!==null&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v))&&Number(v)>0&&Number(v)<=100&&Math.abs(Number(v)*10000-Math.round(Number(v)*10000))<0.000001;
 function pen(p,rate){
  if(p.price==null||p.price===''||!Number.isFinite(Number(p.price)))return null;
  const cents=Math.round(Number(p.price)*100);
  if(p.currency!=='USD')return cents/100;
  if(!validRate(rate))return null;
  return Math.round(cents*Math.round(Number(rate)*10000)/10000)/100;
 }
 const apply=(p,rate)=>({...p,pricePEN:pen(p,rate),exchangeRate:p.currency==='USD'&&validRate(rate)?Number(rate):null});
 const label=p=>p.pricePEN==null?'Precio a consultar':`S/ ${Number(p.pricePEN).toFixed(2)}`;
 const api={validRate,pen,apply,label,demoKey};
 if(typeof module!=='undefined')module.exports=api;else root.AlbanilPricing=api;
})(typeof window!=='undefined'?window:this);
