"""Build a public-only catalogue for the isolated home proposal.

Reads the existing sanitized HTML. It never reads PHP, SQL or private manifests.
Run: python3 scripts/build-home.py
"""
from pathlib import Path
import html
import json
import re
import subprocess
import hashlib
from html.parser import HTMLParser
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
OUT = DOCS / 'propuesta'
# Preserve the public menu's category names and order; rubros are editorial only.
class CategoryMenu(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current = None
        self.categories = {}
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and re.fullmatch(r'categoria-\d+\.html', attrs.get('href', '')):
            self.current = {'url': attrs['href'], 'parts': []}
    def handle_data(self, data):
        if self.current is not None:
            self.current['parts'].append(data)
    def handle_endtag(self, tag):
        if tag == 'a' and self.current is not None:
            url = self.current['url']
            self.categories.setdefault(url, {'id': int(re.search(r'\d+', url)[0]), 'name': ' '.join(' '.join(self.current['parts']).split()), 'url': url})
            self.current = None

menu = CategoryMenu()
menu.feed((ROOT/'scripts/original-home.html').read_text())
CATEGORIES = list(menu.categories.values())
CATEGORY_ICONS = {2:'fence',1:'wall',16:'plug',7:'bucket-droplet',12:'pipeline',11:'lamp-2',25:'bath',8:'cylinder',5:'plug-connected',3:'paper-bag',10:'box',15:'shield-check',19:'bulb',17:'droplet',6:'tools',27:'disc',23:'wood',18:'paint',9:'circuit-ground',13:'building-warehouse',14:'layers-subtract',4:'pipeline'}
for category in CATEGORIES:
    category['icon'] = CATEGORY_ICONS[category['id']]
GROUPS = [
    {'id':'construccion', 'name':'Construcción', 'icon':'wall', 'types':['FIERROS Y ALAMBRES','LADRILLOS','CEMENTO Y SIMILARES','DADOS DE CONCRETO']},
    {'id':'electricidad', 'name':'Electricidad', 'icon':'bolt', 'types':['ACCESORIOS ELÉCTRICOS','CABLES','POZO A TIERRA / SOLDADURA EXOTÉRMICA']},
    {'id':'gasfiteria', 'name':'Gasfitería', 'icon':'droplet', 'types':['TUBOS Y CONEXIONES','BOMBAS Y TANQUES','AGUA Y ALCANTARILLADO','GRIFERIAS','BAÑOS Y ACCESORIOS','ACCESORIOS DE COCINA']},
    {'id':'herramientas', 'name':'Herramientas', 'icon':'tools', 'types':['HERRAMIENTAS','LIJAS Y ABRASIVOS']},
    {'id':'seguridad', 'name':'Seguridad y EPP', 'icon':'shield-check', 'types':['EQUIPO DE PROTECCION PERSONAL - EPP']},
    {'id':'aditivos', 'name':'Aditivos y selladores', 'icon':'bucket-droplet', 'types':['ADITIVOS']},
    {'id':'techos', 'name':'Techos y aislantes', 'icon':'building-warehouse', 'types':['TECHOS','TECNOPOR']},
    {'id':'iluminacion', 'name':'Iluminación', 'icon':'bulb', 'types':['ALUMBRADO PUBLICO','FOCOS Y PANELES']},
]
FEATURED = [375,348,257,137,4,601,35,43,141,166,376,583,579,586,597,599,633,593]
SECTORS = [
    {'id':'construccion', 'name':'Construcción', 'icon':'wall', 'description':'Materiales para cada etapa de tu obra.', 'types':['FIERROS Y ALAMBRES','LADRILLOS','CEMENTO Y SIMILARES','DADOS DE CONCRETO','ADITIVOS','TECHOS','TECNOPOR']},
    {'id':'mineria', 'name':'Minería', 'icon':'pick', 'description':'Protección personal, herramientas y suministros.', 'types':['EQUIPO DE PROTECCION PERSONAL - EPP','HERRAMIENTAS','LIJAS Y ABRASIVOS','CABLES','BOMBAS Y TANQUES','POZO A TIERRA / SOLDADURA EXOTÉRMICA']},
    {'id':'industria', 'name':'Industria', 'icon':'building-factory-2', 'description':'Electricidad y materiales para mantenimiento.', 'types':['ACCESORIOS ELÉCTRICOS','CABLES','HERRAMIENTAS','LIJAS Y ABRASIVOS','ADITIVOS','EQUIPO DE PROTECCION PERSONAL - EPP']},
    {'id':'hogar', 'name':'Hogar', 'icon':'home', 'description':'Instala, repara y renueva tus espacios.', 'types':['BAÑOS Y ACCESORIOS','GRIFERIAS','ACCESORIOS DE COCINA','FOCOS Y PANELES','TUBOS Y CONEXIONES','HERRAMIENTAS','PINTURAS']},
]
products=[]
for source in json.loads((DOCS/'catalog.json').read_text()):
    body=(DOCS/source['url']).read_text()
    def field(name):
        match=re.search(name+r'\s*:\s*([^<]+)',body)
        return html.unescape(match[1]).strip() if match else ''
    category=field('Tipo')
    group=next((g['id'] for g in GROUPS if category in g['types']),None)
    if not group: raise ValueError(f'Unmapped category: {category}')
    photo=re.search(r'<img[^>]+id="'+str(source['id'])+r'"[^>]+src="([^"]+)"',body)
    image=html.unescape(photo[1]) if photo else 'missing-image.svg'
    if not (DOCS/image).is_file(): image='missing-image.svg'
    title=' '.join(source['title'].split()).capitalize()
    price_match = re.search(r'Precio Online\s*(?:S/\.?\s*)?(\d+(?:\.\d{1,2})?)\s*<', body)
    price = round(float(price_match[1]) * 100) if price_match else 0
    specifications = ' '.join(field('Especificaciones').split())
    if specifications.upper() in ('NO DEFINIDO', 'NO DEFINIDA'): specifications = ''
    delivery_conditions = specifications if re.search(r'flete|trailer|entrega|env[ií]o', specifications, re.I) else ''
    if delivery_conditions: specifications = ''
    products.append({'id':source['id'],'title':title,'brand':field('Marca'), 'category':category,'group':group,'image':'../'+image,'url':'../'+source['url'], 'referencePriceCents':price if price > 0 else None, 'priceSourceDate':'2026-09-08', 'specifications':specifications, 'deliveryConditions':delivery_conditions})
# Display cleanup of known public titles, without adding absent specifications.
titles={375:'Cemento Portland Premium tipo 1',348:'Cable THW90 14',257:'Tubo para agua de 1/2" con rosca',137:'Sikaflex 11FC · 300 ml',4:'Casco 3M · diversos colores',601:'Wincha Truper · 5 m'}
for p in products:
    if p['id'] in titles: p['title']=titles[p['id']]
    if p['id'] in FEATURED:
        original=DOCS/p['image'].removeprefix('../')
        target=OUT/'assets/products'/f"{p['id']}.webp"
        if not target.exists():
            subprocess.run(['cwebp','-quiet','-q','84','-resize','480','0',str(original),'-o',str(target)],check=True)
        small=OUT/'assets/products'/f"{p['id']}-320.webp"
        if not small.exists():
            subprocess.run(['cwebp','-quiet','-q','82','-resize','320','0',str(original),'-o',str(small)],check=True)
        p['image']=f"assets/products/{p['id']}.webp"
        clean=OUT/'assets/products/clean-v2'/f"{p['id']}.webp"
        if clean.exists():
            p['image']=f"assets/products/clean-v2/{p['id']}.webp"
        p['imageSmall']=p['image'].removesuffix('.webp')+'-320.webp'
(OUT/'catalog.json').write_text(json.dumps({'categories':CATEGORIES,'groups':GROUPS,'sectors':SECTORS,'featured':FEATURED,'products':products},ensure_ascii=False,separators=(',',':')))
print(f'Built {len(products)} unique products, {len(CATEGORIES)} original categories, {len(FEATURED)} sample featured products.')

def icon(name):
    return f'<svg class="icon" aria-hidden="true"><use href="assets/icons.svg#{name}"></use></svg>'
def escape(value): return html.escape(str(value),quote=True)
def card(p):
    loading = 'eager' if p['id'] in FEATURED[:2] else 'lazy'
    priority = 'high' if p['id'] == FEATURED[0] else 'auto'
    return f'''<article class="product-card"><a class="product-image" href="?producto={p['id']}" data-product="{p['id']}"><img src="{escape(p['image'])}" alt="{escape(p['title'])}" width="480" height="480" loading="{loading}" fetchpriority="{priority}" srcset="{escape(p['imageSmall'])} 320w, {escape(p['image'])} 480w" sizes="(max-width: 639px) 160px, (max-width: 1023px) 220px, 180px"></a><div class="product-body"><p class="product-brand">{escape(p['brand'] or 'Albañil')}</p><h3><a href="?producto={p['id']}" data-product="{p['id']}">{escape(p['title'])}</a></h3><p class="product-price">Precio a cotizar</p><button class="add-button" data-add="{p['id']}" aria-label="Agregar a mi lista: {escape(p['title'])}">{icon('plus')} Agregar a mi lista</button></div></article>'''
categories=''.join(f'<a class="department" href="?categoria={quote(c["name"], safe="")}">{icon(c["icon"])}<span>{escape(c["name"].capitalize().replace(" - epp", " - EPP"))}</span></a>' for c in CATEGORIES)
sectors=''.join(f'<a class="sector-card" href="?sector={s["id"]}">{icon(s["icon"])}<h3>{escape(s["name"])}</h3><p>{escape(s["description"])}</p><span>Ver productos {icon("arrow-right")}</span></a>' for s in SECTORS)
by_id={p['id']:p for p in products}
# Best sellers supplied by Albañil; images represent groups, not stock claims.
FEATURED_GROUPS = [
 ('Ladrillo 18 huecos',84,'18 huecos'),('Bloqueta H15 × 30',91,'bloqueta h15'),('Fenólicos 18 mm','fenolicos.png',''),
 ('Cemento Andino Tipo 1',375,'cemento andino'),('Amoladoras','amoladoras.jpg',''),('Plásticos','plasticos.jpg',''),
 ('Autoperforantes','autoperforantes.jpg',''),('Paneles LED','paneles.jpg',''),('Soldadura','soldadura.jpg',''),
 ('Guantes',43,'guantes'),('Lijas',617,'lija'),('Tecnopor de 1"',248,'tecnopor de 1"'),
 ('Sikaflex',137,'sikaflex'),('Esmalte anticorrosivo Walon','walon.webp',''),('Spray C&A','spray.jpg',''),
 ('Llave check de 1/2" CIM','check.jpg',''),('Wincha Truper',601,'wincha truper'),('Alambre 16',68,'alambre nro 16')]
def group_card(g):
    title,photo,query=g
    image=by_id[photo]['image'] if isinstance(photo,int) else 'assets/groups/'+photo
    url='?q='+quote(query,safe='') if query else 'https://wa.me/51968406042?text='+quote('Hola, quisiera consultar por '+title+'. ¿Me confirman opciones, precio y disponibilidad?',safe='')
    external='' if query else ' target="_blank" rel="noopener noreferrer"'
    return f'<article class="product-card featured-group"><a class="product-image" href="{escape(url)}"{external}><img src="{escape(image)}" alt="{escape(title)} — foto representativa" width="480" height="480" loading="lazy"></a><div class="product-body"><p class="product-brand">Más vendidos</p><h3><a href="{escape(url)}"{external}>{escape(title)}</a></h3><p class="group-note">Foto referencial · opciones por confirmar</p><a class="secondary-button" href="{escape(url)}"{external}>{'Ver opciones' if query else 'Consultar al asesor'}</a></div></article>'
featured_slides=''.join(f'<div class="product-grid featured-slide{" is-active" if start == 0 else ""}" role="group" aria-roledescription="grupo" aria-label="{start // 6 + 1} de 3"'+('' if start == 0 else ' inert aria-hidden="true"')+'>'+''.join(group_card(g) for g in FEATURED_GROUPS[start:start+6])+'</div>' for start in range(0,18,6))

hero_list=''.join(f'<div class="hero-list-row"><img src="{escape(by_id[i]["imageSmall"])}" width="52" height="52" alt=""><span>{escape(by_id[i]["title"])}</span><strong>{quantity}</strong></div>' for i,quantity in [(375,'10'),(348,'50 m'),(257,'4')])
template=(ROOT/'scripts/home.template.html').read_text()
rendered=template.replace('<!--PRODUCTS-->',featured_slides).replace('<!--CATEGORIES-->',categories).replace('<!--SECTORS-->',sectors).replace('<!--HERO-LIST-->',hero_list)
for asset in ['home.css','home.js','list-parser.js','list-builder.js','request.js','featured-carousel.js','contact.js','intake.js']:
    version=hashlib.sha256((OUT/asset).read_bytes()).hexdigest()[:10]
    rendered=rendered.replace(f'"{asset}"',f'"{asset}?v={version}"')
(OUT/'index.html').write_text(rendered)
