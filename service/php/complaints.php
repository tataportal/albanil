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
        queueComplaintMail($packet);db()->commit();return $packet;
    }catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
}
function submitComplaint(): never {
    $key=$_SERVER['HTTP_IDEMPOTENCY_KEY']??'';if(!preg_match('/^[a-zA-Z0-9-]{32,80}$/D',$key))fail('Identificador de envío inválido.');
    $raw=rawBody(45000);$hash=hash('sha256',$raw);$key=hash('sha256',$key);
    $prior=query('SELECT body_hash,data FROM complaints WHERE idempotency_key=?',[$key])->fetch();
    if($prior){if(!hash_equals($prior['body_hash'],$hash))fail('El contenido cambió. Inicia un nuevo registro.',409);$packet=json_decode($prior['data'],true);respond(['complaint'=>$packet,'copyStatus'=>complaintCopyStatus($packet)]);}
    $v=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($v))fail('Revisa el formulario.');
    $v=validateComplaint($v);throttle('complaints',3600,10);
    $packet=saveComplaint($v,$key,$hash);try{deliverComplaintMail($packet['reference']);}catch(Throwable $e){error_log('Complaint mail pending: '.$packet['reference']);}respond(['complaint'=>$packet,'copyStatus'=>complaintCopyStatus($packet)],201);
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

function queueComplaintMail(array $p): void {
    foreach (empty($p['email'])?['store']:['store','consumer'] as $kind)
        query('INSERT IGNORE INTO complaint_mail(reference,kind) VALUES(?,?)',[$p['reference'],$kind]);
}
function complaintCopyStatus(array $p): string {
    if(empty($p['email']))return 'no_email';
    return query("SELECT accepted_at FROM complaint_mail WHERE reference=? AND kind='consumer'",[$p['reference']])->fetchColumn()?'accepted':'pending';
}
function complaintCopyBody(array $p): string {
    $labels=['reference'=>'Número de hoja','created_at'=>'Fecha de registro (UTC)','name'=>'Nombre del consumidor','documentType'=>'Tipo de documento','document'=>'Documento','address'=>'Domicilio','phone'=>'Teléfono','email'=>'Correo electrónico','representative'=>'Padre, madre o representante','goodType'=>'Bien contratado','description'=>'Descripción del bien','kind'=>'Tipo de registro','detail'=>'Detalle del reclamo o queja','request'=>'Pedido del consumidor','responseChannel'=>'Medio elegido para la respuesta'];
    $body="ALBAÑIL HOME CENTER EIRL — LIBRO DE RECLAMACIONES\nRUC 20608137328\nAv. Mariscal Castilla 3022, Paradero Volvo, El Tambo - Huancayo\n\nCOPIA DE TU HOJA DE RECLAMACIÓN\n\n";
    foreach($labels as $key=>$label)$body.=$label.': '.($p[$key]??'')."\n\n";
    $body.='Menor de edad: '.(!empty($p['minor'])?'Sí':'No')."\nMonto reclamado: ".$p['currency'].' '.number_format((float)$p['amount'],2,'.','')."\n\n";
    return $body."Esta copia confirma el registro; no constituye la respuesta a tu reclamo. Conserva el número de hoja para hacer seguimiento.\nPlazo máximo de respuesta: 15 días hábiles improrrogables.\nPresentar un reclamo no impide acudir a otras vías de solución ni es requisito previo para denunciar ante Indecopi.\nContacto: reclamos@albanil.pe\n";
}
function deliverComplaintMail(?string $reference=null, ?callable $sender=null): int {
    // Serialize sends across immediate requests and cron; do not resend accepted messages.
    if((int)query("SELECT GET_LOCK('albanil_complaint_mail',0)")->fetchColumn()!==1)return 0;
    $sent=0;
    try {
        $sql='SELECT m.reference,m.kind,m.attempts,c.data FROM complaint_mail m JOIN complaints c ON c.reference=m.reference WHERE m.accepted_at IS NULL AND m.next_attempt<=?';$params=[time()];
        if($reference!==null){$sql.=' AND m.reference=?';$params[]=$reference;}
        $rows=query($sql.' ORDER BY m.next_attempt LIMIT 20',$params)->fetchAll();
        foreach($rows as $row){
            $p=json_decode($row['data'],true,32,JSON_THROW_ON_ERROR);$consumer=$row['kind']==='consumer';
            $to=$consumer?($p['email']??''):'reclamos@albanil.pe';
            if(!filter_var($to,FILTER_VALIDATE_EMAIL))continue;
            $subject=($consumer?'Copia de tu hoja ':'Nuevo registro ').$p['reference'].' - Libro de reclamaciones';
            $body=$consumer?complaintCopyBody($p):"Nueva hoja: ".$p['reference']."\nRevisa el caso en https://albanil.pe".config()['base_path']."/admin/#reclamos\nPlazo máximo de respuesta: 15 días hábiles improrrogables.\n";
            $headers="From: =?UTF-8?B?".base64_encode('Albañil')."?= <reclamos@albanil.pe>\r\nReply-To: reclamos@albanil.pe\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64";
            query('UPDATE complaint_mail SET attempts=attempts+1,next_attempt=? WHERE reference=? AND kind=?',[time()+min(86400,300*(2**min(8,(int)$row['attempts']))),$row['reference'],$row['kind']]);
            $ok=$sender?$sender($to,$subject,$body):mail($to,'=?UTF-8?B?'.base64_encode($subject).'?=',chunk_split(base64_encode($body),76,"\r\n"),$headers,'-freclamos@albanil.pe');
            if($ok){query('UPDATE complaint_mail SET accepted_at=? WHERE reference=? AND kind=?',[now(),$row['reference'],$row['kind']]);$sent++;}
        }
    } finally {query("SELECT RELEASE_LOCK('albanil_complaint_mail')");}
    return $sent;
}
