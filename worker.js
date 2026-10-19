/**
 * OPTIONAL Cloudflare Worker proxy example for GitHub Pages -> Apps Script.
 * Configure secret ADF_APPS_SCRIPT_URL in Worker settings with the deployed Apps Script /exec URL.
 *
 * This proxy only handles CORS and forwarding. It is not an authentication system.
 * Do not add permissive wildcard origins for a production deployment.
 */
const ALLOWED_ORIGINS = [
  'https://YOUR-GITHUB-USERNAME.github.io'
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
      if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', {status:403});
      return new Response(null, {status:204, headers:corsHeaders(origin)});
    }
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', {status:403});
    if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) return new Response('Unsupported media type', {status:415});
    const body = await request.text();
    if (body.length > 2_000_000) return new Response('Payload too large', {status:413});
    const upstream = await fetch(env.ADF_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.ok ? 200 : upstream.status,
      headers: {...corsHeaders(origin), 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}
    });
  }
};
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}
