"""Private local pilot for Albañil. Bind loopback only; deploy behind a reviewed host later.
Database and authentication material live outside docs/ and must never be published.
"""
from contextlib import contextmanager
import base64
import binascii
import io
import zipfile
import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote, quote

ROOT = Path(__file__).resolve().parents[1]
UNITS = {'unidad': False, 'par': False, 'caja': False, 'bolsa': False, 'rollo': False,
         'tubo': False, 'plancha': False, 'tarro': False, 'millar': False,
         'metro': True, 'kg': True, 'litro': True, 'm2': True, 'm3': True}
STATUSES = ('Nueva', 'En atención', 'Cotización parcial', 'Cotizada', 'Terminada', 'Cerrada')

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def text(value, maximum=240, required=False):
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise ValueError('Revisa los campos obligatorios y la longitud del texto.')
    return value.strip()

def number(value, fractional=True, nullable=False, positive=False):
    if nullable and (value is None or value == ''):
        return None
    if isinstance(value, bool):
        raise ValueError('Cantidad o precio inválido.')
    try:
        n = Decimal(str(value))
    except InvalidOperation:
        raise ValueError('Cantidad o precio inválido.')
    if not n.is_finite() or n < (Decimal('0.01') if positive else 0) or n > 999999 or n != n.quantize(Decimal('0.01')) or (not fractional and n != n.to_integral_value()):
        raise ValueError('Usa cantidades válidas; los productos por unidad requieren enteros.')
    return float(n)

def fractional(unit):
    return bool(re.fullmatch(r'(?:m|metros?|m[²³23]|metro[s]? (?:cúbicos?|cuadrados?)|kg|kilos?|kilogramos?|l|litros?|ml|g|gramos?|toneladas?|galones?)', unit.strip().lower()))

class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), rate TEXT, version INTEGER NOT NULL, updated_at TEXT);
                INSERT OR IGNORE INTO settings VALUES(1,NULL,0,NULL);
                CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, sku TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT '', price REAL, currency TEXT NOT NULL DEFAULT 'PEN', tax TEXT NOT NULL DEFAULT 'confirmar', stock REAL, version INTEGER NOT NULL DEFAULT 0, updated_at TEXT);
                CREATE TABLE IF NOT EXISTS requests(reference TEXT PRIMARY KEY, idempotency TEXT UNIQUE NOT NULL, fingerprint TEXT NOT NULL, customer TEXT NOT NULL, items TEXT NOT NULL, status TEXT NOT NULL, agent TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS request_sequence(id INTEGER PRIMARY KEY AUTOINCREMENT);
                CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT NOT NULL REFERENCES requests(reference), name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL);
                CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, entity TEXT NOT NULL, entity_id TEXT NOT NULL, actor TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL, created_at TEXT NOT NULL);
            ''')
        os.chmod(path, 0o600)
        self.catalog = json.loads((ROOT/'docs/propuesta/catalog.json').read_text())
        self.by_id = {p['id']:p for p in self.catalog['products']}

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def product(self, product, saved):
        result = dict(product)
        data = dict(saved) if saved else dict(sku='', unit='', price=None, currency='PEN', tax='confirmar', stock=None, version=0, updated_at=None)
        data.pop('id', None)
        result.update(data)
        result['availability'] = 'Por confirmar' if data['stock'] is None else ('Disponible' if data['stock'] > 0 else 'Agotado')
        return result

    def exchange_rate(self):
        with self.connect() as db:
            row=dict(db.execute('SELECT rate,version,updated_at FROM settings WHERE id=1').fetchone())
        row['rate']=float(row['rate']) if row['rate'] else None
        return row

    def update_exchange_rate(self, payload, actor):
        try:
            rate=Decimal(str(payload.get('rate')))
            if isinstance(payload.get('rate'),bool) or not rate.is_finite() or not Decimal('0.0001')<=rate<=100 or rate!=rate.quantize(Decimal('0.0001')):
                raise ValueError('Ingresa un tipo de cambio mayor que cero, hasta 100 y con máximo 4 decimales.')
        except InvalidOperation:
            raise ValueError('Tipo de cambio inválido.')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            before=dict(db.execute('SELECT rate,version,updated_at FROM settings WHERE id=1').fetchone())
            if payload.get('version')!=before['version']:raise Conflict('El tipo de cambio cambió. Actualiza el panel antes de guardar.')
            after={'rate':str(rate),'version':before['version']+1,'updated_at':now()}
            db.execute('UPDATE settings SET rate=?,version=?,updated_at=? WHERE id=1',tuple(after.values()))
            db.execute('INSERT INTO audit(entity,entity_id,actor,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)',('exchange_rate','1',actor,json.dumps(before),json.dumps(after),now()))
        return self.exchange_rate()

    def products(self):
        with self.connect() as db:
            saved = {r['id']:r for r in db.execute('SELECT * FROM products')}
            setting=db.execute('SELECT rate FROM settings WHERE id=1').fetchone()
        rate=setting['rate']
        results=[self.product(p, saved.get(p['id'])) for p in self.by_id.values()]
        for p in results:
            p['exchangeRate']=float(rate) if rate and p['currency']=='USD' else None
            p['pricePEN']=None if p['price'] is None or (p['currency']=='USD' and not rate) else float((Decimal(str(p['price']))*(Decimal(rate) if p['currency']=='USD' else 1)).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP))
        return results

    def update_product(self, product_id, payload, actor):
        if product_id not in self.by_id:
            raise ValueError('Producto inexistente.')
        unit = text(payload.get('unit', ''), 30)
        if unit and unit not in UNITS:
            raise ValueError('Unidad de venta inválida.')
        stock = number(payload.get('stock'), UNITS.get(unit, False), nullable=True)
        if stock is not None and not unit:
            raise ValueError('Indica la unidad de venta antes de registrar stock.')
        price = number(payload.get('price'), nullable=True, positive=True)
        currency = payload.get('currency')
        tax = payload.get('tax')
        if currency not in ('PEN','USD') or tax not in ('incluido','no_incluido','confirmar'):
            raise ValueError('Revisa moneda e IGV.')
        sku = text(payload.get('sku', ''), 80)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            before = db.execute('SELECT * FROM products WHERE id=?', (product_id,)).fetchone()
            version = before['version'] if before else 0
            if payload.get('version') != version:
                raise Conflict('Otro usuario actualizó este producto. Recarga antes de guardar.')
            if sku and db.execute('SELECT id FROM products WHERE lower(sku)=lower(?) AND id<>?',(sku,product_id)).fetchone():
                raise ValueError('Ese SKU ya pertenece a otro producto.')
            db.execute('INSERT OR REPLACE INTO products VALUES(?,?,?,?,?,?,?,?,?)', (product_id,sku,unit,price,currency,tax,stock,version+1,now()))
            after = dict(db.execute('SELECT * FROM products WHERE id=?',(product_id,)).fetchone())
            db.execute('INSERT INTO audit(entity,entity_id,actor,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)', ('product',str(product_id),actor,json.dumps(dict(before)) if before else None,json.dumps(after),now()))
        return self.product(self.by_id[product_id], after)

    def create_request(self, payload, key):
        if not re.fullmatch(r'[a-zA-Z0-9-]{16,80}', key):
            raise ValueError('Identificador de envío inválido.')
        customer = payload.get('customer', {})
        if not isinstance(customer, dict): raise ValueError('Datos del cliente inválidos.')
        clean = {k:text(customer.get(k,''), n, required) for k,n,required in [
            ('name',100,True),('phone',24,True),('company',160,False),('ruc',11,False),
            ('email',160,False),('destination',300,False),('notes',2000,False)]}
        if not re.fullmatch(r'\+?[\d ()-]{7,24}', clean['phone']): raise ValueError('Revisa el teléfono de contacto.')
        if clean['ruc'] and not re.fullmatch(r'\d{11}',clean['ruc']): raise ValueError('El RUC debe tener 11 dígitos.')
        if clean['email'] and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',clean['email']): raise ValueError('Revisa el correo.')
        clean['delivery'] = customer.get('delivery')
        if clean['delivery'] not in ('retiro','entrega') or (clean['delivery']=='entrega' and not clean['destination']): raise ValueError('Indica retiro o destino de entrega.')
        if payload.get('consent') is not True: raise ValueError('Confirma el uso de tus datos para atender la solicitud.')
        clean['consent'] = True
        attachments = self.validate_files(payload.get('attachments', []))
        items = payload.get('items')
        if not isinstance(items,list) or len(items)>500 or (not items and not attachments): raise ValueError('Incluye materiales o archivos; máximo 500 renglones.')
        current = {p['id']:p for p in self.products()}
        lines=[]
        for item in items:
            if not isinstance(item,dict): raise ValueError('Renglón inválido.')
            pid = item.get('productId')
            if pid is not None and (type(pid) is not int or pid not in current): raise ValueError('Producto inexistente.')
            p = current.get(pid)
            unit = text(item.get('unit',''),30)
            unit = unit or (p['unit'] if p else '')
            qty = number(item.get('quantity'), fractional(unit), nullable=True, positive=True)
            query = text(item.get('query',''),2000,not p)
            original = text(item.get('original',''),6000)
            source = text(item.get('source',''),240)
            suggestions = item.get('suggestionIds',[])
            if not isinstance(suggestions,list) or len(suggestions)>6 or any(type(i) is not int or i not in current for i in suggestions): raise ValueError('Coincidencias inválidas.')
            lines.append(dict(productId=pid, title=p['title'] if p else query, sku=p['sku'] if p else '', brand=p['brand'] if p else '', quantity=qty, unit=unit, original=original, pending=not p, source=source, suggestions=[{'id':i,'title':current[i]['title']} for i in suggestions],
                              pricePEN=p['pricePEN'] if p else None, exchangeRate=p['exchangeRate'] if p else None, price=p['price'] if p else None, currency=p['currency'] if p else None, stock=p['stock'] if p else None,
                              availability=p['availability'] if p else 'Por confirmar', saleUnit=p['unit'] if p else '', tax=p['tax'] if p else 'confirmar'))
        # Fingerprint uses the client's validated request, not mutable catalog values.
        fingerprint=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            previous=db.execute('SELECT reference,fingerprint FROM requests WHERE idempotency=?',(key,)).fetchone()
            if previous:
                if previous['fingerprint'] != fingerprint: raise Conflict('El contenido cambió. Revisa la solicitud antes de enviarla de nuevo.')
                return {'reference':previous['reference'],'repeated':True}
            sequence=db.execute('INSERT INTO request_sequence DEFAULT VALUES').lastrowid
            reference='ALB-'+datetime.now(timezone.utc).strftime('%Y%m%d')+'-'+str(sequence).zfill(4)
            db.execute('INSERT INTO requests(reference,idempotency,fingerprint,customer,items,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',(reference,key,fingerprint,json.dumps(clean),json.dumps(lines),'Nueva',now(),now()))
            for attachment in attachments:
                db.execute('INSERT INTO attachments(reference,name,mime,size,data) VALUES(?,?,?,?,?)',(reference,attachment['name'],attachment['mime'],len(attachment['data']),attachment['data']))
        return {'reference':reference,'repeated':False}

    def validate_files(self, files):
        if not isinstance(files,list) or len(files)>5: raise ValueError('Máximo 5 archivos.')
        result=[]; total=0
        for item in files:
            if not isinstance(item,dict): raise ValueError('Archivo inválido.')
            name=text(item.get('name',''),200,True)
            if any(c in name for c in '/\\\r\n') or any(ord(c)<32 for c in name): raise ValueError('Nombre de archivo inválido.')
            try: data=base64.b64decode(item.get('data',''),validate=True)
            except (ValueError,TypeError,binascii.Error): raise ValueError('Archivo incompleto.')
            total+=len(data)
            if not 0<len(data)<=10*1024*1024 or total>20*1024*1024: raise ValueError('Máximo 10 MB por archivo y 20 MB en total.')
            ext=Path(name).suffix.lower(); mime=None
            if ext=='.pdf' and data[:5]==b'%PDF-': mime='application/pdf'
            elif ext in ('.jpg','.jpeg') and data[:3]==b'\xff\xd8\xff': mime='image/jpeg'
            elif ext=='.png' and data[:8]==b'\x89PNG\r\n\x1a\n': mime='image/png'
            elif ext=='.webp' and data[:4]==b'RIFF' and data[8:12]==b'WEBP': mime='image/webp'
            elif ext=='.xls' and data[:8]==b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1': mime='application/vnd.ms-excel'
            elif ext=='.xlsx':
                try:
                    with zipfile.ZipFile(io.BytesIO(data)) as z:
                        if 'xl/workbook.xml' in z.namelist() and '[Content_Types].xml' in z.namelist(): mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                except zipfile.BadZipFile: pass
            elif ext=='.csv':
                try: data.decode('utf-8-sig'); mime='text/csv'
                except UnicodeDecodeError: pass
            if not mime: raise ValueError('Formato no admitido o contenido inválido: '+name)
            result.append({'name':name,'mime':mime,'data':data})
        return result

    def attachment(self, reference, file_id):
        with self.connect() as db:
            return db.execute('SELECT * FROM attachments WHERE reference=? AND id=?',(reference,file_id)).fetchone()

    def requests(self):
        with self.connect() as db:
            rows=db.execute('SELECT reference,customer,items,status,agent,notes,version,created_at,updated_at FROM requests ORDER BY created_at DESC,reference DESC LIMIT 500').fetchall()
            files={}
            for f in db.execute('SELECT id,reference,name,mime,size FROM attachments'):
                files.setdefault(f['reference'],[]).append(dict(f))
        return [{**dict(r),'customer':json.loads(r['customer']),'items':json.loads(r['items']),'attachments':files.get(r['reference'],[])} for r in rows]

    def update_request(self, reference, payload, actor):
        status=payload.get('status')
        if status not in STATUSES: raise ValueError('Estado inválido.')
        agent=text(payload.get('agent',''),100)
        notes=text(payload.get('notes',''),4000)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT * FROM requests WHERE reference=?',(reference,)).fetchone()
            if not row: raise ValueError('Solicitud inexistente.')
            if payload.get('version') != row['version']: raise Conflict('La solicitud cambió. Recarga antes de guardar.')
            db.execute('UPDATE requests SET status=?,agent=?,notes=?,version=version+1,updated_at=? WHERE reference=?',(status,agent,notes,now(),reference))
            db.execute('INSERT INTO audit(entity,entity_id,actor,before_json,after_json,created_at) VALUES(?,?,?,?,?,?)',('request',reference,actor,json.dumps({'status':row['status'],'agent':row['agent'],'notes':row['notes']}),json.dumps({'status':status,'agent':agent,'notes':notes}),now()))
        return next(r for r in self.requests() if r['reference']==reference)

class Conflict(ValueError): pass

class Server(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,address,store,password):
        self.store=store
        self.salt=secrets.token_bytes(16)
        self.password_hash=hashlib.scrypt(password.encode(),salt=self.salt,n=16384,r=8,p=1)
        self.sessions={}
        self.rates={}
        self.lock=threading.Lock()
        super().__init__(address, Handler)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT/'docs'),**kwargs)
    def log_message(self,*args): pass  # Do not log customer data or session material.
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('X-Frame-Options','DENY')
        super().end_headers()
    def reply(self,status,data,cookie=None):
        body=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(body)))
        if cookie: self.send_header('Set-Cookie',cookie)
        self.end_headers();self.wfile.write(body)
    def session(self):
        c=SimpleCookie()
        try: c.load(self.headers.get('Cookie',''))
        except Exception:return None
        sid=c['albanil_session'].value if 'albanil_session' in c else ''
        with self.server.lock:
            s=self.server.sessions.get(sid)
            if s and s['expires']>time.time():return s
        return None
    def allowed(self,bucket,maximum,seconds):
        with self.server.lock:
            key=(self.client_address[0],bucket); stamp=time.time()
            for k,v in list(self.server.rates.items()):
                if not v or stamp-v[-1]>3600:self.server.rates.pop(k,None)
            values=[t for t in self.server.rates.get(key,[]) if stamp-t<seconds]
            self.server.rates[key]=values
            if len(values)>=maximum:return False
            values.append(stamp);return True
    def valid_host(self):
        return self.headers.get('Host','') in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}')
    def do_GET(self):
        if not self.valid_host(): return self.reply(403,{'error':'Host no autorizado.'})
        path=urlsplit(self.path).path
        if path=='/api/health':return self.reply(200,{'mode':'local','requests':True})
        if path=='/api/catalog':
            return self.reply(200,{**self.server.store.catalog,'products':self.server.store.products(),'exchangeRate':self.server.store.exchange_rate()})
        if path.startswith('/api/'):
            s=self.session()
            if not s:return self.reply(401,{'error':'Inicia sesión.'})
            if path=='/api/session':return self.reply(200,{'user':'Administrador','csrf':s['csrf']})
            if path=='/api/products':return self.reply(200,{'products':self.server.store.products(),'exchangeRate':self.server.store.exchange_rate()})
            if path=='/api/exchange-rate':return self.reply(200,self.server.store.exchange_rate())
            if path=='/api/requests':return self.reply(200,{'requests':self.server.store.requests()})
            match=re.fullmatch(r'/api/requests/(ALB-[A-Z0-9-]+)/files/(\d+)',path)
            if match:
                f=self.server.store.attachment(match[1],int(match[2]))
                if not f:return self.reply(404,{'error':'Archivo no encontrado.'})
                self.send_response(200)
                self.send_header('Content-Type',f['mime'])
                self.send_header('Content-Disposition',"attachment; filename*=UTF-8''"+quote(f['name'],safe=''))
                self.send_header('Content-Length',str(f['size']))
                self.send_header('Cache-Control','no-store')
                self.send_header('Content-Security-Policy',"sandbox; default-src 'none'")
                self.end_headers();self.wfile.write(f['data']);return
            return self.reply(404,{'error':'No encontrado.'})
        # Serve only public artifacts, never the service database, source or secrets.
        resolved=Path(self.translate_path(self.path)).resolve()
        if not resolved.is_relative_to((ROOT/'docs').resolve()) or any(p.startswith('.') for p in Path(unquote(path)).parts):
            return self.send_error(404)
        if resolved.is_dir() and not (resolved/'index.html').is_file():return self.send_error(404)
        return super().do_GET()
    def do_POST(self):self.mutate('POST')
    def do_PATCH(self):self.mutate('PATCH')
    def mutate(self,method):
        if not self.valid_host(): return self.reply(403,{'error':'Host no autorizado.'})
        path=urlsplit(self.path).path
        origin=self.headers.get('Origin')
        expected='http://'+self.headers.get('Host','')
        if origin != expected or self.headers.get('Sec-Fetch-Site')=='cross-site':return self.reply(403,{'error':'Origen no autorizado.'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=(29*1024*1024 if method=='POST' and path=='/api/requests' else 256000): return self.reply(413,{'error':'Solicitud demasiado grande.'})
            if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.reply(415,{'error':'Usa JSON.'})
            payload=json.loads(self.rfile.read(length))
            if not isinstance(payload,dict):raise ValueError('Solicitud inválida.')
            if method=='POST' and path=='/api/login':
                if not self.allowed('login',10,600):return self.reply(429,{'error':'Demasiados intentos. Espera unos minutos.'})
                password=payload.get('password','')
                if not isinstance(password,str) or len(password)>300:raise ValueError('Acceso inválido.')
                candidate=hashlib.scrypt(password.encode(),salt=self.server.salt,n=16384,r=8,p=1)
                if not hmac.compare_digest(candidate,self.server.password_hash):return self.reply(401,{'error':'Contraseña incorrecta.'})
                sid=secrets.token_urlsafe(32);s={'csrf':secrets.token_urlsafe(32),'expires':time.time()+8*3600}
                with self.server.lock:
                    self.server.sessions={k:v for k,v in self.server.sessions.items() if v['expires']>time.time()}
                    self.server.sessions[sid]=s
                return self.reply(200,{'user':'Administrador','csrf':s['csrf']},f'albanil_session={sid}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800')
            if method=='POST' and path=='/api/requests':
                if not self.allowed('request',12,3600):return self.reply(429,{'error':'Espera antes de enviar otra solicitud.'})
                return self.reply(201,self.server.store.create_request(payload,self.headers.get('Idempotency-Key','')))
            s=self.session()
            if not s:return self.reply(401,{'error':'Inicia sesión.'})
            if not hmac.compare_digest(self.headers.get('X-CSRF-Token',''),s['csrf']):return self.reply(403,{'error':'Sesión inválida. Vuelve a iniciar sesión.'})
            if method=='POST' and path=='/api/logout':
                with self.server.lock:
                    self.server.sessions={k:v for k,v in self.server.sessions.items() if v is not s}
                return self.reply(200,{},'albanil_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0')
            if method=='PATCH' and path=='/api/exchange-rate':return self.reply(200,self.server.store.update_exchange_rate(payload,'Administrador'))
            if method=='PATCH' and re.fullmatch(r'/api/products/\d+',path):return self.reply(200,self.server.store.update_product(int(path.rsplit('/',1)[1]),payload,'Administrador'))
            if method=='PATCH' and re.fullmatch('/api/requests/ALB-[A-Z0-9-]+',path):return self.reply(200,self.server.store.update_request(path.rsplit('/',1)[1],payload,'Administrador'))
            return self.reply(404,{'error':'No encontrado.'})
        except Conflict as e:self.reply(409,{'error':str(e)})
        except (ValueError,TypeError,KeyError) as e:self.reply(400,{'error':str(e) if isinstance(e,ValueError) else 'Datos inválidos.'})
        except Exception:self.reply(500,{'error':'No pudimos guardar. Inténtalo de nuevo; no se confirma el envío.'})

def main():
    args=argparse.ArgumentParser(description=__doc__)
    args.add_argument('--port',type=int,default=8092)
    args.add_argument('--db',type=Path,default=ROOT/'.local/private.sqlite3')
    config=args.parse_args()
    password=os.environ.get('ALBANIL_ADMIN_PASSWORD')
    if not password:
        import getpass
        password=getpass.getpass('Contraseña del administrador (mínimo 12 caracteres): ')
    if len(password)<12:raise SystemExit('Usa al menos 12 caracteres.')
    if config.db.resolve().is_relative_to((ROOT/'docs').resolve()):raise SystemExit('La base privada no puede estar dentro de docs/.')
    server=Server(('127.0.0.1',config.port),Store(config.db),password)
    print(f'Piloto local: http://127.0.0.1:{config.port}/propuesta/ | Panel: /propuesta/admin/',flush=True)
    server.serve_forever()
if __name__=='__main__':main()
