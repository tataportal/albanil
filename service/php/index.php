<?php
declare(strict_types=1);
require __DIR__.'/lib.php';
require __DIR__.'/products.php';
require __DIR__.'/banners.php';
require __DIR__.'/complaints.php';
require __DIR__.'/retention.php';
header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');
try {
    $method=$_SERVER['REQUEST_METHOD'];$origin=$_SERVER['HTTP_ORIGIN']??'';
    if(($origin!==''&&!in_array($origin,config()['origins'],true))||(!in_array($method,['GET','HEAD'])&&$origin===''))fail('Origen no autorizado.',403);
    if($origin!==''){header('Access-Control-Allow-Origin: '.$origin);header('Vary: Origin');header('Access-Control-Allow-Methods: GET,POST,PATCH,OPTIONS');header('Access-Control-Allow-Headers: Content-Type,Authorization,Idempotency-Key');}
    if($method==='OPTIONS'){http_response_code(204);exit;}
    $uri=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);$prefix=config()['base_path'].'/api';
    if(!str_starts_with($uri,$prefix))fail('Ruta no disponible.',404);$path=substr($uri,strlen($prefix));
    if($path==='/health'&&$method==='GET'){rate();respond(['requests'=>true,'productCreation'=>true]);}
    if($path==='/exchange-rate'&&$method==='GET')respond(rate());
    if($path==='/catalog'&&$method==='GET')respond(catalog());
    if($path==='/requests'&&$method==='POST')submitRequest();
    if($path==='/complaints'&&$method==='POST')submitComplaint();
    if($path==='/login'&&$method==='POST'){
        $v=input(2048);throttle('login',900,8);$password=text($v['password']??'',200);$c=config();
        $u=userAccount(text($v['username']??'',100));
        $hash=hash_pbkdf2('sha256',$password,hex2bin($u['salt']??$c['admin_salt']),600000,64,false);
        if(!$u||!hash_equals($u['hash'],$hash))fail('Usuario o contraseña incorrectos.',401);
        $token=bin2hex(random_bytes(32));query('DELETE FROM sessions WHERE expires_at<?',[time()]);query('DELETE FROM attempts WHERE expires_at<?',[time()]);
        query('INSERT INTO sessions(token_hash,expires_at,username) VALUES(?,?,?)',[hash('sha256',$token),time()+8*3600,$u['username']]);respond(['token'=>$token,'user'=>publicUser($u)]);
    }
    if(preg_match('#^/products/(\d+)/image$#D',$path,$m)&&$method==='GET')productImage((int)$m[1]);
    if($path==='/banners'&&$method==='GET')respond(bannerList());
    if(preg_match('#^/banner-images/([a-f0-9]{64})$#D',$path,$m)&&$method==='GET')bannerImage($m[1]);
    $session=sessionHash();
    if(preg_match('#^/banners/([a-z-]+)$#D',$path,$m)&&$method==='PATCH')saveBanner($m[1]);
    if($path==='/logout'&&$method==='POST'){query('DELETE FROM sessions WHERE token_hash=?',[$session]);respond(['ok'=>true]);}
    if($path==='/me'&&$method==='GET')respond(publicUser($GLOBALS['actor']));
    if(str_starts_with($path,'/products'))requirePermission('products');
    if($path==='/exchange-rate')requirePermission('exchange');
    if(str_starts_with($path,'/requests'))requirePermission('requests');
    if($path==='/products'&&$method==='POST')createProduct();
    if($path==='/products'&&$method==='GET')respond(['products'=>catalog()['products']]);
    if($path==='/exchange-rate'&&$method==='PATCH')changeRate();
    if(preg_match('#^/products/(\d+)$#D',$path,$m)&&$method==='PATCH')changeProduct((int)$m[1]);
    if(str_starts_with($path,'/requests'))requestRoutes($path,$method);
    if(str_starts_with($path,'/complaints'))complaintRoutes($path,$method);
    fail('Ruta no disponible.',404);
} catch(Throwable $e){
    try { if(db()->inTransaction())db()->rollBack(); } catch(Throwable $ignored){}
    if($e instanceof DomainException)respond(['error'=>$e->getMessage()],$e->getCode()?:400);
    if($e instanceof JsonException)respond(['error'=>'Solicitud inválida.'],400);
    if($e instanceof PDOException && in_array($e->getCode(),['23000','40001'],true))respond(['error'=>'Otro usuario guardó cambios. Actualiza e inténtalo nuevamente.'],409);
    error_log('Albanil API: '.get_class($e).' at '.basename($e->getFile()).':'.$e->getLine());
    respond(['error'=>'No pudimos completar la operación. Inténtalo nuevamente.'],503);
}
