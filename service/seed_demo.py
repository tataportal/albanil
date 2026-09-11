"""Create synthetic dashboard examples in a separate local database; never production."""
import base64
from pathlib import Path
from server import Store, ROOT

def seed(store=None):
    store=store or Store(ROOT/'.local/dashboard-demo.sqlite3')
    examples=[
        ('demo-dashboard-minorista-20260911','Cliente particular · DEMO',[{'productId':601,'quantity':2,'unit':'unidad','query':'Wincha Truper'},{'productId':None,'quantity':None,'unit':'','query':'Fenólico 18 mm'}],'Nueva',''),
        ('demo-dashboard-empresa-20260911','Compras de obra · DEMO',[{'productId':None,'quantity':i+1,'unit':'bolsa','query':'Cemento Andino Tipo 1','suggestionIds':[375],'original':f'{i+1} bolsas de cemento Andino'} for i in range(200)],'En atención','Asesor de prueba'),
        ('demo-dashboard-parcial-20260911','Mantenimiento · DEMO',[{'productId':43,'quantity':12,'unit':'par','query':'Guantes'},{'productId':None,'quantity':6,'unit':'unidad','query':'Spray C&A'}],'Cotización parcial','Asesor de prueba')]
    for key,name,items,status,agent in examples:
        source='Material,Cantidad\n'+''.join(f"{i['query']},{i['quantity'] or 'Por confirmar'}\n" for i in items)
        payload={'customer':{'name':name,'phone':'999111222','company':'Datos ficticios para demostración','delivery':'retiro','notes':'SOLICITUD DE PRUEBA. No contactar por WhatsApp.'},'consent':True,'items':items,'attachments':[{'name':'lista-demostracion.csv','data':base64.b64encode(source.encode()).decode()}]}
        result=store.create_request(payload,key)
        if status!='Nueva' and not result['repeated']:store.update_request(result['reference'],{'status':status,'agent':agent,'notes':'Demostración local. Revisar materiales pendientes.','version':0},'Demo')
    print('Preparadas 3 solicitudes sintéticas para el panel local.')
if __name__=='__main__':seed()
