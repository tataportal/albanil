<?php
// Configuration and uploads live outside public_html. No secrets belong in this source.
declare(strict_types=1);
ini_set('serialize_precision', '-1');
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', dirname(__DIR__, 3) . '/nueva-private/php-error.log');
function config(): array {
    static $c;
    if ($c === null) $c = json_decode(file_get_contents(dirname(__DIR__, 3) . '/nueva-private/config.json'), true, 32, JSON_THROW_ON_ERROR);
    return $c;
}
function db(): PDO {
    static $db;
    if (!$db) {
        $c = config();
        $db = new PDO('mysql:host=localhost;dbname=' . $c['database'] . ';charset=utf8mb4', $c['db_user'], $c['db_password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES=>false, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    }
    return $db;
}
function query(string $sql, array $params=[]): PDOStatement { $q=db()->prepare($sql); $q->execute($params); return $q; }
function jsonValue($value): string { return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR); }
function now(): string { return gmdate('Y-m-d\TH:i:s\Z'); }
function fail(string $message, int $status=400): never { throw new DomainException($message, $status); }
function respond($value, int $status=200): never {
    http_response_code($status); header('Content-Type: application/json; charset=utf-8'); echo jsonValue($value); exit;
}
function rawBody(int $max): string {
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) fail('Formato inválido.',415);
    if ((int)($_SERVER['CONTENT_LENGTH']??0)>$max) fail('Solicitud demasiado grande.',413);
    $f=fopen('php://input','rb');$s=stream_get_contents($f,$max+1);fclose($f);
    if(strlen($s)>$max)fail('Solicitud demasiado grande.',413);
    return $s;
}
function input(int $max=10000): array { $v=json_decode(rawBody($max),true,64,JSON_THROW_ON_ERROR);if(!is_array($v)||array_is_list($v))fail('Solicitud inválida.');return $v; }
function text($s, int $max, bool $required=false): string {
    if(!is_string($s)||mb_strlen($s)>$max||($required&&trim($s)===''))fail('Revisa los campos de la solicitud.');return trim($s);
}
function audit(string $entity,string $id,$before,$after): void { query('INSERT INTO audit(entity,entity_id,before_data,after_data,created_at,actor_username) VALUES(?,?,?,?,?,?)',[$entity,$id,jsonValue($before),jsonValue($after),now(),$GLOBALS['actor']['username']??null]); }
function throttle(string $action,int $window,int $limit): void {
    query('DELETE FROM attempts WHERE expires_at<? LIMIT 1000',[time()]);
    $key=hash_hmac('sha256',$action.':'.($_SERVER['REMOTE_ADDR']??'unknown').':'.intdiv(time(),$window),config()['rate_secret']);
    query('INSERT INTO attempts(bucket_key,attempts,expires_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=attempts+1',[$key,time()+2*$window]);
    $count=(int)query('SELECT attempts FROM attempts WHERE bucket_key=?',[$key])->fetchColumn();
    if($count>$limit)fail('Demasiados intentos. Vuelve a intentarlo más tarde.',429);
}
function bearer(): string { return preg_replace('/^Bearer /','',$_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??''); }
function userAccount(string $name): ?array {
    $c=config();$key=mb_strtolower(trim($name));
    if($key===mb_strtolower($c['admin_username']))return ['username'=>$c['admin_username'],'role'=>'admin','salt'=>$c['admin_salt'],'hash'=>$c['admin_hash']];
    foreach($c['users']??[] as $u)if(mb_strtolower($u['username'])===$key&&($u['active']??true))return $u;
    return null;
}
function userPermissions(array $u): array {return match($u['role']){'admin'=>['requests','products','exchange','complaints','banners'],'quotations'=>['requests'],'catalog'=>['products','exchange'],default=>[]};}
function publicUser(array $u): array {return ['username'=>$u['username'],'role'=>$u['role'],'permissions'=>userPermissions($u)];}
function requirePermission(string $permission): void {if(!in_array($permission,userPermissions($GLOBALS['actor']),true))fail('No tienes permiso para esta sección.',403);}
function sessionHash(): string {
    $token=bearer();if(!preg_match('/^[a-f0-9]{64}$/D',$token))fail('Inicia sesión para continuar.',401);
    $hash=hash('sha256',$token);$row=query('SELECT username FROM sessions WHERE token_hash=? AND expires_at>?',[$hash,time()])->fetch();
    $u=$row?userAccount($row['username']??''):null;if(!$u)fail('Inicia sesión para continuar.',401);$GLOBALS['actor']=$u;return $hash;
}
function rate(): array { $r=query('SELECT rate,version,updated_at FROM exchange_rate WHERE id=1')->fetch();if(!$r)fail('Servicio no disponible.',503);$r['rate']=(float)$r['rate'];$r['version']=(int)$r['version'];return $r; }
function catalog(): array {
    $c=json_decode(file_get_contents(dirname(__DIR__).'/catalog.json'),true,64,JSON_THROW_ON_ERROR);$edits=[];
    foreach(query('SELECT id,data,version FROM product_overrides') as $r)$edits[(int)$r['id']]=array_merge(json_decode($r['data'],true),['version'=>(int)$r['version']]);
    foreach($c['products'] as &$p)$p=array_merge($p,['version'=>0],$edits[$p['id']]??[]);
    unset($p);
    $existing=array_column($c['products'],'id');
    foreach($edits as $id=>$edit)if(!in_array($id,$existing,true)&&($edit['createdInPanel']??false))$c['products'][]=array_merge($edit,['id'=>$id]);
    foreach($c['products'] as &$p)foreach(['creationKey','creationHash','photoHash','photoMime'] as $key)unset($p[$key]);
    unset($p);$c['exchangeRate']=rate();return $c;
}
function validRate($r): bool { return (is_int($r)||is_float($r))&&is_finite((float)$r)&&$r>=0.0001&&$r<=100&&abs($r*10000-round($r*10000))<1e-7; }
function changeRate(): never {
    $v=input();if(!validRate($v['rate']??null)||!is_int($v['version']??null)||$v['version']<0)fail('Ingresa un tipo de cambio positivo con máximo 4 decimales.');
    db()->beginTransaction();$before=rate();$stamp=now();
    $q=query('UPDATE exchange_rate SET rate=?,version=version+1,updated_at=? WHERE id=1 AND version=?',[$v['rate'],$stamp,$v['version']]);
    if(!$q->rowCount())fail('Otra persona actualizó el tipo de cambio. Recarga el panel.',409);
    $after=['rate'=>$v['rate'],'version'=>$v['version']+1,'updated_at'=>$stamp];audit('exchange_rate','1',$before,$after);db()->commit();respond($after);
}
function changeProduct(int $id): never {
    $v=input(8*1024*1024);$all=catalog();$current=null;foreach($all['products'] as $p)if($p['id']===$id){$current=$p;break;}
    if(!$current)fail('Producto no encontrado.',404);
    if(!is_int($v['version']??null)||$v['version']!==$current['version'])fail('El producto cambió. Actualiza el panel.',409);
    $units=['unidad','par','caja','bolsa','rollo','tubo','plancha','tarro','millar','metro','kg','litro','m2','m3','varilla','envase','saco','hoja','cartucho','lata','galon','juego'];
    $price=$v['price']??null;$stock=$v['stock']??null;
    if($price==='')$price=null;if($stock==='')$stock=null;
    if(!in_array($v['unit']??null,$units,true)||!in_array($v['currency']??null,['PEN','USD'],true)||!in_array($v['tax']??null,['incluido','no_incluido','confirmar'],true))fail('Revisa unidad, moneda e impuestos.');
    if($price!==null&&(!is_numeric($price)||!is_finite((float)$price)||$price<=0||$price>999999))fail('Precio inválido.');
    if($stock!==null&&(!is_numeric($stock)||!is_finite((float)$stock)||$stock<0||$stock>999999||(!in_array($v['unit'],['metro','kg','litro','m2','m3'])&&(float)$stock!==floor((float)$stock))))fail('Existencias inválidas para esta unidad.');
    $state=$v['state']??($current['state']??'ACTIVO');if(!in_array($state,['ACTIVO','INACTIVO'],true))fail('Estado inválido.');
    $edit=['state'=>$state,'sku'=>text($v['sku']??'',80),'unit'=>$v['unit'],'price'=>$price===null?null:(float)$price,'stock'=>$stock===null?null:(float)$stock,'currency'=>$v['currency'],'tax'=>$v['tax'],'availability'=>$stock===null?'Por confirmar':($stock>0?'Disponible':'Agotado'),'dataUpdatedAt'=>now()];
    foreach(['title'=>200,'brand'=>100,'specifications'=>2000,'category'=>120] as $field=>$max)if(array_key_exists($field,$v))$edit[$field]=text($v[$field],$max,in_array($field,['title','category'],true));
    if(isset($edit['category'])){
        if(!in_array($edit['category'],array_column($all['categories'],'name'),true))fail('Selecciona una categoría del catálogo.');
        $edit['group']='';foreach($all['groups'] as $g)if(in_array($edit['category'],$g['types']??[],true)){$edit['group']=$g['id'];break;}
    }
    if(array_key_exists('photo',$v)){
        $photo=productPhoto($v['photo']);$dir=dirname(__DIR__,3).'/nueva-private/product-images';
        if(!is_dir($dir)&&!mkdir($dir,0700,true))fail('No se pudo guardar la foto.',503);
        $file=$dir.'/'.$photo['hash'];if(!is_file($file)){if(file_put_contents($file,$photo['bytes'],LOCK_EX)!==strlen($photo['bytes']))fail('No se pudo guardar la foto.',503);chmod($file,0600);}
        $edit['photoHash']=$photo['hash'];$edit['photoMime']=$photo['mime'];
        $edit['image']=$edit['imageSmall']='api/products/'.$id.'/image?v='.$photo['hash'];
    }
    db()->beginTransaction();$row=query('SELECT version FROM product_overrides WHERE id=? FOR UPDATE',[$id])->fetch();
    if(($row?(int)$row['version']:0)!==$v['version'])fail('Otro usuario modificó el producto. Actualiza el panel.',409);
    if($row){$stored=json_decode(query('SELECT data FROM product_overrides WHERE id=?',[$id])->fetchColumn(),true);query('UPDATE product_overrides SET data=?,version=version+1 WHERE id=?',[jsonValue(array_merge($stored,$edit)),$id]);}
    else query('INSERT INTO product_overrides(id,data,version) VALUES(?,?,1)',[$id,jsonValue($edit)]);
    $after=array_merge($current,$edit,['version'=>$v['version']+1]);audit('product',(string)$id,$current,$after);db()->commit();foreach(['photoHash','photoMime'] as $field)unset($after[$field]);respond($after);
}
function validateSubmission(array $v): array {
    if(($v['consent']??null)!==true||!is_array($v['customer']??null)||!is_array($v['items']??null)||!array_is_list($v['items'])||count($v['items'])>500)fail('Revisa tus datos y materiales.');
    $c=$v['customer'];$customer=[];
    foreach(['name'=>100,'phone'=>24,'company'=>160,'email'=>160,'ruc'=>20,'destination'=>300,'notes'=>2000] as $key=>$limit)$customer[$key]=text($c[$key]??'',$limit,in_array($key,['name','phone']));
    $customer['delivery']=$c['delivery']??null;
    if(!preg_match('/^[+0-9 ()-]{7,24}$/D',$customer['phone'])||!in_array($customer['delivery'],['retiro','entrega'],true)||($customer['delivery']==='entrega'&&!$customer['destination']))fail('Revisa el teléfono y el destino de entrega.');
    $items=[];foreach($v['items'] as $i){
        if(!is_array($i))fail('Material inválido.');$qty=$i['quantity']??null;$pid=$i['productId']??null;$unit=text($i['unit']??'',30);
        if($qty!==null&&(!(is_int($qty)||is_float($qty))||!is_finite((float)$qty)||$qty<=0||$qty>999999||abs($qty*100-round($qty*100))>1e-7))fail('Cantidad inválida.');
        if($pid!==null&&!is_int($pid))fail('Producto inválido.');
        if($qty!==null&&$unit!==''&&!preg_match('/^(?:m|m[²³23]|m\^[23]|metros?|metros? (?:cuadrados?|c[uú]bicos?)|kg|kilos?|kilogramos?|g|gramos?|t|toneladas?|l|litros?|ml|mililitros?|gal[oó]n(?:es)?)$/iu',trim($unit))&&(float)$qty!==floor((float)$qty))fail('Esta unidad requiere cantidades enteras.');
        $suggestions=is_array($i['suggestionIds']??null)?array_slice(array_values(array_filter($i['suggestionIds'],'is_int')),0,3):[];
        $items[]=['productId'=>$pid,'query'=>text($i['query']??null,500,true),'quantity'=>$qty,'unit'=>$unit,'original'=>text($i['original']??'',2000),'source'=>text($i['source']??'',260),'suggestionIds'=>$suggestions];
    }
    $files=$v['attachments']??[];if(!is_array($files)||!array_is_list($files)||count($files)>5||(!$items&&!$files))fail('Incluye materiales o un archivo.');
    $total=0;$attachments=[];foreach($files as $f){
        if(!is_array($f))fail('Archivo inválido.');$name=preg_replace('/[\\\\\/\r\n]/','_',text($f['name']??null,200,true));$data=$f['data']??null;
        if(!preg_match('/\.(pdf|xlsx?|csv|jpe?g|png|webp)$/iD',$name)||!is_string($data)||strlen($data)>13981016||strlen($data)%4||!preg_match('/^[A-Za-z0-9+\/]*={0,2}$/D',$data))fail('Archivo inválido.');
        $size=(int)(strlen($data)*3/4-(str_ends_with($data,'==')?2:(str_ends_with($data,'=')?1:0)));$total+=$size;
        if($size<1||$size>10*1024*1024)fail('Máximo 10 MB por archivo.');
        $attachments[]=['id'=>bin2hex(random_bytes(16)),'name'=>$name,'size'=>$size,'data'=>$data];
    }
    if($total>20*1024*1024)fail('Máximo 20 MB de archivos por solicitud.');return compact('customer','items','attachments');
}
function summary(array $p): array {$s=$p;$s['items']=array_map(fn($i)=>['pending'=>$i['pending'],'quantity'=>$i['quantity']],$p['items']);return $s;}
function submitRequest(): never {
    $key=$_SERVER['HTTP_IDEMPOTENCY_KEY']??'';if(!preg_match('/^[a-zA-Z0-9-]{16,80}$/D',$key))fail('Identificador de envío inválido.');
    $raw=rawBody(30*1024*1024);$hash=hash('sha256',$raw);$keyHash=hash('sha256',$key);
    $prior=query('SELECT reference,body_hash FROM requests WHERE idempotency_key=?',[$keyHash])->fetch();
    if($prior){if(!hash_equals($prior['body_hash'],$hash))fail('El contenido cambió. Prepara un nuevo envío.',409);respond(['reference'=>$prior['reference']]);}
    $v=json_decode($raw,true,64,JSON_THROW_ON_ERROR);if(!is_array($v))fail('Solicitud inválida.');$v=validateSubmission($v);unset($raw);
    throttle('requests',3600,20);$catalog=catalog();$products=[];foreach($catalog['products'] as $p)if(($p['state']??'')!=='INACTIVO')$products[$p['id']]=$p;
    $items=[];foreach($v['items'] as $i){
        $p=$products[$i['productId']]??null;$price=$p['price']??null;$currency=$p['currency']??'PEN';$fx=$catalog['exchangeRate']['rate'];
        $suggestions=[];foreach($i['suggestionIds'] as $id)if(isset($products[$id]))$suggestions[]=['id'=>$id,'title'=>$products[$id]['title']];
        $items[]=array_merge($i,['title'=>$p['title']??$i['query'],'productId'=>$p['id']??null,'pending'=>!$p,'brand'=>$p['brand']??'','sku'=>$p['sku']??'','saleUnit'=>$p['unit']??'','price'=>$price,'currency'=>$currency,'pricePEN'=>$price===null?null:($currency==='USD'?round($price*$fx,2):$price),'exchangeRate'=>$currency==='USD'?$fx:null,'availability'=>$p['availability']??'','suggestions'=>$suggestions]);
    }
    $ref='ALB-'.gmdate('Ymd').'-'.strtoupper(bin2hex(random_bytes(6)));
    $metadata=array_map(function($f){unset($f['data']);return $f;},$v['attachments']);
    $packet=['reference'=>$ref,'created_at'=>now(),'customer'=>$v['customer'],'items'=>$items,'attachments'=>$metadata,'status'=>'Nueva','agent'=>'','notes'=>'','version'=>0,'retentionClass'=>'no_sale','lastCustomerContact'=>'','privacyVersion'=>'2026-09-15-retention'];
    $sum=summary($packet);if(strlen(jsonValue($packet).jsonValue($sum))>1800000)fail('El texto es demasiado extenso. Adjunta el documento original.');
    $written=[];
    try {
        db()->beginTransaction();query('INSERT INTO requests(reference,idempotency_key,body_hash,data,summary,version,created_at) VALUES(?,?,?,?,?,0,?)',[$ref,$keyHash,$hash,jsonValue($packet),jsonValue($sum),$packet['created_at']]);
        foreach($v['attachments'] as $file){
            $bytes=base64_decode($file['data'],true);if($bytes===false||strlen($bytes)!==$file['size'])fail('Archivo inválido.');
            $path=config()['uploads'].'/'.$file['id'];$fp=fopen($path,'xb');if(!$fp)throw new RuntimeException('Storage unavailable');$written[]=$path;chmod($path,0600);
            $offset=0;while($offset<strlen($bytes)){ $n=fwrite($fp,substr($bytes,$offset));if(!$n){fclose($fp);throw new RuntimeException('Incomplete file');}$offset+=$n; }
            fflush($fp);if(function_exists('fsync'))fsync($fp);fclose($fp);
            query('INSERT INTO request_files(id,reference,name,size,sha256) VALUES(?,?,?,?,?)',[$file['id'],$ref,$file['name'],$file['size'],hash('sha256',$bytes)]);unset($bytes);
        }
        db()->commit();
    } catch(Throwable $e){
        if(db()->inTransaction())db()->rollBack();foreach($written as $path)if(is_file($path))unlink($path);
        $prior=query('SELECT reference,body_hash FROM requests WHERE idempotency_key=?',[$keyHash])->fetch();
        if($prior){if(hash_equals($prior['body_hash'],$hash))respond(['reference'=>$prior['reference']]);fail('El contenido cambió. Prepara un nuevo envío.',409);}throw $e;
    }
    respond(['reference'=>$ref],201);
}
function requestRoutes(string $path,string $method): never {
    if($path==='/requests'&&$method==='GET'){
        $rows=[];foreach(query('SELECT summary,version FROM requests ORDER BY created_at DESC') as $r){$p=json_decode($r['summary'],true);$p['version']=(int)$r['version'];$rows[]=$p;}respond(['requests'=>$rows]);
    }
    if(preg_match('#^/requests/(ALB-[A-Z0-9-]+)/files/([a-f0-9]{32})$#D',$path,$m)&&$method==='GET'){
        $f=query('SELECT * FROM request_files WHERE reference=? AND id=?',[$m[1],$m[2]])->fetch();if(!$f)fail('Archivo no encontrado.',404);
        $file=config()['uploads'].'/'.$f['id'];if(!is_file($file)||filesize($file)!==(int)$f['size'])fail('Archivo no disponible.',503);
        header('Content-Type: application/octet-stream');header("Content-Disposition: attachment; filename*=UTF-8''".rawurlencode($f['name']));header('Content-Length: '.$f['size']);readfile($file);exit;
    }
    if(!preg_match('#^/requests/(ALB-[A-Z0-9-]+)$#D',$path,$m))fail('Ruta no disponible.',404);
    $r=query('SELECT data,version FROM requests WHERE reference=?',[$m[1]])->fetch();if(!$r)fail('Solicitud no encontrada.',404);
    $p=json_decode($r['data'],true);$p['version']=(int)$r['version'];if($method==='GET')respond($p);
    if($method==='PATCH'){
        $v=input();if(!in_array($v['status']??null,['Nueva','En atención','Cotización parcial','Cotizada','Terminada','Cerrada'],true))fail('Estado inválido.');
        if(($v['version']??null)!==$p['version'])fail('Actualiza la solicitud antes de guardar.',409);
        $before=$p;$p=updateRetention($p,$v);$p['status']=$v['status'];$p['agent']=text($v['agent']??'',100);$p['notes']=text($v['notes']??'',4000);$p['updatedBy']=$GLOBALS['actor']['username'];$p['updatedAt']=now();$p['version']++;
        db()->beginTransaction();$q=query('UPDATE requests SET data=?,summary=?,version=version+1 WHERE reference=? AND version=?',[jsonValue($p),jsonValue(summary($p)),$p['reference'],$v['version']]);
        if(!$q->rowCount())fail('Otro asesor actualizó la solicitud. Actualiza el panel.',409);audit('request',$p['reference'],$before,$p);db()->commit();respond($p);
    }
    fail('Ruta no disponible.',404);
}
