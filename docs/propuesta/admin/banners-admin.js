'use strict';
window.AlbanilBannersAdmin={async refresh(api,user){
 const root=document.querySelector('#banner-cards');root.replaceChildren();if(!user?.permissions.includes('banners'))return;
 const banners=await api('banners');
 const base=window.AlbanilSettings.api.replace(/\/$/,'')+'/';
 for(const [key,banner] of Object.entries(banners)){
  const form=document.createElement('form');form.className='banner-editor';
  const title=document.createElement('h2');title.textContent=banner.label;
  const img=document.createElement('img');img.alt=banner.label;img.src=new URL(banner.url,base).href;
  const detail=document.createElement('p');detail.textContent=`Actual: ${banner.width} × ${banner.height} px`;
  const label=document.createElement('label');label.textContent='Elegir nueva imagen';
  const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.required=true;label.append(input);
  const note=document.createElement('p');note.setAttribute('role','status');
  const button=document.createElement('button');button.type='submit';button.className='primary-button';button.textContent='Guardar banner';button.disabled=true;
  const link=document.createElement('a');link.href=key.startsWith('home')?'../':'../nosotros';link.target='_blank';link.rel='noopener';link.textContent='Ver en la web ↗';
  let photo=null,preview=null;
  input.addEventListener('change',()=>{photo=null;button.disabled=true;note.textContent='';const f=input.files[0];if(!f)return;if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>5*1024*1024){note.textContent='Usa JPG, PNG o WebP de hasta 5 MB.';return;}if(preview)URL.revokeObjectURL(preview);preview=URL.createObjectURL(f);img.src=preview;const reader=new FileReader();reader.onload=()=>{photo=reader.result.split(',')[1];button.disabled=false;note.textContent='Vista previa. Guarda para publicarla.';};reader.onerror=()=>{note.textContent='No se pudo leer la imagen.';};reader.readAsDataURL(f);});
  form.addEventListener('submit',async e=>{e.preventDefault();if(!photo)return;button.disabled=true;input.disabled=true;note.textContent='Guardando…';try{const saved=await api('banners/'+key,{method:'PATCH',body:JSON.stringify({version:banner.version,photo})});Object.assign(banner,saved);img.src=new URL(saved.url,base).href;detail.textContent=`Actual: ${saved.width} × ${saved.height} px`;photo=null;input.value='';note.textContent='Publicado. Ya está disponible en la web.';}catch(e){note.textContent=e.message;}finally{button.disabled=!photo;input.disabled=false;}});
  form.append(title,img,detail,label,note,button,link);root.append(form);
 }
}};
