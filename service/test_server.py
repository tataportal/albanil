import base64
import copy
import http.client
import json
import secrets
import tempfile
import threading
import unittest
from pathlib import Path
from server import Server, Store, Conflict

class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'private.sqlite3'
        self.store=Store(self.path)
    def tearDown(self):self.temp.cleanup()
    def product(self, **changes):
        return dict(sku='TAP-6',unit='par',price='2.38',currency='PEN',tax='incluido',stock='10',version=0,**changes)
    def request(self):
        return {'customer':{'name':'Cliente de prueba','phone':'999111222','email':'prueba@example.com','company':'','ruc':'','delivery':'entrega','destination':'Huancayo - dirección de prueba','notes':'Confirmar presentación'},'consent':True,'items':[{'productId':6,'quantity':2,'unit':'par','original':'2 pares de tapones','query':'tapones'},{'productId':None,'quantity':1.5,'unit':'m3','query':'Arena gruesa','original':'1.5 m3 de arena'}]}
    def test_stock_price_persistence_and_audit(self):
        updated=self.store.update_product(6,self.product(),'Administrador')
        self.assertEqual(updated['availability'],'Disponible')
        self.assertEqual(Store(self.path).products()[2]['id'],6)
        saved=next(p for p in Store(self.path).products() if p['id']==6)
        self.assertEqual(saved['price'],2.38)
        payload=self.product();payload.update(stock=0,version=1)
        self.assertEqual(self.store.update_product(6,payload,'Administrador')['availability'],'Agotado')
        payload.update(stock=None,price=None,version=2)
        self.assertEqual(self.store.update_product(6,payload,'Administrador')['availability'],'Por confirmar')
        with self.store.connect() as db:self.assertEqual(db.execute('select count(*) from audit').fetchone()[0],3)
    def test_validation_conflicts_and_unique_sku(self):
        payload=self.product();payload['stock']=1.54
        with self.assertRaises(ValueError):self.store.update_product(6,payload,'Admin')
        payload.update(unit='metro',stock=1.54)
        self.store.update_product(6,payload,'Admin')
        with self.assertRaises(Conflict):self.store.update_product(6,payload,'Admin')
        with self.assertRaises(ValueError):self.store.update_product(4,self.product(),'Admin')
        for bad in [-1,'NaN','Infinity',0,True]:
            payload=self.product();payload.update(price=bad,version=1)
            with self.assertRaises(ValueError):self.store.update_product(6,payload,'Admin')
    def test_structured_request_idempotency_and_no_stock_change(self):
        self.store.update_product(6,self.product(),'Admin')
        payload=self.request();key=secrets.token_hex(16)
        ref=self.store.create_request(payload,key)['reference']
        self.assertEqual(self.store.create_request(payload,key)['reference'],ref)
        row=self.store.requests()[0]
        self.assertEqual(row['items'][0]['title'],'Tapón de oido')
        self.assertEqual(row['items'][0]['quantity'],2)
        self.assertEqual(row['items'][1]['quantity'],1.5)
        self.assertTrue(row['items'][1]['pending'])
        self.assertEqual(row['customer']['destination'],'Huancayo - dirección de prueba')
        self.assertEqual(next(p for p in self.store.products() if p['id']==6)['stock'],10)
        self.store.update_request(ref,{'status':'Cotizada','agent':'Ventas','notes':'Por llamar','version':0},'Admin')
        self.assertEqual(next(p for p in self.store.products() if p['id']==6)['stock'],10)
        update=self.product();update.update(price=3,stock=9,version=1)
        self.store.update_product(6,update,'Admin')
        self.assertEqual(self.store.requests()[0]['items'][0]['price'],2.38)
        self.assertEqual(self.store.create_request(payload,key)['reference'],ref)
        payload['customer']['name']='Otro'
        with self.assertRaises(Conflict):self.store.create_request(payload,key)
    def test_request_rejects_bad_quantities_and_customer(self):
        self.store.update_product(6,self.product(),'Admin')
        for change in [('quantity',1.54),('productId',999999),('quantity',0)]:
            p=self.request();p['items'][0][change[0]]=change[1]
            with self.assertRaises(ValueError):self.store.create_request(p,secrets.token_hex(16))
        for field,value in [('name',''),('ruc','123'),('destination','')]:
            p=self.request();p['customer'][field]=value
            with self.assertRaises(ValueError):self.store.create_request(p,secrets.token_hex(16))
        p=self.request();p['consent']=False
        with self.assertRaises(ValueError):self.store.create_request(p,secrets.token_hex(16))

    def test_files_large_requests_and_atomic_validation(self):
        payload=self.request();payload['items']=[{'productId':None,'query':'Material pendiente','quantity':None,'unit':'','suggestionIds':[6]} for _ in range(200)]
        data=b'%PDF-1.4\n test original'
        payload['attachments']=[{'name':'pedido.pdf','data':base64.b64encode(data).decode()}]
        key=secrets.token_hex(16);ref=self.store.create_request(payload,key)['reference']
        self.assertEqual(self.store.create_request(payload,key)['reference'],ref)
        saved=Store(self.path).requests()[0]
        self.assertEqual(len(saved['items']),200);self.assertIsNone(saved['items'][0]['quantity'])
        self.assertEqual(saved['items'][0]['suggestions'][0]['title'],'Tapón de oido')
        self.assertEqual(len(saved['attachments']),1)
        self.assertEqual(self.store.attachment(ref,saved['attachments'][0]['id'])['data'],data)
        payload['items']=[]
        self.assertNotEqual(self.store.create_request(payload,secrets.token_hex(16))['reference'],ref)
        before=len(self.store.requests())
        for file in [{'name':'bad.pdf','data':base64.b64encode(b'not pdf').decode()},{'name':'../bad.pdf','data':base64.b64encode(data).decode()},{'name':'bad.pdf','data':'not base64!'}]:
            payload['attachments']=[file]
            with self.assertRaises(ValueError):self.store.create_request(payload,secrets.token_hex(16))
        self.assertEqual(len(self.store.requests()),before)
        self.store.update_request(ref,{'status':'Cotización parcial','agent':'Vendedor demo','notes':'Resolver pendientes','version':0},'Admin')
        self.assertEqual(next(r for r in self.store.requests() if r['reference']==ref)['status'],'Cotización parcial')

class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.password=secrets.token_urlsafe(20)
        self.server=Server(('127.0.0.1',0),Store(Path(self.temp.name)/'private.sqlite3'),self.password)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.port=self.server.server_port
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.temp.cleanup()
    def call(self,method,path,payload=None,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.port)
        h={'Origin':f'http://127.0.0.1:{self.port}','Content-Type':'application/json',**(headers or {})}
        c.request(method,path,json.dumps(payload) if payload is not None else None,h)
        r=c.getresponse();status=r.status;response_headers=dict(r.getheaders());raw=r.read();c.close()
        try:data=json.loads(raw)
        except ValueError:data={}
        return status,data,response_headers
    def test_private_routes_auth_csrf_and_catalog(self):
        self.assertEqual(self.call('GET','/api/requests')[0],401)
        self.assertEqual(self.call('GET','/api/products')[0],401)
        self.assertEqual(self.call('GET','/service/server.py')[0],404)
        self.assertEqual(self.call('GET','/.local/private.sqlite3')[0],404)
        self.assertEqual(self.call('POST','/api/login',{'password':'wrong'})[0],401)
        status,data,headers=self.call('POST','/api/login',{'password':self.password})
        self.assertEqual(status,200);cookie=headers['Set-Cookie'].split(';')[0]
        self.assertIn('HttpOnly',headers['Set-Cookie'])
        payload={'sku':'','unit':'par','price':2.38,'currency':'PEN','tax':'incluido','stock':5,'version':0}
        self.assertEqual(self.call('PATCH','/api/products/6',payload,{'Cookie':cookie})[0],403)
        h={'Cookie':cookie,'X-CSRF-Token':data['csrf']}
        body={'customer':{'name':'Prueba','phone':'999111222','delivery':'retiro'},'consent':True,'items':[],'attachments':[{'name':'pedido.pdf','data':base64.b64encode(b'%PDF-1.4 test').decode()}]}
        code,res,_=self.call('POST','/api/requests',body,{'Idempotency-Key':secrets.token_hex(16)})
        self.assertEqual(code,201)
        record=self.server.store.requests()[0];url=f"/api/requests/{res['reference']}/files/{record['attachments'][0]['id']}"
        self.assertEqual(self.call('GET',url)[0],401)
        status,_,fileheaders=self.call('GET',url,headers=h)
        self.assertEqual(status,200);self.assertIn('attachment;',fileheaders['Content-Disposition']);self.assertEqual(fileheaders['Cache-Control'],'no-store')
        self.assertEqual(self.call('GET',url.replace(res['reference'],'ALB-UNKNOWN'),headers=h)[0],404)
        self.assertEqual(self.call('PATCH','/api/products/6',payload,{**h,'Origin':'http://evil.example'})[0],403)
        self.assertEqual(self.call('PATCH','/api/products/6',payload,h)[0],200)
        public=self.call('GET','/api/catalog')[1]
        self.assertEqual(next(p for p in public['products'] if p['id']==6)['stock'],5)
        self.assertNotIn('requests',public)
        self.assertEqual(self.call('POST','/api/logout',{},h)[0],200)
        self.assertEqual(self.call('GET','/api/requests',headers={'Cookie':cookie})[0],401)

if __name__=='__main__':unittest.main()
