<?php
declare(strict_types=1);
function newProductData(array $v,array $catalog): array {
    $title=text($v['title']??'',200,true);$category=text($v['category']??'',120,true);
    if(!in_array($category,array_column($catalog['categories'],'name'),true))fail('Selecciona una categoría del catálogo.');
    $unit=$v['unit']??'';$currency=$v['currency']??'';$tax=$v['tax']??'';
    if(!in_array($unit,['unidad','par','caja','bolsa','rollo','tubo','plancha','tarro','millar','metro','kg','litro','m2','m3','varilla','envase','saco','hoja','cartucho','lata','galon','juego'],true)||!in_array($currency,['PEN','USD'],true)||!in_array($tax,['incluido','no_incluido'],true))fail('Selecciona unidad, moneda e IGV.');
    $price=$v['price']??null;$stock=$v['stock']??null;
    if(!is_numeric($price)||!is_finite((float)$price)||$price<=0||$price>999999||abs((float)$price*100-round((float)$price*100))>1e-6)fail('Ingresa un precio positivo con máximo dos decimales.');
    if(!is_numeric($stock)||!is_finite((float)$stock)||$stock<0||$stock>999999||abs((float)$stock*100-round((float)$stock*100))>1e-6||(!in_array($unit,['metro','kg','litro','m2','m3'],true)&&(float)$stock!==floor((float)$stock)))fail('Revisa las existencias para esta unidad de venta.');
    if(!in_array($v['state']??'', ['ACTIVO','INACTIVO'],true))fail('Selecciona el estado de publicación.');
    $sku=text($v['sku']??'',80);if($sku!=='')foreach($catalog['products'] as $p)if(mb_strtolower($p['sku']??'')===mb_strtolower($sku))fail('Este SKU ya existe. Busca el producto y edítalo.',409);
    $group='';foreach($catalog['groups'] as $g)if(in_array($category,$g['types']??[],true)){$group=$g['id'];break;}
    return ['title'=>$title,'category'=>$category,'brand'=>text($v['brand']??'',100),'specifications'=>text($v['specifications']??'',2000),'sku'=>$sku,'unit'=>$unit,'currency'=>$currency,'tax'=>$tax,'price'=>(float)$price,'stock'=>(float)$stock,'availability'=>$stock>0?'Disponible':'Agotado','state'=>$v['state'],'group'=>$group,'referencePriceCents'=>null,'dataUpdatedAt'=>now(),'createdInPanel'=>true];
}
function productPhoto($encoded): array {
    if(!is_string($encoded)||strlen($encoded)>6990508)fail('Carga una foto JPG, PNG o WebP de hasta 5 MB.');
    $bytes=base64_decode($encoded,true);if($bytes===false||strlen($bytes)<1||strlen($bytes)>5*1024*1024)fail('La foto no es válida.');
    $info=@getimagesizefromstring($bytes);$mime=$info['mime']??'';
    if(!$info||!in_array($mime,['image/jpeg','image/png','image/webp'],true)||$info[0]>6000||$info[1]>6000)fail('Usa una foto JPG, PNG o WebP de hasta 6000 × 6000 píxeles.');
    return ['bytes'=>$bytes,'mime'=>$mime,'hash'=>hash('sha256',$bytes)];
}
function createProduct(): never {
    $raw=rawBody(8*1024*1024);$v=json_decode($raw,true,64,JSON_THROW_ON_ERROR);if(!is_array($v))fail('Datos inválidos.');
    $key=$_SERVER['HTTP_IDEMPOTENCY_KEY']??'';if(!preg_match('/^[A-Za-z0-9-]{16,80}$/D',$key))fail('Vuelve a abrir el formulario.');
    $key=hash('sha256',$key);$hash=hash('sha256',$raw);$photo=productPhoto($v['photo']??null);
    if((int)query("SELECT GET_LOCK('albanil_new_product',10)")->fetchColumn()!==1)fail('Otro producto se está guardando. Inténtalo nuevamente.',409);
    try {
        foreach(query('SELECT id,data FROM product_overrides') as $row){$stored=json_decode($row['data'],true);if(($stored['creationKey']??'')===$key){if(($stored['creationHash']??'')!==$hash)fail('El formulario cambió. Vuelve a abrirlo.',409);$id=(int)$row['id'];$result=null;foreach(catalog()['products'] as $p)if($p['id']===$id)$result=$p;break;}}
        if(!isset($result)){
            $catalog=catalog();$data=newProductData($v,$catalog);$id=max(array_column($catalog['products'],'id'))+1;
            $dir=dirname(__DIR__,3).'/nueva-private/product-images';if(!is_dir($dir)&&!mkdir($dir,0700,true))fail('No se pudo guardar la foto.',503);
            $file=$dir.'/'.$photo['hash'];if(!is_file($file)){if(file_put_contents($file,$photo['bytes'],LOCK_EX)!==strlen($photo['bytes']))fail('No se pudo guardar la foto.',503);chmod($file,0600);}
            $data=array_merge($data,['id'=>$id,'reference'=>(string)$id,'url'=>'?producto='.$id,'image'=>'api/products/'.$id.'/image','imageSmall'=>'api/products/'.$id.'/image','creationKey'=>$key,'creationHash'=>$hash,'photoHash'=>$photo['hash'],'photoMime'=>$photo['mime']]);
            db()->beginTransaction();query('INSERT INTO product_overrides(id,data,version) VALUES(?,?,1)',[$id,jsonValue($data)]);audit('product',(string)$id,null,$data);db()->commit();
            foreach(['creationKey','creationHash','photoHash','photoMime'] as $field)unset($data[$field]);$result=array_merge($data,['version'=>1]);
        }
    } finally {query("SELECT RELEASE_LOCK('albanil_new_product')");}
    respond($result,201);
}
function productImage(int $id): never {
    $raw=query('SELECT data FROM product_overrides WHERE id=?',[$id])->fetchColumn();$p=$raw?json_decode($raw,true):[];$hash=$p['photoHash']??'';
    if(!preg_match('/^[a-f0-9]{64}$/D',$hash))fail('Imagen no encontrada.',404);
    $file=dirname(__DIR__,3).'/nueva-private/product-images/'.$hash;if(!is_file($file))fail('Imagen no encontrada.',404);
    header('Content-Type: '.$p['photoMime']);header('Cache-Control: public, max-age=3600');header('Content-Length: '.filesize($file));readfile($file);exit;
}
