import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ZodError } from 'zod';
import { ApiError, type ActiveTabJobService } from './active-tab-service.js';
import { ConflictError } from './checkpoints.js';

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  response.end(JSON.stringify(body));
}
async function body(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new ApiError(415, 'json_required');
  let bytes = 0;
  const parts: Buffer[] = [];
  for await (const part of request) {
    const chunk: unknown = part;
    if (!(chunk instanceof Uint8Array)) throw new ApiError(400, 'invalid_body');
    bytes += chunk.byteLength;
    if (bytes > 10_000_000) throw new ApiError(413, 'request_too_large');
    parts.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
  } catch {
    throw new ApiError(400, 'invalid_json');
  }
}
export function createApi(
  service: ActiveTabJobService,
  origins: ReadonlySet<string>,
  metric: (status: number) => void = () => undefined,
) {
  const limits = new Map<string, { count: number; until: number }>();
  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/health' && request.method === 'GET') {
      send(response, 200, { status: 'ok', version: '2.0' });
      return;
    }
    const origin = request.headers.origin;
    if ((origin && !origins.has(origin)) || (!origin && !request.headers.authorization))
      throw new ApiError(403, 'origin_not_allowed');
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
      send(response, 204, null);
      return;
    }
    if (url.search) throw new ApiError(400, 'query_not_allowed');
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const limitKey = createHash('sha256')
      .update(token || request.socket.remoteAddress || 'unknown')
      .digest('hex');
    const now = Date.now();
    for (const [key, item] of limits) if (item.until <= now) limits.delete(key);
    const limit = limits.get(limitKey) ?? { count: 0, until: now + 60_000 };
    limit.count += 1;
    limits.set(limitKey, limit);
    if (limits.size > 10_000 || limit.count > (token ? 180 : 15))
      throw new ApiError(429, 'rate_limited');
    if (url.pathname === '/v2/jobs' && request.method === 'POST') {
      send(response, 201, await service.start(await body(request)));
      return;
    }
    const match = /^\/v2\/jobs\/([a-f0-9-]{36})(?:\/(observe|receipts|pause|chat|mappings))?$/.exec(
      url.pathname,
    );
    const jobId = match?.[1];
    const operation = match?.[2];
    if (!jobId) throw new ApiError(404, 'not_found');
    if (request.method === 'GET' && !operation)
      send(response, 200, { job: await service.read(jobId, token) });
    else if (request.method === 'DELETE' && !operation) {
      await service.cancel(jobId, token);
      send(response, 200, { cancelled: true });
    } else if (request.method === 'POST' && operation === 'observe')
      send(response, 200, await service.observe(jobId, token, await body(request)));
    else if (request.method === 'POST' && operation === 'receipts')
      send(response, 200, { job: await service.receipt(jobId, token, await body(request)) });
    else if (request.method === 'POST' && operation === 'chat')
      send(response, 200, await service.chat(jobId, token, await body(request)));
    else if (request.method === 'POST' && operation === 'pause')
      send(response, 200, { job: await service.pause(jobId, token) });
    else if (request.method === 'POST' && operation === 'mappings')
      send(response, 200, await service.approveMappings(jobId, token, await body(request)));
    else throw new ApiError(404, 'not_found');
  }
  const server = createServer((request, response) => {
    response.once('finish', () => metric(response.statusCode));
    void route(request, response).catch((error: unknown) => {
      const status =
        error instanceof ApiError
          ? error.status
          : error instanceof ConflictError
            ? 409
            : error instanceof ZodError
              ? 400
              : 503;
      const code =
        error instanceof ApiError
          ? error.code
          : error instanceof ConflictError
            ? 'revision_conflict'
            : error instanceof ZodError
              ? 'invalid_payload'
              : 'service_unavailable';
      send(response, status, { error: code });
    });
  });
  server.requestTimeout = 180_000;
  server.headersTimeout = 15_000;
  return server;
}
