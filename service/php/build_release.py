"""Build the parallel client release; never package credentials or customer files."""
import argparse,json,re,shutil,hashlib,zipfile
from pathlib import Path
from urllib.parse import urlsplit,unquote
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--snapshot',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
out=args.output.resolve();out.mkdir(parents=True,exist_ok=True);target=out/'nueva'
if target.exists():shutil.rmtree(target)
shutil.copytree(ROOT/'docs/propuesta',target,ignore=shutil.ignore_patterns('*test*','demo*','.DS_Store'))
catalog=json.loads(args.snapshot.read_text())['catalog']
def shared(path):
 clean=unquote(urlsplit(path).path)
 if not clean.startswith('../'):return path
 relative=clean[3:];source=(ROOT/'docs'/relative).resolve();assert source.is_relative_to(ROOT/'docs') and source.is_file(),path
 dest=target/'assets/legacy'/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
 return 'assets/legacy/'+relative
for product in catalog['products']:
 for key in ['image','imageSmall']:
  if product.get(key):product[key]=shared(product[key])
 product['url']='?producto='+str(product['id'])
for c in catalog['categories']:c['url']='?categoria='+str(c['id'])
(target/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')))
for path in [target/'index.html',target/'home.js']:
 s=path.read_text()
 for asset in set(re.findall(r'\.\./(?:images/[^\s"\'<>]+|logo_pro\.jpg|favicon\.png|missing-image\.svg)',s)):
  s=s.replace(asset,shared(asset))
 s=s.replace('href="../buscar.html"','href="https://wa.me/51968406042"').replace('consultar las fichas de referencia','consultar con un asesor')
 path.write_text(s)
s=(target/'admin/index.html').read_text()
for asset in ['logo_pro.jpg','favicon.png']:
 shared('../'+asset);s=s.replace('../../'+asset,'../assets/legacy/'+asset)
(target/'admin/index.html').write_text(s)
s=(target/'settings.js').read_text().replace("api:'https://albanil-settings.tatayamigos.workers.dev'", "api:location.origin+'/nueva'")
(target/'settings.js').write_text(s)
api=target/'api';api.mkdir()
for name in ['index.php','lib.php','products.php','complaints.php','retention.php','maintenance-schema.sql','complaints-schema.sql','schema.sql','.htaccess']:shutil.copy2(ROOT/'service/php'/name,api/name)
(target/'.htaccess').write_text('''Options -Indexes
DirectoryIndex index.html
AddHandler application/x-httpd-ea-php83 .php
<IfModule mod_headers.c>
Header always set X-Content-Type-Options "nosniff"
</IfModule>
''')
(target/'.user.ini').write_text('''display_errors = Off
log_errors = On
error_log = /home/albanil/nueva-private/php-error.log
memory_limit = 256M
post_max_size = 32M
upload_max_filesize = 10M
max_file_uploads = 5
max_execution_time = 90
''')
# All product image references must resolve inside the release.
for product in catalog['products']:
 for key in ['image','imageSmall']:
  if product.get(key):assert (target/product[key]).is_file(),(product['id'],product[key])
files=[f for f in target.rglob('*') if f.is_file()]
manifest={str(f.relative_to(target)):hashlib.sha256(f.read_bytes()).hexdigest() for f in files}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
with zipfile.ZipFile(out/'nueva-release.zip','w',zipfile.ZIP_DEFLATED,compresslevel=2) as z:
 for f in files:z.write(f,f.relative_to(out))
print('Release:',len(files),'files;',sum(f.stat().st_size for f in files),'bytes;',len(catalog['products']),'products')
