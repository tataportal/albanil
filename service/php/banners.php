<?php
declare(strict_types=1);
function bannerDefaults(): array {return [
 'home-desktop'=>['label'=>'Inicio · escritorio','url'=>'assets/banner-2-linked.webp','width'=>1803,'height'=>509,'version'=>0],
 'home-mobile'=>['label'=>'Inicio · celular','url'=>'assets/banner-mobile-2.webp','width'=>902,'height'=>981,'version'=>0],
 'nosotros-desktop'=>['label'=>'Nosotros · escritorio','url'=>'assets/banner-nosotros-3.webp','width'=>2000,'height'=>1000,'version'=>0],
 'nosotros-mobile'=>['label'=>'Nosotros · celular','url'=>'assets/banner-nosotros-3.webp','width'=>2000,'height'=>1000,'version'=>0]];}
function bannerDir(): string {return dirname(__DIR__,3).'/nueva-private/banners';}
function bannerList(): array {$file=bannerDir().'/manifest.json';$stored=is_file($file)?json_decode(file_get_contents($file),true,64,JSON_THROW_ON_ERROR):[];return array_replace(bannerDefaults(),$stored);}
function saveBanner(string $key): never {
 requirePermission('banners');if(!isset(bannerDefaults()[$key]))fail('Banner no encontrado.',404);
 $v=input(8*1024*1024);$photo=productPhoto($v['photo']??null);$info=getimagesizefromstring($photo['bytes']);
 $dir=bannerDir();if(!is_dir($dir)&&!mkdir($dir,0700,true))fail('No se pudo guardar la imagen.',503);
 $lock=fopen($dir.'/lock','c');if(!$lock||!flock($lock,LOCK_EX))fail('Inténtalo nuevamente.',503);
 try{
  $all=bannerList();$old=$all[$key];if(($v['version']??null)!==$old['version'])fail('Este banner cambió. Actualiza el panel antes de guardarlo.',409);
  $file=$dir.'/'.$photo['hash'];if(!is_file($file)){if(file_put_contents($file,$photo['bytes'],LOCK_EX)!==strlen($photo['bytes']))fail('No se pudo guardar la imagen.',503);chmod($file,0600);}
  $next=['label'=>$old['label'],'url'=>'api/banner-images/'.$photo['hash'],'width'=>$info[0],'height'=>$info[1],'version'=>$old['version']+1,'updated_at'=>now()];
  $all[$key]=$next;$temp=tempnam($dir,'manifest-');
  try{if(file_put_contents($temp,jsonValue($all))===false)fail('No se pudo guardar el banner.',503);chmod($temp,0600);audit('banner',$key,$old,$next);if(!rename($temp,$dir.'/manifest.json'))fail('No se pudo publicar el banner.',503);}finally{if(is_file($temp))unlink($temp);}
 }finally{flock($lock,LOCK_UN);fclose($lock);}
 respond($next);
}
function bannerImage(string $hash): never {
 $file=bannerDir().'/'.$hash;if(!is_file($file))fail('Imagen no encontrada.',404);
 $info=getimagesize($file);header('Content-Type: '.$info['mime']);header('Cache-Control: public, max-age=31536000, immutable');header('Content-Length: '.filesize($file));readfile($file);exit;
}
