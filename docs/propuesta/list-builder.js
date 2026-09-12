(function (root) {
  'use strict';
  root.createAlbanilListBuilder = function ({products, addProduct, addImported, getSummary, escape, notify}) {
    const $ = s=>document.querySelector(s);
    const parser = root.AlbanilListParser;
    const byId = new Map(products.map(p=>[p.id,p]));
    const STORE = 'albanil-lista-borrador-v1';
    let rows = [];
    let text = '';
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
      text = typeof saved.text === 'string' ? saved.text.slice(0,100000) : '';
      rows = Array.isArray(saved.rows) ? saved.rows.slice(0,500).filter(r=>r && typeof r.original==='string' && typeof r.query==='string').map(r=>({original:r.original,query:r.query,quantity:parser.validQuantity(r.quantity)?Number(r.quantity):'',unit:String(r.unit || '').slice(0,30),choice:r.choice==='pending' || byId.has(Number(r.choice)) ? String(r.choice) : ''})) : [];
      if (saved.version !== 3) rows = rows.map(parser.upgradeDraftRow);
    } catch { /* A malformed saved draft must not block a new list. */ }
    function save() { try { localStorage.setItem(STORE,JSON.stringify({version:3,text,rows})); } catch { notify('Tu borrador sigue abierto, pero no pudimos guardarlo en este navegador.'); } }
    function showError(message) { $('#builder-error').textContent=message; $('#builder-error').hidden=!message; }
    const money = cents => 'S/ ' + (cents/100).toFixed(2);
    const price = p => p.price!=null ? `${AlbanilPricing.label(p)}${p.pricePEN!=null&&p.unit?' / '+escape(p.unit):''}` : p.referencePriceCents?money(p.referencePriceCents):'Precio a consultar';
    function choices(row,index) {
      const found = parser.search(row.query,products);
      const chosen = byId.get(Number(row.choice));
      if (chosen && !found.some(p=>p.id===chosen.id)) found.unshift(chosen);
      const label = found.length ? `${found.length} ${found.length===1?'opción':'opciones'} para comparar` : 'Sin coincidencias en el catálogo';
      const conditions = [...new Set(found.map(p=>p.specifications).filter(Boolean))];
      return `<fieldset class="draft-options" aria-describedby="draft-hint-${index}"><legend>${label}</legend><div class="match-grid">` + found.map(p=>`<div class="match-card"><label class="match-select"><input type="radio" name="draft-choice-${index}" required value="${p.id}"${String(p.id)===row.choice?' checked':''} data-draft-field="choice" data-row="${index}"><img src="${escape(p.image)}" alt="${escape(p.title)}" width="120" height="120" loading="lazy"><span class="match-info"><span class="match-brand">${escape(p.brand || 'Albañil')}</span><strong>${escape(p.title)}</strong><span class="match-price">${price(p)}</span><span class="match-price-label">${p.price!=null ? `IGV ${p.tax==='incluido'?'incluido':p.tax==='no_incluido'?'no incluido':'por confirmar'}` : p.referencePriceCents ? 'Precio de referencia' : 'Sin precio publicado'}${p.availability?` · ${escape(p.availability)}`:''}</span><span class="match-pick"><span class="match-unselected">Elegir producto</span><span class="match-selected">Seleccionado</span></span></span></label><a class="match-detail" href="?producto=${p.id}" data-product="${p.id}">Ver ficha <span class="sr-only">de ${escape(p.title)}</span><span aria-hidden="true">↗</span></a></div>`).join('') + `</div><label class="match-pending"><input type="radio" name="draft-choice-${index}" required value="pending"${row.choice==='pending'?' checked':''} data-draft-field="choice" data-row="${index}">Dejar pendiente para consultar con la tienda</label></fieldset>${found.some(p=>p.referencePriceCents)?'<p class="match-price-note">Precios de la copia del catálogo del 8 sep. 2026, sujetos a confirmación. La unidad de venta no está especificada; no representan el total de tu renglón.</p>':''}${conditions.length?`<details class="match-conditions"><summary>Ver especificaciones publicadas</summary>${conditions.map(c=>`<p>${escape(c)}</p>`).join('')}</details>`:''}`;
    }
    function hint(row) {
      if(row.choice==='pending') return 'Conservaremos el texto original para consultarlo con la tienda.';
      if ((row.choice || parser.search(row.query,products).length) && parser.tokens(row.query).includes('tubo')) return 'Opciones por nombre y diámetro indicado. Confirma material, uso, largo y presentación: la ficha puede no incluir todas las medidas de tu lista.';
      if(row.choice || parser.search(row.query,products).length) return 'Coincidencias por nombre. Confirma medida, marca y presentación; las unidades no se convierten.';
      return 'No encontramos ese material en este catálogo. Puedes cambiar la búsqueda o dejarlo pendiente para consultar.';
    }
    function renderRows() {
      $('#paste-review').hidden = !rows.length;
      $('#draft-count').textContent = `${rows.length} ${rows.length===1?'renglón por revisar':'renglones por revisar'}`;
      $('#draft-rows').innerHTML=rows.map((row,index)=>`<article class="draft-row"><div class="draft-heading"><span class="line-number">${index+1}</span><p>${escape(parser.displayLine(row.original))}</p><button class="icon-button" type="button" data-draft-remove="${index}" aria-label="Quitar renglón ${index+1}"><svg class="icon" aria-hidden="true"><use href="assets/icons.svg#x"></use></svg></button></div><div class="draft-fields"><label for="draft-quantity-${index}">Cantidad<input id="draft-quantity-${index}" type="number" min="${parser.fractionalUnit(row.unit)?0.01:1}" max="999999" step="${parser.fractionalUnit(row.unit)?0.01:1}" inputmode="${parser.fractionalUnit(row.unit)?'decimal':'numeric'}" required value="${escape(row.quantity)}" data-draft-field="quantity" data-row="${index}"></label><label for="draft-unit-${index}">Unidad indicada<input id="draft-unit-${index}" maxlength="30" placeholder="Ej. m, bolsas" value="${escape(row.unit)}" data-draft-field="unit" data-row="${index}"></label><label class="draft-query" for="draft-query-${index}">Buscar coincidencia<input id="draft-query-${index}" value="${escape(row.query)}" maxlength="240" data-draft-field="query" data-row="${index}"></label></div><div class="draft-choice" id="draft-choice-${index}">${choices(row,index)}</div><p class="draft-hint" id="draft-hint-${index}">${hint(row)}</p></article>`).join('');
      $('#add-draft').disabled = !rows.length;
    }
    function summary() {
      const items=getSummary();
      $('#builder-summary-count').textContent=`${items.length} ${items.length===1?'renglón':'renglones'}`;
      $('#builder-summary-empty').hidden=items.length>0;
      $('#builder-summary-items').innerHTML=items.slice(0,5).map(item=>`<li><span>${escape(item.title)}</span><strong>${escape(item.quantity)}${item.unit?' '+escape(item.unit):''}</strong></li>`).join('');
      $('#builder-summary-more').textContent=items.length>5?`Y ${items.length-5} más en tu lista.`:'';
      $('#builder-summary-review').disabled=!items.length;
    }
    $('#paste-list').value=text;
    $('#paste-list').addEventListener('input',()=>{text=$('#paste-list').value; save();});
    $('#paste-form').addEventListener('submit',event=>{
      event.preventDefault(); showError('');
      if (rows.length) { showError('Revisa o descarta los renglones actuales antes de analizar otra lista.'); return; }
      try { text=$('#paste-list').value; rows=parser.parse(text); save(); renderRows(); $('#paste-review-title').focus(); }
      catch(error) { showError(error.message); }
    });
    $('#discard-draft').addEventListener('click',()=>{ rows=[];save();renderRows();showError('');$('#paste-list').focus(); });
    $('#draft-rows').addEventListener('input',event=>{
      const input=event.target;
      const row=rows[Number(input.dataset.row)];
      if (!row || !input.dataset.draftField || input.dataset.draftField==='choice') return;
      const field=input.dataset.draftField;
      row[field]=input.value;
      if(field==='unit') { const quantity=$(`#draft-quantity-${input.dataset.row}`); const fractional=parser.fractionalUnit(row.unit); quantity.min=fractional?'0.01':'1'; quantity.step=fractional?'0.01':'1'; quantity.inputMode=fractional?'decimal':'numeric'; }
      if(field==='query') { row.choice=''; $(`#draft-choice-${input.dataset.row}`).innerHTML=choices(row,Number(input.dataset.row)); $(`#draft-hint-${input.dataset.row}`).textContent=hint(row); }
      save();
    });
    $('#draft-rows').addEventListener('change',event=>{
      if(event.target.dataset.draftField!=='choice') return;
      const index=Number(event.target.dataset.row); rows[index].choice=event.target.value;
      $(`#draft-hint-${index}`).textContent=hint(rows[index]);
      save();
    });
    $('#draft-rows').addEventListener('click',event=>{
      const button=event.target.closest('[data-draft-remove]'); if(!button) return;
      rows.splice(Number(button.dataset.draftRemove),1);save();renderRows();$('#paste-review-title').focus();
    });
    $('#confirm-draft-form').addEventListener('submit',event=>{
      event.preventDefault();showError('');
      if (!rows.length) return;
      const invalid=rows.findIndex(row=>!parser.validOrderQuantity(row.quantity,row.unit) || !row.choice || (row.choice!=='pending' && !byId.has(Number(row.choice))));
      if(invalid!==-1){showError(`Revisa la cantidad y el producto del renglón ${invalid+1}.`);return;}
      addImported(rows.map(row=>({id:crypto.randomUUID(),productId:row.choice==='pending'?null:Number(row.choice),original:row.original,query:row.query,quantity:Number(row.quantity),unit:row.unit.trim()})));
      rows=[];text='';$('#paste-list').value='';save();renderRows();summary();
      notify('Renglones agregados a tu lista.');$('#builder-summary-review').focus();
    });
    function searchManual() {
      const query=$('#builder-search').value.trim();
      if(!query){$('#manual-results').innerHTML='';$('#manual-count').textContent='Busca por producto, marca o medida.';return;}
      const found=parser.search(query,products,12);
      $('#manual-count').textContent=found.length?`${found.length} coincidencias. Revisa el producto y su presentación.`:'No encontramos coincidencias. Prueba otro nombre o deja el material pendiente desde «Pegar mi lista».';
      $('#manual-results').innerHTML=found.map(p=>`<article class="manual-product"><a href="?producto=${p.id}" data-product="${p.id}"><img src="${escape(p.image)}" width="64" height="64" alt="${escape(p.title)}"></a><div><p class="product-brand">${escape(p.brand || 'Albañil')}</p><h3><a href="?producto=${p.id}" data-product="${p.id}">${escape(p.title)}</a></h3><p class="manual-reference">Ref. ${escape(p.reference||p.id)} · ${price(p)}</p></div><div class="manual-add"><label class="sr-only" for="manual-qty-${p.id}">Cantidad de ${escape(p.title)}</label><input id="manual-qty-${p.id}" type="number" min="${parser.fractionalUnit(p.unit)?0.01:1}" max="999999" step="${parser.fractionalUnit(p.unit)?0.01:1}" value="1" inputmode="${parser.fractionalUnit(p.unit)?'decimal':'numeric'}"><button class="secondary-button" type="button" data-manual-add="${p.id}">Agregar</button></div></article>`).join('');
    }
    $('#builder-search-form').addEventListener('submit',event=>{event.preventDefault();searchManual();});
    $('#manual-results').addEventListener('click',event=>{
      const button=event.target.closest('[data-manual-add]');if(!button)return;
      const id=Number(button.dataset.manualAdd),input=$(`#manual-qty-${id}`);
      if(!input.reportValidity() || !parser.validOrderQuantity(input.value,byId.get(id)?.unit))return;
      addProduct(id,Number(input.value));summary();
    });
    $('#parse-list').disabled=false;
    renderRows();summary();
    return {summary,draft:()=>rows.map(row=>({...row})),show(mode){const manual=mode==='buscar';$('#paste-mode').hidden=manual;$('#manual-mode').hidden=!manual;document.querySelectorAll('[data-builder-mode]').forEach(link=>{if(link.dataset.builderMode===(manual?'buscar':'pegar'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});}};
  };
})(globalThis);
