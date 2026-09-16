import { deserialize } from '../src/engine/codec';

export interface Env {
  ASSETS: Fetcher;
  SHARES: KVNamespace;
  SHARE_LIMIT: RateLimit;
}

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const MAX_BODY = 4096;

function slug(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('');
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replaceAll('-', '+').replaceAll('_', '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function validPiece(encoded: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(encoded)) return false;
  try {
    const stream = new DecompressionStream('deflate-raw');
    const writer = stream.writable.getWriter();
    void writer.write(fromBase64Url(encoded));
    void writer.close();
    const bytes = new Uint8Array(await new Response(stream.readable).arrayBuffer());
    deserialize(bytes);
    return true;
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function share(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const { success } = await env.SHARE_LIMIT.limit({ key: ip });
  if (!success) return json({ error: 'too many shares, try again in a minute' }, 429);
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY) return json({ error: 'too large' }, 413);
  let encoded: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
    encoded = (JSON.parse(text) as { p?: unknown }).p;
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  if (typeof encoded !== 'string' || !(await validPiece(encoded)))
    return json({ error: 'not a piece' }, 400);
  for (let attempt = 0; attempt < 4; attempt++) {
    const s = slug();
    if (await env.SHARES.get(s)) continue;
    await env.SHARES.put(s, encoded);
    return json({ slug: s });
  }
  return json({ error: 'try again' }, 503);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/share') {
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      return share(request, env);
    }
    const m = /^\/s\/([a-z2-9]{6})$/.exec(url.pathname);
    if (m) {
      const encoded = await env.SHARES.get(m[1] ?? '');
      if (!encoded) return new Response('not found', { status: 404 });
      return Response.redirect(`${url.origin}/#p=${encoded}`, 302);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
