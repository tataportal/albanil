'use strict';
(() => {
  const $ = (selector) => document.querySelector(selector);
  const STORE = 'albanil-propuesta-cotizacion-v1';
  const IMPORT_STORE = 'albanil-cotizacion-renglones-v1';
  const PAGE_SIZE = 24;
  let catalog = null;
  let byId = new Map();
  let quote = {};
  let imported = [];
  let listBuilder = null;
  let requestBuilder = null;
  let service = false;
  let filtered = [];
  let shown = PAGE_SIZE;
  let toastTimer;
  let openingElement = null;
  const buttonTimers = new WeakMap();
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="assets/icons.svg#${name}"></use></svg>`;
  const normalize = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9/]+/g, ' ').trim();
  const validQuantity = (value, unit = '') => AlbanilListParser.validOrderQuantity(value,unit);
  const roundQuantity = (value) => Math.round(Number(value) * 100) / 100;

  function notify(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3200);
  }
  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(quote)); localStorage.setItem(IMPORT_STORE, JSON.stringify(imported)); }
    catch { notify('La lista se mantiene abierta, pero este navegador no permite guardarla.'); }
  }
  function restore() {
    quote = {};
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const [id, quantity] of Object.entries(saved)) {
          if (byId.has(Number(id)) && AlbanilListParser.validQuantity(quantity)) quote[id] = roundQuantity(quantity);
        }
      }
    } catch { quote = {}; }
    try {
      const saved = JSON.parse(localStorage.getItem(IMPORT_STORE) || '[]');
      imported = Array.isArray(saved) ? saved.filter(row=>row && typeof row.id==='string' && typeof row.original==='string' && AlbanilListParser.validQuantity(row.quantity)).map(row=>({id:row.id,original:row.original,query:String(row.query || row.original),unit:String(row.unit || ''),quantity:Number(row.quantity),productId:byId.has(Number(row.productId)) ? Number(row.productId) : null})) : [];
    } catch { imported = []; }
    renderQuote();
  }
  function updateCount() {
    const count = Object.keys(quote).length + imported.length;
    document.querySelectorAll('.quote-count').forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
      el.setAttribute('aria-label', `${count} ${count === 1 ? 'producto' : 'productos'}`);
    });
  }
  function getQuoteSummary() {
    return [...Object.entries(quote).map(([id,quantity])=>({productId:Number(id),title:byId.get(Number(id))?.title || '',quantity,unit:byId.get(Number(id))?.unit||''})), ...imported.map(row=>({productId:row.productId??null,title:byId.get(row.productId)?.title || row.query,quantity:row.quantity,unit:row.unit}))];
  }
  function openDialog(name) {
    const target = $(`#${name}-dialog`);
    openingElement = document.activeElement;
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    target.showModal();
  }
  function closeDialog(dialog) {
    dialog.close();
    if (openingElement?.isConnected) openingElement.focus();
  }
  function addProduct(id, quantity = 1, button = null) {
    if (!byId.has(id) || !validQuantity(quantity,byId.get(id).unit)) return false;
    const amount = roundQuantity(Number(quote[id] || 0) + Number(quantity));
    if (!validQuantity(amount,byId.get(id).unit)) { notify('Revisa la cantidad: el máximo es 999999.'); return false; }
    quote[id] = amount;
    persist();
    renderQuote();
    notify('Producto agregado a tu lista');
    if (button) {
      const previous = `${icon('plus')} Agregar a mi lista`;
      const previousLabel = `Agregar a mi lista: ${byId.get(id).title}`;
      clearTimeout(buttonTimers.get(button));
      button.setAttribute('aria-label', `Agregado: ${byId.get(id).title}`);
      button.innerHTML = `${icon('check')} Agregado`;
      button.classList.add('added');
      buttonTimers.set(button, setTimeout(() => {
        if (button.isConnected) { button.innerHTML = previous; button.setAttribute('aria-label', previousLabel); button.classList.remove('added'); }
      }, 1500));
    }
    return true;
  }
  function productPrice(product) {
    return product.price != null ? `${product.currency==='USD'?'US$':'S/'} ${Number(product.price).toFixed(2)}${product.unit?' / '+escape(product.unit):''}` : 'Precio a cotizar';
  }
  function quantityAttrs(unit='') {
    const fraction=AlbanilListParser.fractionalUnit(unit);
    return `inputmode="${fraction?'decimal':'numeric'}" min="${fraction?0.01:1}" max="999999" step="${fraction?0.01:1}"`;
  }
  function requestItems() {
    return [...Object.entries(quote).map(([id,quantity])=>({productId:Number(id),title:byId.get(Number(id)).title,quantity,unit:byId.get(Number(id)).unit||'',original:''})), ...imported.map(row=>({productId:row.productId,title:byId.get(row.productId)?.title||row.query,quantity:row.quantity,unit:row.unit||byId.get(row.productId)?.unit||'',original:row.original}))];
  }
  function card(product) {
    return `<article class="product-card"><a class="product-image" href="?producto=${product.id}" data-product="${product.id}"><img src="${escape(product.image)}" alt="${escape(product.title)}" width="480" height="480" loading="lazy"></a><div class="product-body"><p class="product-brand">${escape(product.brand || 'Albañil')}</p><h3><a href="?producto=${product.id}" data-product="${product.id}">${escape(product.title)}</a></h3><p class="product-price">${productPrice(product)}</p>${service?`<p class="product-stock">${escape(product.availability)}</p>`:''}<button class="add-button" data-add="${product.id}" aria-label="Agregar a mi lista: ${escape(product.title)}">${icon('plus')} Agregar a mi lista</button></div></article>`;
  }
  function showProduct(id, askQuantity = false) {
    const product = byId.get(id);
    if (!product) { notify('No encontramos ese producto en la copia del catálogo.'); return; }
    $('#product-detail').innerHTML = `<div class="detail-layout"><div class="detail-image"><img src="${escape(product.image)}" alt="${escape(product.title)}" width="480" height="480"></div><div><p class="product-brand">${escape(product.brand || 'Albañil')}</p><h2 id="product-title">${escape(product.title)}</h2><p class="detail-category">${escape(product.category)}</p>${service?`<p class="product-stock">${escape(product.availability)}${product.stock!=null?` · ${escape(product.stock)} ${escape(product.unit)}`:''}</p>`:''}<p class="detail-reference-price">${product.price != null ? `${productPrice(product)} <span>IGV: ${product.tax==='incluido'?'incluido':product.tax==='no_incluido'?'no incluido':'por confirmar'}</span>` : product.referencePriceCents ? `S/ ${(product.referencePriceCents/100).toFixed(2)} <span>Precio de referencia · copia del 8 sep. 2026</span>` : 'Precio a consultar'}</p>${product.specifications ? `<p class="detail-specifications">${escape(product.specifications)}</p>` : ''}<p class="detail-note">La unidad de venta y el precio final se confirman con la tienda. Agrega la cantidad que necesitas. La tienda confirmará precio, presentación y disponibilidad.</p><form id="detail-form" data-id="${id}"><label for="detail-quantity">Cantidad a agregar${product.unit?' ('+escape(product.unit)+')':' (entera)'}</label><input class="quantity-input" id="detail-quantity" name="quantity" type="number" ${quantityAttrs(product.unit)} value="1" required><button class="primary-button" type="submit">${icon('plus')} Agregar a mi lista</button></form></div></div>`;
    openDialog('product');
    if (askQuantity) { $('#detail-quantity').focus(); $('#detail-quantity').select(); }
  }
  function renderQuote() {
    const entries = Object.entries(quote).filter(([id]) => byId.has(Number(id)));
    $('#quote-items').innerHTML = entries.map(([id, quantity]) => {
      const product = byId.get(Number(id));
      return `<article class="quote-item"><img src="${escape(product.image)}" alt="${escape(product.title)}" width="70" height="70"><div><h3>${escape(product.title)}</h3><label for="quantity-${id}">Cantidad <input id="quantity-${id}" data-quantity="${id}" aria-label="Cantidad de ${escape(product.title)}" type="number" ${quantityAttrs(product.unit)} value="${quantity}" required></label></div><button class="icon-button" data-remove="${id}" aria-label="Quitar ${escape(product.title)}">${icon('trash')}</button></article>`;
    }).join('');
    $('#quote-imports').innerHTML = imported.map(row => {
      const product = byId.get(row.productId);
      const title = product?.title || row.query;
      return `<article class="quote-item imported-item">${product?`<img src="${escape(product.image)}" alt="${escape(title)}" width="70" height="70">`:`<span class="pending-image">${icon('clipboard-list')}</span>`}<div>${!product?'<span class="pending-label">Pendiente de identificar</span>':''}<h3>${escape(title)}</h3><p class="import-original">Tu texto: ${escape(AlbanilListParser.displayLine(row.original))}</p><label for="import-${escape(row.id)}">Cantidad${row.unit?' ('+escape(row.unit)+')':''} <input id="import-${escape(row.id)}" data-import-quantity="${escape(row.id)}" aria-label="Cantidad de ${escape(title)}" type="number" inputmode="${AlbanilListParser.fractionalUnit(row.unit)?'decimal':'numeric'}" min="${AlbanilListParser.fractionalUnit(row.unit)?0.01:1}" max="999999" step="${AlbanilListParser.fractionalUnit(row.unit)?0.01:1}" value="${row.quantity}" required></label></div><button class="icon-button" data-remove-import="${escape(row.id)}" aria-label="Quitar renglón: ${escape(title)}">${icon('trash')}</button></article>`;
    }).join('');
    $('#quote-empty').hidden = entries.length + imported.length > 0;
    $('#quote-footer').hidden = entries.length + imported.length === 0;
    $('#quote-review').hidden = true;
    $('#review-quote').hidden = false;
    updateCount();
    listBuilder?.summary(); requestBuilder?.render();
  }
  function renderResults() {
    $('#results').innerHTML = filtered.slice(0, shown).map(card).join('');
    const displayed = Math.min(shown, filtered.length);
    const remaining = filtered.length - displayed;
    const next = Math.min(PAGE_SIZE, remaining);
    $('#load-more').hidden = remaining === 0;
    $('#load-more').textContent = `Ver ${next} ${next === 1 ? 'producto más' : 'productos más'}`;
    $('#catalog-progress').hidden = filtered.length === 0;
    $('#catalog-progress').textContent = remaining
      ? `Mostrando ${displayed} de ${filtered.length} productos · ${remaining === 1 ? 'Queda 1 por ver' : `Quedan ${remaining} por ver`}`
      : `Mostrando ${displayed} de ${filtered.length} ${filtered.length === 1 ? 'producto' : 'productos'}`;
    $('#empty-search').hidden = filtered.length > 0;
    const categoryOnly = new URLSearchParams(location.search).has('categoria') && !new URLSearchParams(location.search).get('q');
    $('#empty-search h2').textContent = categoryOnly ? 'Aún no hay productos para mostrar.' : 'No encontramos ese producto.';
    $('#empty-search p').textContent = categoryOnly ? 'Puedes seguir explorando las otras categorías del catálogo.' : 'Prueba con menos palabras, otra medida o el nombre de la marca.';
    $('#result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'producto encontrado' : 'productos encontrados'}`;
  }
  function updateCategoryScroll() {
    const strip = $('#category-chips');
    $('#categories-prev').disabled = strip.scrollLeft <= 1;
    $('#categories-next').disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  }
  function renderCategoryChips(params, scope, matches) {
    const selected = params.get('categoria') || '';
    const matchedTypes = new Set(matches.map((product) => product.category));
    const choices = catalog.categories.filter((item) => (!scope || scope.includes(item.name)) && (!params.get('q') || matchedTypes.has(item.name) || item.name === selected));
    const strip = $('#category-chips');
    const previousScroll = strip.scrollLeft;
    const chip = (name, label) => {
      const target = new URLSearchParams(params);
      target.delete('producto');
      if (name) target.set('categoria', name); else target.delete('categoria');
      if (![...target.keys()].length) target.set('ver', 'todo');
      return `<a class="category-chip" href="?${escape(target.toString())}"${selected === name ? ' aria-current="true"' : ''}>${escape(label)}</a>`;
    };
    strip.innerHTML = chip('', 'Todas') + choices.map((item) => chip(item.name, item.name.charAt(0) + item.name.slice(1).toLowerCase().replace(' - epp', ' - EPP'))).join('');
    strip.scrollLeft = previousScroll;
    const active = strip.querySelector('[aria-current]');
    if (active) {
      const delta = active.getBoundingClientRect().left - strip.getBoundingClientRect().left;
      if (delta < 0) strip.scrollLeft += delta;
      else if (delta + active.offsetWidth > strip.clientWidth) strip.scrollLeft += delta + active.offsetWidth - strip.clientWidth;
    }
    updateCategoryScroll();
  }
  function renderRoute(focus = false) {
    if (!catalog) return;
    const params = new URLSearchParams(location.search);
    const query = params.get('q') || '';
    const group = params.get('rubro') || '';
    const category = params.get('categoria') || '';
    const sector = catalog.sectors.find((item) => item.id === params.get('sector'));
    const isRequest = false; // Legacy URLs use the same list builder.
    const isList = params.has('lista') || params.has('solicitud');
    const isCatalog = !isRequest && !isList && (params.has('q') || params.has('rubro') || params.has('categoria') || params.has('sector') || params.has('ver'));
    $('#home-content').hidden = isCatalog || isList || isRequest;
    $('#request-view').hidden = !isRequest;
    $('#catalog-view').hidden = !isCatalog;
    $('#list-view').hidden = !isList;
    $('#search-input').value = query;
    $('#sort-filter').value = params.get('orden') === 'nombre' ? 'name' : 'relevance';
    if (isRequest) {
      requestBuilder?.render(); document.title='Solicitud de cotización | Albañil';
      if(focus){$('#request-page-title').focus({preventScroll:true});$('#request-view').scrollIntoView({behavior:'instant'});}
    } else if (isCatalog) {
      const terms = normalize(query).split(/\s+/).filter(Boolean);
      const matches = catalog.products.filter((p) => (!group || p.group === group) && (!sector || sector.types.includes(p.category)) && terms.every((word) => p.search.includes(word)));
      filtered = matches.filter((p) => !category || p.category === category);
      renderCategoryChips(params, sector?.types || catalog.groups.find((item) => item.id === group)?.types, matches);
      if (params.get('orden') === 'nombre') filtered.sort((a, b) => a.title.localeCompare(b.title, 'es'));
      const name = catalog.groups.find((g) => g.id === group)?.name;
      const title = query ? `Resultados para “${query}”` : sector?.name || name || (category ? category.charAt(0) + category.slice(1).toLowerCase() : 'Todo el catálogo');
      $('#catalog-title').textContent = title;
      document.title = `${title} | Albañil`;
      shown = PAGE_SIZE;
      renderResults();
      if (focus) { $('#catalog-title').focus({preventScroll:true}); $('#catalog-view').scrollIntoView({behavior:'instant'}); }
    } else if (isList) {
      document.title = 'Arma tu lista | Albañil';
      listBuilder?.show(params.get('modo'));
      if (focus) { $('#list-title').focus({preventScroll:true}); $('#list-view').scrollIntoView({behavior:'instant'}); }
    } else {
      document.title = 'Albañil | Materiales para tu obra';
    }
    if (params.has('producto')) showProduct(Number(params.get('producto')));
  }
  function navigate(search, focus = true) {
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    history.pushState({}, '', `${location.pathname}${search}`);
    renderRoute(focus);
  }
  function setFilter(key, value) {
    const params = new URLSearchParams(location.search);
    params.delete('producto');
    if (value) params.set(key, value); else params.delete(key);
    if (![...params.keys()].length) params.set('ver', 'todo');
    navigate(`?${params}`);
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('button,a');
    if (!trigger || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (trigger.hasAttribute('data-close')) { closeDialog(trigger.closest('dialog')); return; }
    if (trigger.dataset.open) { openDialog(trigger.dataset.open); return; }
    if (trigger.dataset.product) {
      if (!catalog) return;
      event.preventDefault(); showProduct(Number(trigger.dataset.product)); return;
    }
    if (trigger.dataset.add) { showProduct(Number(trigger.dataset.add), true); return; }
    if (trigger.dataset.removeImport) {
      imported = imported.filter(row=>row.id!==trigger.dataset.removeImport); persist(); renderQuote();
      $('#quote-dialog [data-close]').focus(); return;
    }
    if (trigger.dataset.remove) {
      delete quote[trigger.dataset.remove]; persist(); renderQuote();
      $('#quote-dialog [data-close]').focus(); return;
    }
    if (trigger.tagName === 'A' && trigger.getAttribute('href')?.startsWith('?') && catalog) {
      event.preventDefault();
      const categoryChip = trigger.classList.contains('category-chip');
      navigate(trigger.getAttribute('href'), !categoryChip);
      if (categoryChip) $('#category-chips [aria-current]')?.focus({preventScroll:true});
    }
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'search-form') {
      event.preventDefault();
      const query = $('#search-input').value.trim();
      if (!catalog) { notify('El catálogo todavía está cargando. Inténtalo en un momento.'); return; }
      navigate(query ? `?q=${encodeURIComponent(query)}` : '?ver=todo');
    }
    if (event.target.id === 'detail-form') {
      event.preventDefault();
      if (!event.target.reportValidity()) return;
      if (addProduct(Number(event.target.dataset.id), Number($('#detail-quantity').value))) closeDialog($('#product-dialog'));
    }
  });
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (input.dataset.quantity) {
      if (!input.checkValidity() || !validQuantity(input.value,byId.get(Number(input.dataset.quantity))?.unit)) {
        input.reportValidity(); input.value = quote[input.dataset.quantity]; return;
      }
      quote[input.dataset.quantity] = roundQuantity(input.value);
      persist();
      $('#quote-review').hidden = true;
      $('#review-quote').hidden = false;
      listBuilder?.summary(); requestBuilder?.render();
    }
    if (input.dataset.importQuantity) {
      const row=imported.find(item=>item.id===input.dataset.importQuantity);
      if (!row) return;
      if (!input.checkValidity() || !AlbanilListParser.validOrderQuantity(input.value,row.unit)) { input.reportValidity(); input.value=row.quantity; return; }
      row.quantity=roundQuantity(input.value); persist(); listBuilder?.summary(); requestBuilder?.render();
      $('#quote-review').hidden = true; $('#review-quote').hidden = false;
    }
  });
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
    });
  });
  // Missing captured images remain explicit; never substitute another product.
  document.addEventListener('error', (event) => {
    if (event.target.tagName === 'IMG' && !event.target.src.endsWith('/missing-image.svg')) event.target.src = '../missing-image.svg';
  }, true);
  $('#category-chips').addEventListener('scroll', updateCategoryScroll, {passive:true});
  new ResizeObserver(updateCategoryScroll).observe($('#category-chips'));
  for (const [id, direction] of [['categories-prev', -1], ['categories-next', 1]]) {
    $(`#${id}`).addEventListener('click', () => {
      const strip = $('#category-chips');
      strip.scrollBy({left: direction * strip.clientWidth * 0.75, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    });
  }
  $('#sort-filter').addEventListener('change', (event) => setFilter('orden', event.target.value === 'name' ? 'nombre' : ''));
  $('#load-more').addEventListener('click', () => {
    const previous = shown;
    shown += PAGE_SIZE; renderResults();
    $('#results').children[previous]?.querySelector('a')?.focus({preventScroll:true});
  });
  function checkQuoteQuantities() {
    const invalid = [...document.querySelectorAll('#quote-items input, #quote-imports input')].find(input=>!input.checkValidity());
    if (!invalid) return true;
    $('#quote-review').hidden = true; $('#review-quote').hidden = false;
    notify('Corrige la cantidad: usa enteros para productos por unidad y decimales solo para medidas.');
    invalid.focus(); invalid.reportValidity(); return false;
  }
  $('#review-quote').setAttribute('data-intake-prepare','');
  $('#download-quote').addEventListener('click', () => {
    if (!checkQuoteQuantities()) return;
    const lines = Object.entries(quote).map(([id, quantity]) => `${quantity} × ${byId.get(Number(id)).title} | Marca: ${byId.get(Number(id)).brand || 'Por confirmar'} | Ref. ${id}`);
    lines.push(...imported.map(row=>`${row.quantity}${row.unit?' '+row.unit:''} × ${byId.get(row.productId)?.title || row.query} | ${row.productId?'Ref. '+row.productId:'PENDIENTE DE IDENTIFICAR'}\n  Texto original: ${row.original}`));
    const content = ['ALBAÑIL | LISTA DE PRUEBA', 'No enviada a la tienda. Precios, presentación y disponibilidad por confirmar.', '', ...lines, '', 'Flete: por calcular según destino, cantidad y condiciones de entrega. No incluido en los precios de referencia.'].join('\n');
    const url = URL.createObjectURL(new Blob([content], {type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'albanil-lista-de-prueba.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  window.addEventListener('popstate', () => {
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
    renderRoute();
  });
  window.addEventListener('storage', (event) => {
    if (catalog && (event.key === STORE || event.key === IMPORT_STORE)) restore();
  });
  async function loadCatalog() {
    $('#load-error').hidden = true;
    document.querySelectorAll('[data-add]').forEach((button) => { button.disabled = true; });
    try {
      service = ['127.0.0.1','localhost'].includes(location.hostname) && ['8092','8098'].includes(location.port);
      const response = await fetch(service?'/api/catalog':'catalog.json', {cache:'no-store'});
      if (!response.ok) throw new Error('Catalog unavailable');
      const data = await response.json();
      if (!Array.isArray(data.products) || !Array.isArray(data.groups) || !Array.isArray(data.categories) || !Array.isArray(data.sectors)) throw new Error('Invalid catalog');
      catalog = data;
      catalog.products.forEach((p) => { p.search = normalize(`${p.title} ${p.brand} ${p.category}`); });
      byId = new Map(catalog.products.map((p) => [p.id, p]));
      if (!listBuilder) listBuilder = createAlbanilListBuilder({products:catalog.products,addProduct,escape,notify,getSummary:getQuoteSummary,addImported(rows){imported.push(...rows);persist();renderQuote();}});
      if(!requestBuilder)requestBuilder=createAlbanilRequest({getItems:requestItems,service,escape,notify});
      if(service && !document.querySelector('.featured-group'))document.querySelectorAll('.featured-slide').forEach((slide,index)=>{slide.innerHTML=catalog.featured.slice(index*6,index*6+6).map(id=>card(byId.get(id))).join('');});
      window.AlbanilIntakeBridge = {summary:getQuoteSummary,draft:()=>listBuilder.draft(),products:catalog.products};
      restore(); renderRoute();
      document.querySelectorAll('[data-add]').forEach((button) => { button.disabled = false; });
    } catch {
      $('#load-error').hidden = false;
    }
  }
  $('#retry-catalog').addEventListener('click', loadCatalog);
  $('#theme-toggle').addEventListener('click', (event) => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    event.target.setAttribute('aria-pressed', String(dark));
    event.target.textContent = dark ? 'Tema claro' : 'Tema oscuro';
  });
  loadCatalog();
})();
