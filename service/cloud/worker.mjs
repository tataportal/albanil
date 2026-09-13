import {catalog,editProduct} from './catalog.mjs';
import {submitRequest,privateRequests} from './requests.mjs';
const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export function validRate(rate) {
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0.0001 && rate <= 100 && Math.abs(rate * 10000 - Math.round(rate * 10000)) < 1e-7;
}
async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('Formato inválido.');
  const text = await request.text();
  if (text.length > 2048) throw new Error('Solicitud demasiado grande.');
  return JSON.parse(text);
}
async function session(request, env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /,'') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await sha(token);
  return await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?').bind(hash,Date.now()).first();
}
async function handle(request, env) {
  const path = new URL(request.url).pathname;
  if(path==='/api/health'&&request.method==='GET')return json({requests:true});
  if(path==='/api/catalog'&&request.method==='GET')return json(await catalog(env));
  if(path==='/api/requests'&&request.method==='POST')return submitRequest(request,env,json);
  if (path === '/api/exchange-rate' && request.method === 'GET') {
    return json(await env.DB.prepare('SELECT rate,version,updated_at FROM exchange_rate WHERE id=1').first());
  }
  if (request.method === 'POST' && path === '/api/login') {
    if (!env.ADMIN_PASSWORD_HASH) return json({error:'Acceso todavía no configurado.'},503);
    const input = await body(request);
    const now = Date.now(), bucket = Math.floor(now / 900000);
    const key = await sha((request.headers.get('CF-Connecting-IP') || 'unknown') + ':' + bucket);
    // Count attempts atomically, including concurrent requests. Store no raw IPs.
    const attempt = await env.DB.prepare('INSERT INTO login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,now+1800000).first();
    if (attempt.attempts > 8) return json({error:'Demasiados intentos. Vuelve a intentar en 15 minutos.'},429);
    if (input.username !== (env.ADMIN_USERNAME || 'administrador') || typeof input.password !== 'string' || input.password.length > 200 || await sha(input.password) !== env.ADMIN_PASSWORD_HASH) return json({error:'Usuario o contraseña incorrectos.'},401);
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(now),
      env.DB.prepare('DELETE FROM login_attempts WHERE expires_at<?').bind(now),
      env.DB.prepare('INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)').bind(await sha(token),now+8*3600000)
    ]);
    return json({token});
  }
  const currentSession = await session(request,env);
  if (!currentSession) return json({error:'Inicia sesión para guardar los cambios.'},401);
  if(path==='/api/products'&&request.method==='GET')return json({products:(await catalog(env)).products});
  const product=path.match(/^\/api\/products\/(\d+)$/);
  if(product&&request.method==='PATCH')return editProduct(request,env,Number(product[1]),json);
  if(path.startsWith('/api/requests')){const response=await privateRequests(request,env,path,json);if(response)return response;}
  if (request.method === 'POST' && path === '/api/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(currentSession.token_hash).run();
    return json({ok:true});
  }
  if (request.method === 'PATCH' && path === '/api/exchange-rate') {
    const input = await body(request);
    if (!validRate(input.rate) || !Number.isSafeInteger(input.version) || input.version < 0) return json({error:'Ingresa un tipo de cambio positivo, hasta 100 y con máximo 4 decimales.'},400);
    const updated = new Date().toISOString();
    const results = await env.DB.batch([
      env.DB.prepare('INSERT INTO exchange_audit(previous_rate,rate,version,updated_at) SELECT rate,?,version+1,? FROM exchange_rate WHERE id=1 AND version=?').bind(input.rate,updated,input.version),
      env.DB.prepare('UPDATE exchange_rate SET rate=?,version=version+1,updated_at=? WHERE id=1 AND version=? RETURNING rate,version,updated_at').bind(input.rate,updated,input.version)
    ]);
    if (!results[1].results.length) return json({error:'Otra persona actualizó el tipo de cambio. Recarga el panel antes de guardar.'},409);
    return json(results[1].results[0]);
  }
  return json({error:'Ruta no disponible.'},404);
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    const allowed=(env.ALLOWED_ORIGINS || '').split(',').includes(origin);
    // Public reads work without credentials; writes require both an allowed origin and a session.
    if (origin && !allowed || !['GET','HEAD'].includes(request.method) && !allowed) return json({error:'Origen no autorizado.'},403);
    let response;
    if (request.method==='OPTIONS') response=new Response(null,{status:204});
    else {
      try { response=await handle(request,env); }
      catch(error) { response=json({error:error.status===400?error.message:error instanceof SyntaxError?'Solicitud inválida.':'No pudimos guardar. Inténtalo nuevamente.'},error.status|| (error instanceof SyntaxError?400:500)); }
    }
    if(allowed) {
      response.headers.set('Access-Control-Allow-Origin',origin);
      response.headers.set('Vary','Origin');
      response.headers.set('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');
      response.headers.set('Access-Control-Allow-Headers','Content-Type,Authorization,Idempotency-Key');
      response.headers.set('Access-Control-Max-Age','600');
    }
    return response;
  }
};
