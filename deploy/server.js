// Self-hosted API server (deploy/Dockerfile): serves the API routes that
// `expo export --platform web --api-only` puts into dist/server, with expo-server's Node adapter.
// Only /api/* reaches the routes; /healthz answers the container health check. CommonJS, as in
// the Expo docs: the adapter loads the route bundles with require().
const { createServer } = require('node:http');
const path = require('node:path');
const { createRequestHandler } = require('expo-server/adapter/http');

process.env.NODE_ENV = 'production';

const PORT = Number(process.env.PORT || 3000);
// Relative to the working directory, /app in the image.
const BUILD_DIR = path.resolve(process.env.SERVER_BUILD_DIR || 'dist/server');
// `true` only behind a reverse proxy that sets X-Real-IP itself (Caddy in compose.yaml).
// Otherwise a client could pick its own address and slip past the per-IP limit (SPEC §8.3).
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
// Longer than the proxy keeps an idle upstream connection, so the proxy never reuses one this
// server has just closed (a 502 race).
const KEEP_ALIVE_MS = 65_000;
const SHUTDOWN_GRACE_MS = 90_000;

const handleApi = createRequestHandler({ build: BUILD_DIR });

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  if (!pathname.startsWith('/api/')) {
    res.writeHead(404).end();
    return;
  }
  if (!TRUST_PROXY) useSocketAddress(req);
  closeIfAnsweredEarly(req, res);
  handleApi(req, res, (error) => {
    logError(error);
    // No SPEC §7.2 body: the app reads a bare 5xx as `unavailable`, as on EAS Hosting.
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

server.keepAliveTimeout = KEEP_ALIVE_MS;
server.headersTimeout = KEEP_ALIVE_MS + 1_000;

server.listen(PORT, () => {
  console.info(JSON.stringify({ event: 'server.start', port: PORT, trustProxy: TRUST_PROXY }));
});

// `docker compose up` replaces the container with SIGTERM: stop taking requests and let the ones
// in flight (an analysis waits up to 90 s for the model) finish.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    console.info(JSON.stringify({ event: 'server.stop', signal }));
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
  });
}

/** Replaces client-supplied forwarding headers with the address of the TCP peer. */
function useSocketAddress(req) {
  const dropped = new Set(['x-real-ip', 'x-forwarded-for', 'cf-ray']);
  const headers = [];
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (dropped.has(req.rawHeaders[index].toLowerCase())) continue;
    headers.push(req.rawHeaders[index], req.rawHeaders[index + 1]);
  }
  const address = req.socket.remoteAddress;
  if (address) headers.push('X-Real-IP', address.replace(/^::ffff:/, ''));
  // The adapter builds the Fetch Request from rawHeaders.
  Object.defineProperty(req, 'rawHeaders', { value: headers });
}

/**
 * A route can answer before it reads the upload (429, 426, 413 by Content-Length). Node then
 * stops reading the body, since the adapter holds it as a web stream, and the connection would
 * stay open with the rest of the body unread: the proxy's next request on it hangs. Such a
 * response closes the connection instead.
 */
function closeIfAnsweredEarly(req, res) {
  const writeHead = res.writeHead;
  res.writeHead = function (...args) {
    if (!req.complete) this.setHeader('Connection', 'close');
    return writeHead.apply(this, args);
  };
}

/**
 * Name and stack frames only, never the message: messages can quote a document (SPEC §7.1).
 * Route handlers already rethrow redacted errors; this covers failures inside the adapter.
 */
function logError(error) {
  const name = error instanceof Error ? error.name : typeof error;
  const frames = error instanceof Error ? (error.stack ?? '').split('\n').filter(isFrame) : [];
  console.error([`${name}: [message redacted]`, ...frames].join('\n'));
}

function isFrame(line) {
  return /^\s+at\s/.test(line);
}
