/* Local text rules only. Product choices always require customer review. */
(function (root) {
  'use strict';
  const stop = new Set(['de','del','para','con','en','el','la','los','las','un','una','tipo']);
  const aliases = {cementos:'cemento',ladrillos:'ladrillo',cables:'cable',tubos:'tubo',fierros:'fierro',varillas:'fierro',varilla:'fierro',pulgadas:'',pulgada:'',pulg:'',pvc:'pvc',und:'',unidades:'',unidad:'',metros:'',metro:'',mm:'mm'};
  const amount = String.raw`\d+(?:[.,]\d+)?`;
  const units = String.raw`metros?\s+c[úu]bicos?|metros?\s+cuadrados?|m(?:³|²|3|2|\^[23])|millares?|millar|und\.?|unid\.?|unidades?|uds\.?|kg|kilos?|m|metros?|bolsas?|sacos?|rollos?|cajas?|l|litros?|galones?|pzas\.?|piezas?`;
  const namedUnits = `${units}|planchas?|tubos?|tarros?|baldes?|latas?|frascos?|bidones?|paquetes?|barras?|paneles?|hojas?|pares?`;
  function displayLine(value) {
    return String(value).trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/,'')
      .replace(/\*\*|__|`/g,'')
      .replace(/\\(?:text|mathrm)\s*\{([^{}]*)\}/g,'$1')
      .replace(/\\times\b/g,'×')
      .replace(/\^\{?3\}?/g,'³').replace(/\^\{?2\}?/g,'²')
      .replace(/\$([^$]*)\$/g,'$1').replace(/\s+/g,' ').trim();
  }
  function readAmount(raw) {
    return validQuantity(raw.replace(',','.')) && !/[.,]\d{3,}$/.test(raw) ? Number(raw.replace(',','.')) : '';
  }
  function tokens(value) {
    return String(value).replace(/½/g,'1/2').replace(/¾/g,'3/4').replace(/¼/g,'1/4').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/(\d)\s*\/\s*(\d)/g,'$1/$2').replace(/(\d),(\d)/g,'$1.$2').match(/[a-z]+\d*[a-z]*|\d+(?:[/.]\d+)?/g)?.map(t => aliases[t] ?? t).filter(t => t && !stop.has(t)) || [];
  }
  function validQuantity(value) {
    return value !== '' && value !== null && Number.isFinite(Number(value)) && Number(value) >= 0.01 && Number(value) <= 999999 && Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 0.00001;
  }
  function fractionalUnit(unit = '') {
    const name = String(unit).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
    return /^(?:m|m[²³23]|m\^[23]|metros?|metros? (?:cuadrados?|cubicos?)|kg|kilos?|kilogramos?|g|gramos?|t|toneladas?|l|litros?|ml|mililitros?|galon(?:es)?)$/.test(name);
  }
  function validOrderQuantity(value, unit = '') {
    return validQuantity(value) && (fractionalUnit(unit) || Number.isInteger(Number(value)));
  }
  function parseLine(original) {
    let text = displayLine(original);
    let quantity = '';
    let unit = '';
    const prefix = text.match(/^(\d+(?:[.,]\d+)?)\s*(?:[x×]\s*|\s+)(.+)$/i);
    // A named list item separates quantity/presentation from the product query.
    // Parenthetical details remain in the original text for customer review.
    const named = text.match(new RegExp(`^(.+?):\\s*(${amount})\\s*(${namedUnits})?(?:\\s*\\(([^\\n]*)\\))?\\s*$`, 'i'));
    const suffix = text.match(new RegExp(`^(.+?)\\s+(?:[-–]|[x×])\\s*(${amount})\\s*(${namedUnits})(?:\\s*\\(([^\\n]*)\\))?\\s*$`, 'i'));
    if (named || suffix) {
      const match = named || suffix;
      let query = match[1].trim();
      // Pipe diameter is a hard search constraint. Length and packaging remain
      // visible in the original line; missing catalogue specs require review.
      if (tokens(query).includes('tubo') && match[4]) {
        const diameter = match[4].match(/(?:^|\s)(\d+(?:[/.]\d+)?|[½¾¼])\s*(?:pulgadas?\b|["″])/i);
        if (diameter) query += ` ${diameter[1]} pulgada`;
      }
      return {original, query, quantity:readAmount(match[2]), unit:match[3] || '', choice:''};
    }
    if (prefix) {
      quantity = readAmount(prefix[1]);
      text = prefix[2];
    }
    const unitPrefix = text.match(new RegExp(`^(${units})\\s+(?:de\\s+)?(.+)$`, 'i'));
    if (unitPrefix && prefix) { unit = unitPrefix[1]; text = unitPrefix[2]; }
    return {original,query:text.trim(),quantity,unit,choice:''};
  }
  function upgradeDraftRow(row) {
    // Only repair untouched failed rows from the previous parser. Keep user edits.
    const legacyQuery = row.original.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/,'');
    if (row.quantity === '' && !row.unit && !row.choice && (row.query === legacyQuery || row.query === displayLine(row.original))) return parseLine(row.original);
    return row;
  }
  function parse(text) {
    if (text.length > 100000) throw new Error('Tu lista es muy larga. Pega hasta 100 000 caracteres por vez.');
    const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Pega al menos un material para empezar.');
    if (lines.length > 500) throw new Error('Puedes revisar hasta 500 renglones por vez. Divide tu lista en dos partes.');
    return lines.map(parseLine);
  }
  function search(query, products, limit = 6) {
    const requested = [...new Set(tokens(query))];
    // Public pipe titles omit PVC and cold-water qualifiers. Offer candidates
    // by use and exact diameter, without claiming those missing specs match.
    const pipe = requested.includes('tubo');
    const pipeUse = pipe && (requested.includes('agua') || requested.includes('desague'));
    const words = pipeUse ? requested.filter(w=>!['pvc','fria','frio'].includes(w)) : requested;
    if (!words.length) return [];
    const numbers = words.filter(w=>/^\d/.test(w));
    return products.map(product => {
      const haystack = new Set(tokens(`${product.title} ${product.brand} ${product.category}`));
      const title = new Set(tokens(product.title));
      if (pipe && !title.has('tubo')) return null;
      if (pipeUse && words.some(w=>['agua','desague'].includes(w) && !title.has(w))) return null;
      if (pipe && requested.some(w=>['fria','frio'].includes(w)) && title.has('caliente')) return null;
      if (numbers.some(w=>!haystack.has(w))) return null;
      const hits = words.filter(w=>haystack.has(w)).length;
      if (hits / words.length < 0.7) return null;
      return {product,score:hits/words.length*100 + words.filter(w=>tokens(product.title).includes(w)).length};
    }).filter(Boolean).sort((a,b)=>b.score-a.score || a.product.id-b.product.id).slice(0,limit).map(item=>item.product);
  }
  const api = {tokens,validQuantity,fractionalUnit,validOrderQuantity,displayLine,parseLine,parse,search,upgradeDraftRow};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AlbanilListParser = api;
})(globalThis);
