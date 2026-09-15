<?php
declare(strict_types=1);
function retentionDate(array $p): ?DateTimeImmutable {
    // Legacy requests without an explicit classification must first be reviewed.
    if(($p['retentionClass']??'unclassified')!=='no_sale')return null;
    $latest=null;
    foreach(['created_at','closedAt','lastCustomerContact'] as $key){
        if(empty($p[$key]))continue;
        try{$d=new DateTimeImmutable($p[$key],new DateTimeZone('UTC'));}catch(Throwable $e){return null;}
        if($latest===null||$d>$latest)$latest=$d;
    }
    if(!$latest)return null;
    // Calendar year, clamping leap day instead of overflowing into March.
    $year=(int)$latest->format('Y')+1;$month=(int)$latest->format('m');
    $last=(int)$latest->setDate($year,$month,1)->format('t');
    return $latest->setDate($year,$month,min((int)$latest->format('d'),$last));
}
function updateRetention(array $p,array $v): array {
    $class=$v['retentionClass']??($p['retentionClass']??'unclassified');
    if(!in_array($class,['no_sale','sale','hold','unclassified'],true))fail('Revisa el resultado de la cotización.');
    $contact=text($v['lastCustomerContact']??($p['lastCustomerContact']??''),10);
    if($contact!==''){
        $date=DateTimeImmutable::createFromFormat('!Y-m-d',$contact);
        if(!$date||$date->format('Y-m-d')!==$contact||$contact>gmdate('Y-m-d')||$contact<substr($p['created_at'],0,10))fail('Revisa la fecha del último contacto del cliente.');
    }
    $p['retentionClass']=$class;$p['lastCustomerContact']=$contact;
    if(in_array($v['status'],['Cerrada','Terminada'],true)&&!in_array($p['status'],['Cerrada','Terminada'],true))$p['closedAt']=now();
    if(in_array($v['status'],['Cerrada','Terminada'],true)&&$class==='unclassified')fail('Indica si hubo venta o si existe una controversia antes de cerrar.');
    return $p;
}
function purgeExpiredRequests(?DateTimeImmutable $at=null): int {
    $at??=new DateTimeImmutable('now',new DateTimeZone('UTC'));$count=0;
    if((int)query("SELECT GET_LOCK('albanil_retention',0)")->fetchColumn()!==1)return 0;
    try {
        // Only old candidates are read. Recheck under row lock against concurrent updates.
        $refs=query('SELECT reference FROM requests WHERE created_at<=? ORDER BY created_at',[$at->modify('-12 months')->format('Y-m-d\TH:i:s\Z')])->fetchAll();
        foreach($refs as $r){
            db()->beginTransaction();
            try{
                $data=query('SELECT data FROM requests WHERE reference=? FOR UPDATE',[$r['reference']])->fetchColumn();
                $p=$data?json_decode($data,true,64,JSON_THROW_ON_ERROR):null;$expires=$p?retentionDate($p):null;
                if(!$expires||$expires>$at){db()->commit();continue;}
                foreach(query('SELECT id FROM request_files WHERE reference=?',[$r['reference']])->fetchAll() as $f)query('INSERT IGNORE INTO retention_file_queue(id) VALUES(?)',[$f['id']]);
                query('DELETE FROM request_files WHERE reference=?',[$r['reference']]);
                query("DELETE FROM audit WHERE entity='request' AND entity_id=?",[$r['reference']]);
                query('DELETE FROM requests WHERE reference=?',[$r['reference']]);
                query('INSERT INTO retention_totals(month,requests_count) VALUES(?,1) ON DUPLICATE KEY UPDATE requests_count=requests_count+1',[$at->format('Y-m')]);
                db()->commit();$count++;
            }catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        }
        foreach(query('SELECT id FROM retention_file_queue')->fetchAll() as $f){
            if(!preg_match('/^[a-f0-9]{32}$/D',$f['id']))throw new RuntimeException('Invalid retention file id');
            $path=config()['uploads'].'/'.$f['id'];
            if(!file_exists($path)||unlink($path))query('DELETE FROM retention_file_queue WHERE id=?',[$f['id']]);
            else error_log('Retention attachment deletion pending');
        }
    }finally{query("SELECT RELEASE_LOCK('albanil_retention')");}
    return $count;
}
