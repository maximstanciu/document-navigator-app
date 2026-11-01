/**
 * The client's IP address as the server in deploy/ forwards it: `X-Real-IP` (Caddy sets it from
 * the connection, or deploy/server.js does), else the first hop of `X-Forwarded-For`. `unknown` on
 * the dev server, where neither is set.
 */
export function readClientIp(headers: Headers): string {
  const realIp = headers.get('X-Real-IP')?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}
