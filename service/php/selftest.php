<?php
// Executed by the authenticated, temporary installer; not included in public releases.
function runSelfTests(): array {
    $passed=[];$ok=function($condition,$name)use(&$passed){if(!$condition)throw new RuntimeException('Check failed: '.$name);$passed[]=$name;};
    $v=['consent'=>true,'customer'=>['name'=>'Verificación','phone'=>'999999999','delivery'=>'retiro'],'items'=>[['productId'=>4,'query'=>'Casco','quantity'=>2,'unit'=>'unidad']],'attachments'=>[['name'=>'materiales.csv','data'=>base64_encode("Material,Cantidad\nCasco,2")]]];
    $r=validateSubmission($v);$ok(count($r['items'])===1&&$r['attachments'][0]['size']===strlen("Material,Cantidad\nCasco,2"),'valid material and original file');
    foreach(['fractional'=>function($x){$x['items'][0]['quantity']=1.54;return $x;},'missing consent'=>function($x){$x['consent']=false;return $x;},'unsafe extension'=>function($x){$x['attachments'][0]['name']='shell.php';return $x;},'invalid base64'=>function($x){$x['attachments'][0]['data']='#bad';return $x;},'too many items'=>function($x){$x['items']=array_fill(0,501,$x['items'][0]);return $x;},'missing destination'=>function($x){$x['customer']['delivery']='entrega';return $x;}] as $name=>$mutate){
        $rejected=false;try{validateSubmission($mutate($v));}catch(DomainException $e){$rejected=true;}$ok($rejected,$name.' rejected');
    }
    $v['items'][0]['unit']='metro';$v['items'][0]['quantity']=1.54;$ok(validateSubmission($v)['items'][0]['quantity']===1.54,'fractional measured unit accepted');
    $ok(validRate(3.4)&&validRate(0.0001)&&!validRate(0)&&!validRate(3.40001)&&!validRate('3.4'),'exchange-rate bounds and type');
    $ok(hash_equals(config()['admin_hash'],hash_pbkdf2('sha256','wrong password',hex2bin(config()['admin_salt']),600000,64,false))===false,'incorrect password rejected');
    return $passed;
}
