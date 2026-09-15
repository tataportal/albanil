<?php
function runComplaintTests(): array {
    $v=['name'=>'Verificación técnica','documentType'=>'DNI','document'=>'00000000','address'=>'Dirección de validación','phone'=>'','email'=>'','responseChannel'=>'Carta al domicilio','minor'=>false,'representative'=>'','goodType'=>'Producto','description'=>'Material','kind'=>'Reclamo','detail'=>'Comprobación aislada','request'=>'Validar registro','amount'=>0,'currency'=>'PEN'];
    $valid=validateComplaint($v);$passed=['valid postal request without email'];
    foreach([['document','123'],['email','incorrecto'],['kind','Otro'],['amount',-1],['amount','NaN'],['amount',1.234],['name',''],['minor',true],['responseChannel','Correo electrónico']] as [$k,$bad]){
      try{validateComplaint(array_merge($v,[$k=>$bad]));throw new RuntimeException('Accepted invalid '.$k);}catch(DomainException $e){$passed[]='reject '.$k;}
    }
    query('CREATE TEMPORARY TABLE complaint_mail (reference VARCHAR(40),kind VARCHAR(12),attempts INT DEFAULT 0,accepted_at VARCHAR(30) NULL,next_attempt BIGINT DEFAULT 0,PRIMARY KEY(reference,kind))');
    // Temporary tables shadow real tables only in this DB connection.
    query('CREATE TEMPORARY TABLE complaints (id BIGINT AUTO_INCREMENT PRIMARY KEY, reference VARCHAR(40) UNIQUE NOT NULL, idempotency_key CHAR(64) UNIQUE NOT NULL, body_hash CHAR(64) NOT NULL, data LONGTEXT NOT NULL, created_at VARCHAR(30) NOT NULL, version INT NOT NULL DEFAULT 0) ENGINE=InnoDB');query('CREATE TEMPORARY TABLE complaint_sequence (id INT PRIMARY KEY,next_number BIGINT NOT NULL) ENGINE=InnoDB');query('INSERT INTO complaint_sequence VALUES(1,1)');
    $key=hash('sha256','isolated-one');$hash=hash('sha256',jsonValue($valid));$a=saveComplaint($valid,$key,$hash);$b=saveComplaint($valid,$key,$hash);if($a['reference']!=='LR-WEB-00000001'||jsonValue($a)!==jsonValue($b))throw new RuntimeException('Idempotency failed');
    try{saveComplaint($valid,$key,hash('sha256','changed'));throw new RuntimeException('Accepted different retry');}catch(DomainException $e){if($e->getCode()!==409)throw $e;}
    $c=saveComplaint($valid,hash('sha256','isolated-two'),$hash);if($c['reference']!=='LR-WEB-00000002'||query('SELECT COUNT(*) FROM complaints')->fetchColumn()!=2)throw new RuntimeException('Sequence failed');
    query('DROP TEMPORARY TABLE complaint_mail');query('DROP TEMPORARY TABLE complaints');query('DROP TEMPORARY TABLE complaint_sequence');return array_merge($passed,['idempotent retry','conflict rejection','consecutive sequence','no production records created']);
}
