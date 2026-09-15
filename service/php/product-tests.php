<?php
// Pure validation tests; invoked by a private deployment check, not a public route.
function runProductTests(): array {
 $cat=['products'=>[['id'=>4,'sku'=>'EXISTENTE']],'categories'=>[['name'=>'HERRAMIENTAS']],'groups'=>[['id'=>'herramientas','types'=>['HERRAMIENTAS']]]];
 $v=['title'=>'Martillo','category'=>'HERRAMIENTAS','brand'=>'','unit'=>'unidad','price'=>'12.50','currency'=>'USD','tax'=>'incluido','stock'=>'4','state'=>'INACTIVO'];$passed=[];
 $p=newProductData($v,$cat);if($p['price']!==12.5||$p['currency']!=='USD'||$p['stock']!==4.0||$p['group']!=='herramientas')throw new RuntimeException('Valid product failed');$passed[]='USD preserved and category mapped';
 foreach(['fractional stock'=>['stock'=>'1.54'],'negative stock'=>['stock'=>'-1'],'invalid price'=>['price'=>'0'],'excess price precision'=>['price'=>'1.234'],'unknown category'=>['category'=>'UNKNOWN'],'existing SKU'=>['sku'=>'existente'],'empty name'=>['title'=>''],'invalid currency'=>['currency'=>'EUR']] as $name=>$change){$caught=false;try{newProductData(array_merge($v,$change),$cat);}catch(DomainException $e){$caught=true;}if(!$caught)throw new RuntimeException($name);$passed[]=$name.' rejected';}
 $p=newProductData(array_merge($v,['unit'=>'metro','stock'=>'1.54']),$cat);if($p['stock']!==1.54)throw new RuntimeException('Measured stock');$passed[]='measured stock accepted';
 $caught=false;try{productPhoto(base64_encode('<?php echo 1;'));}catch(DomainException $e){$caught=true;}if(!$caught)throw new RuntimeException('Invalid photo');$passed[]='non-image rejected';
 return $passed;
}
