<?php
function runMaintenanceTests(): array {
    $check=function($ok,$label){if(!$ok)throw new RuntimeException($label);};
    $base=['created_at'=>'2024-02-29T12:00:00Z','retentionClass'=>'no_sale','status'=>'Nueva'];
    $check(retentionDate($base)->format('Y-m-d H:i:s')==='2025-02-28 12:00:00','leap year clamp');
    foreach(['sale','hold','unclassified'] as $class)$check(retentionDate(array_merge($base,['retentionClass'=>$class]))===null,'protected '.$class);
    $check(retentionDate(['created_at'=>$base['created_at']])===null,'legacy protected');
    $p=array_merge($base,['lastCustomerContact'=>'2025-07-01','closedAt'=>'2025-09-15T00:00:00Z','updatedAt'=>'2026-02-01T00:00:00Z']);
    $check(retentionDate($p)->format('Y-m-d')==='2026-09-15','closure anchor; internal edits ignored');
    try{updateRetention($base,['status'=>'Nueva','lastCustomerContact'=>'2025-02-30']);throw new RuntimeException('accepted invalid date');}catch(DomainException $e){}
    $schemas=[
      'requests'=>'reference VARCHAR(40) PRIMARY KEY,idempotency_key CHAR(64),body_hash CHAR(64),data LONGTEXT,summary LONGTEXT,version INT,created_at VARCHAR(30)',
      'request_files'=>'id CHAR(32) PRIMARY KEY,reference VARCHAR(40),name VARCHAR(200),size INT,sha256 CHAR(64)',
      'audit'=>'id INT AUTO_INCREMENT PRIMARY KEY,entity VARCHAR(40),entity_id VARCHAR(80),before_data LONGTEXT,after_data LONGTEXT,created_at VARCHAR(30),actor_username VARCHAR(100)',
      'retention_file_queue'=>'id CHAR(32) PRIMARY KEY',
      'retention_totals'=>'month CHAR(7) PRIMARY KEY,requests_count INT DEFAULT 0',
      'complaint_mail'=>'reference VARCHAR(40),kind VARCHAR(12),attempts INT DEFAULT 0,accepted_at VARCHAR(30) NULL,next_attempt BIGINT DEFAULT 0,PRIMARY KEY(reference,kind)',
      'complaints'=>'reference VARCHAR(40) PRIMARY KEY,data LONGTEXT'
    ];
    foreach($schemas as $table=>$schema)query('CREATE TEMPORARY TABLE '.$table.' ('.$schema.') ENGINE=InnoDB');
    $id=bin2hex(random_bytes(16));$file=config()['uploads'].'/'.$id;
    try{
      foreach(['expired','recent','sale','hold','legacy'] as $ref){
        $p=array_merge($base,['retentionClass'=>match($ref){'sale'=>'sale','hold'=>'hold','legacy'=>'unclassified',default=>'no_sale'}]);
        if($ref==='recent')$p['lastCustomerContact']='2026-08-01';
        query('INSERT INTO requests VALUES(?,?,?,?,?,?,?)',[$ref,$ref,$ref,jsonValue($p),jsonValue($p),0,$p['created_at']]);
      }
      file_put_contents($file,'retention isolated fixture');
      query('INSERT INTO request_files VALUES(?,?,?,?,?)',[$id,'expired','private.txt',26,'hash']);
      query("INSERT INTO audit(entity,entity_id,before_data,after_data) VALUES('request','expired','personal data','personal data')");
      $check(purgeExpiredRequests(new DateTimeImmutable('2026-09-15T00:00:00Z'))===1,'only expired no-sale deleted');
      $check(!is_file($file),'attachment removed');
      $check((int)query('SELECT COUNT(*) FROM requests')->fetchColumn()===4,'protected and recent retained');
      $check((int)query('SELECT COUNT(*) FROM audit')->fetchColumn()===0,'personal audit removed');
      $check((int)query('SELECT requests_count FROM retention_totals')->fetchColumn()===1,'anonymous aggregate');
      $check(purgeExpiredRequests(new DateTimeImmutable('2026-09-15T00:00:00Z'))===0,'repeat safe');
      $packet=['reference'=>'LR-ISOLATED','created_at'=>now(),'name'=>'Persona de validación','email'=>'reclamos@albanil.pe','detail'=>'porque el dueño esta bien guapo','request'=>'Verificar copia completa','amount'=>0,'currency'=>'PEN','minor'=>false];
      query('INSERT INTO complaints VALUES(?,?)',[$packet['reference'],jsonValue($packet)]);queueComplaintMail($packet);queueComplaintMail($packet);
      $check((int)query('SELECT COUNT(*) FROM complaint_mail')->fetchColumn()===2,'unique durable recipients');
      $check(deliverComplaintMail(null,fn()=>false)===0,'mail failure safe');
      $check(complaintCopyStatus($packet)==='pending','copy pending after failure');
      query('UPDATE complaint_mail SET next_attempt=0');$messages=[];
      $check(deliverComplaintMail(null,function($to,$subject,$body)use(&$messages){$messages[]=compact('to','subject','body');return true;})===2,'retry sends both');
      $check(complaintCopyStatus($packet)==='accepted','accepted status');
      $check(deliverComplaintMail(null,fn()=>throw new RuntimeException('duplicate send'))===0,'no duplicate accepted mail');
      $copies=array_filter($messages,fn($m)=>str_starts_with($m['subject'],'Copia'));
      $check(count($copies)===1&&str_contains(array_values($copies)[0]['body'],$packet['detail']),'full consumer copy');
      $check(complaintCopyStatus(['email'=>''])==='no_email','postal without email supported');
    }finally{if(is_file($file))unlink($file);foreach(array_keys($schemas) as $table)query('DROP TEMPORARY TABLE '.$table);}
    return ['12-month calendar deadline','sales / holds / legacy protected','contact and closure anchors','expired data / attachment / audit erased','repeat cleanup safe','anonymous count only','mail queue idempotency','failure and retry','complete consumer copy','no production rows changed'];
}
