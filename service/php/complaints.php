<?php
declare(strict_types=1);
function validateComplaint(array $v): array {
    $out=[];
    foreach(['name'=>160,'document'=>30,'address'=>300,'phone'=>30,'email'=>160,'representative'=>300,'description'=>2000,'detail'=>5000,'request'=>3000] as $key=>$max)$out[$key]=text($v[$key]??'', $max, !in_array($key,['representative','phone','email']));
    if(!in_array($v['documentType']??null,['DNI','CE','Pasaporte','Otro'],true))fail('Selecciona el tipo de documento.');
    if($v['documentType']==='DNI'&&!preg_match('/^\d{8}$/D',$out['document']))fail('El DNI debe tener 8 dígitos.');
    if($out['email']!==''&&!filter_var($out['email'],FILTER_VALIDATE_EMAIL))fail('Revisa el correo electrónico.');
    if($out['phone']!==''&&!preg_match('/^[+0-9 ()-]{7,30}$/D',$out['phone']))fail('Revisa el teléfono.');
    if(!in_array($v['responseChannel']??null,['Correo electrónico','Carta al domicilio'],true)||($v['responseChannel']==='Correo electrónico'&&$out['email']===''))fail('Indica cómo deseas recibir la respuesta.');
    if(!is_bool($v['minor']??null)||($v['minor']&&$out['representative']===''))fail('Si eres menor de edad, completa los datos de tu padre, madre o representante.');
    if(!in_array($v['kind']??null,['Reclamo','Queja'],true)||!in_array($v['goodType']??null,['Producto','Servicio'],true))fail('Selecciona el tipo de reclamo y de bien contratado.');
    $amount=$v['amount']??null;if(!is_numeric($amount)||!is_finite((float)$amount)||(float)$amount<0||(float)$amount>99999999||abs((float)$amount*100-round((float)$amount*100))>1e-6)fail('Indica el monto reclamado con hasta dos decimales.');
    if(!in_array($v['currency']??null,['PEN','USD'],true))fail('Revisa la moneda.');
    return array_merge($out,array_intersect_key($v,array_flip(['documentType','responseChannel','minor','kind','goodType','currency'])),['amount'=>(float)$amount]);
}
function saveComplaint(array $v,string $key,string $hash): array {
    db()->beginTransaction();
    try {
        // A single locked sequence makes concurrent registrations consecutive.
        $number=(int)query('SELECT next_number FROM complaint_sequence WHERE id=1 FOR UPDATE')->fetchColumn();if($number<1)throw new RuntimeException('Missing complaint sequence');
        $prior=query('SELECT body_hash,data FROM complaints WHERE idempotency_key=?',[$key])->fetch();
        if($prior){if(!hash_equals($prior['body_hash'],$hash))fail('El contenido cambió. Inicia un nuevo registro.',409);db()->commit();return json_decode($prior['data'],true);}
        $ref='LR-WEB-'.str_pad((string)$number,8,'0',STR_PAD_LEFT);
        $packet=array_merge($v,['reference'=>$ref,'created_at'=>now(),'status'=>'Recibido','response'=>'','responseSentAt'=>'','responseEvidence'=>'','version'=>0,'privacyVersion'=>'2026-09-15']);
        query('INSERT INTO complaints(reference,idempotency_key,body_hash,data,created_at,version) VALUES(?,?,?,?,?,0)',[$ref,$key,$hash,jsonValue($packet),$packet['created_at']]);
        query('UPDATE complaint_sequence SET next_number=next_number+1 WHERE id=1');
        db()->commit();return $packet;
    }catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
}
function submitComplaint(): never {
    $key=$_SERVER['HTTP_IDEMPOTENCY_KEY']??'';if(!preg_match('/^[a-zA-Z0-9-]{32,80}$/D',$key))fail('Identificador de envío inválido.');
    $raw=rawBody(45000);$hash=hash('sha256',$raw);$key=hash('sha256',$key);
    $prior=query('SELECT body_hash,data FROM complaints WHERE idempotency_key=?',[$key])->fetch();
    if($prior){if(!hash_equals($prior['body_hash'],$hash))fail('El contenido cambió. Inicia un nuevo registro.',409);respond(['complaint'=>json_decode($prior['data'],true)]);}
    $v=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($v))fail('Revisa el formulario.');
    $v=validateComplaint($v);throttle('complaints',3600,10);
    $packet=saveComplaint($v,$key,$hash);try{notifyComplaint($packet);}catch(Throwable $e){error_log('Complaint notification failed: '.$packet['reference']);}respond(['complaint'=>$packet],201);
}
function complaintRoutes(string $path,string $method): never {
    requirePermission('complaints');
    if($path==='/complaints'&&$method==='GET'){
        $before=filter_var($_GET['before']??PHP_INT_MAX,FILTER_VALIDATE_INT);if(!$before||$before<1)fail('Página inválida.');
        $rows=query('SELECT id,data,version FROM complaints WHERE id<? ORDER BY id DESC LIMIT 101',[$before])->fetchAll();$more=count($rows)>100;if($more)array_pop($rows);
        respond(['complaints'=>array_map(function($r){$v=json_decode($r['data'],true);$v['version']=(int)$r['version'];return $v;},$rows),'nextCursor'=>$more?(int)end($rows)['id']:null]);
    }
    if(preg_match('#^/complaints/(LR-WEB-\d+)$#D',$path,$m)&&$method==='PATCH'){
        $v=input(18000);$state=$v['status']??'';if(!in_array($state,['Recibido','En atención','Respondido'],true)||!is_int($v['version']??null))fail('Revisa el estado.');
        $response=text($v['response']??'',6000);$sent=text($v['responseSentAt']??'',10);$evidence=text($v['responseEvidence']??'',1500);
        if($state==='Respondido'&&($response===''||$evidence===''||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$sent)||$sent>date('Y-m-d')))fail('Registra la respuesta, la fecha y la constancia de envío al consumidor.');
        if($sent!==''&&(!($date=DateTimeImmutable::createFromFormat('!Y-m-d',$sent))||$date->format('Y-m-d')!==$sent))fail('Revisa la fecha de respuesta.');
        db()->beginTransaction();$r=query('SELECT data,version FROM complaints WHERE reference=? FOR UPDATE',[$m[1]])->fetch();if(!$r)fail('Reclamo no encontrado.',404);if((int)$r['version']!==$v['version'])fail('Otra persona modificó el reclamo. Actualiza la lista.',409);
        $before=json_decode($r['data'],true);$after=array_merge($before,['status'=>$state,'response'=>$response,'responseSentAt'=>$sent,'responseEvidence'=>$evidence,'updatedAt'=>now(),'updatedBy'=>$GLOBALS['actor']['username'],'version'=>$v['version']+1]);
        query('UPDATE complaints SET data=?,version=version+1 WHERE reference=?',[jsonValue($after),$m[1]]);audit('complaint',$m[1],$before,$after);db()->commit();respond(['complaint'=>$after]);
    }
    fail('Ruta no disponible.',404);
}

function notifyComplaint(array $packet): bool {
    $subject='Nuevo registro '.$packet['reference'].' - Libro de reclamaciones';
    $body="Se ha registrado una nueva hoja en el Libro de reclamaciones de Albañil.\n\nNúmero: ".$packet['reference']."\n\nIngresa al panel para revisar el caso y atenderlo: https://albanil.pe".config()['base_path']."/admin/#reclamos\n\nPlazo máximo de respuesta al consumidor: 15 días hábiles improrrogables.\n";
    $ok=mail('reclamos@albanil.pe','=?UTF-8?B?'.base64_encode($subject).'?=',$body,"From: Albañil <reclamos@albanil.pe>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8",'-freclamos@albanil.pe');
    if(!$ok)error_log('Complaint notification pending: '.$packet['reference']);
    return $ok;
}
