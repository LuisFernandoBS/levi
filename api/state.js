import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const COOKIE_NAME = 'levi_session';
const TABLE_URL = '/rest/v1/levi_state';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(data);
}

function hasRequiredConfig() {
  return Boolean(
    process.env.SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY
    && process.env.LEVI_SHARED_PASSWORD?.length >= 16
    && process.env.LEVI_SESSION_SECRET?.length >= 32
  );
}

function safeEqual(a, b) {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

function originIsSame(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    return url.host === host && (url.protocol === 'https:' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

function signature(expires) {
  return createHmac('sha256', process.env.LEVI_SESSION_SECRET)
    .update(`levi:${expires}`)
    .digest('base64url');
}

function sessionCookie(req) {
  const cookie = req.headers.cookie || '';
  const entry = cookie.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return null;

  const [expires, provided] = entry.slice(COOKIE_NAME.length + 1).split('.');
  if (!/^\d+$/.test(expires) || Number(expires) <= Math.floor(Date.now() / 1000) || !provided) return null;
  return safeEqual(provided, signature(expires)) ? expires : null;
}

function setSessionCookie(res, expires) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${expires}.${signature(expires)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

function supabaseUrl(path) {
  return `${process.env.SUPABASE_URL.replace(/\/+$/, '')}${path}`;
}

async function supabaseRequest(path, options = {}) {
  return fetch(supabaseUrl(path), {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...options.headers
    }
  });
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT');
    return json(res, 405, { error: 'Método não permitido.' });
  }
  if (!hasRequiredConfig()) return json(res, 503, { error: 'Configure as variáveis do Supabase, uma senha compartilhada com pelo menos 16 caracteres e um segredo de sessão com pelo menos 32 caracteres no Vercel.' });
  if (req.method !== 'GET' && !originIsSame(req)) return json(res, 403, { error: 'Origem da solicitação não permitida.' });

  if (req.method === 'POST') {
    const { action, password } = req.body || {};
    if (action === 'logout') {
      clearSessionCookie(res);
      return json(res, 200, { ok: true });
    }
    if (action !== 'login' || typeof password !== 'string') {
      return json(res, 400, { error: 'Solicitação de acesso inválida.' });
    }
    if (!safeEqual(password, process.env.LEVI_SHARED_PASSWORD)) {
      return json(res, 401, { error: 'Senha incorreta.' });
    }
    const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
    setSessionCookie(res, expires);
    return json(res, 200, { ok: true });
  }

  if (!sessionCookie(req)) return json(res, 401, { error: 'Faça login para acessar os dados.' });

  try {
    if (req.method === 'GET') {
      const response = await supabaseRequest(`${TABLE_URL}?id=eq.main&select=data`);
      if (!response.ok) {
        console.error('Supabase load failed:', response.status, await response.text());
        return json(res, 502, { error: 'Não foi possível carregar os dados do Supabase.' });
      }
      const rows = await response.json();
      return json(res, 200, { data: rows[0]?.data || null });
    }

    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!data || data.v !== 1 || !Array.isArray(data.items) || !Array.isArray(data.guests)) {
      return json(res, 400, { error: 'Formato de dados inválido.' });
    }
    if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 1024 * 1024) {
      return json(res, 413, { error: 'Os dados ultrapassam o limite permitido.' });
    }

    const response = await supabaseRequest(`${TABLE_URL}?on_conflict=id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ id: 'main', data, updated_at: new Date().toISOString() })
    });
    if (!response.ok) {
      console.error('Supabase save failed:', response.status, await response.text());
      return json(res, 502, { error: 'Não foi possível salvar os dados no Supabase.' });
    }
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('State API failed:', error);
    return json(res, 502, { error: 'Falha ao comunicar com o Supabase.' });
  }
}
