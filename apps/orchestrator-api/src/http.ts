import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { ZodError, z } from 'zod';
import { ApiError, type ActiveTabJobService } from './active-tab-service.js';
import { ConflictError } from './checkpoints.js';
import { diagnosticCode, DiagnosticApiReasonSchema } from '@smartmapper/contracts';
import { untilAborted } from './diagnostics.js';
import type { TrainingService } from './training-service.js';

const { version: buildVersion } = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

function send(response: ServerResponse, status: number, body: unknown): void {
  if (response.writableEnded || response.destroyed) return;
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
    if (bytes > 30_000_000) throw new ApiError(413, 'request_too_large');
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
  operationTimeoutMs = 150_000,
  training?: TrainingService,
) {
  const limits = new Map<string, { count: number; until: number }>();
  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/health' && request.method === 'GET') {
      send(response, 200, { status: 'ok', version: '2.0', buildVersion });
      return;
    }
    const origin = request.headers.origin;
    if ((origin && !origins.has(origin)) || (!origin && !request.headers.authorization))
      throw new ApiError(403, 'origin_not_allowed');
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      response.setHeader(
        'Access-Control-Allow-Headers',
        'authorization,content-type,x-smartmapper-request-id',
      );
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
    if (url.pathname === '/v2/training/sessions' && request.method === 'POST') {
      if (!training) throw new ApiError(503, 'training_unavailable');
      send(response, 201, await training.start(await body(request)));
      return;
    }
    const trainingMatch =
      /^\/v2\/training\/sessions\/([a-f0-9-]{36})(?:\/(pages)(?:\/([a-f0-9-]{36}))?|\/(publish|preview|preview-result|verify|activate|library|recover|open|edit))?$/.exec(
        url.pathname,
      );
    if (trainingMatch) {
      if (!training) throw new ApiError(503, 'training_unavailable');
      const trainingId = trainingMatch[1]!;
      const section = trainingMatch[2];
      const pageId = trainingMatch[3];
      const operation = trainingMatch[4];
      if (request.method === 'GET' && operation === 'library')
        send(response, 200, await training.library(trainingId, token));
      else if (request.method === 'POST' && operation === 'recover')
        send(response, 200, await training.recover(trainingId, token, await body(request)));
      else if (request.method === 'POST' && operation === 'edit')
        send(response, 200, await training.editMapping(trainingId, token, await body(request)));
      else if (request.method === 'POST' && operation === 'open')
        send(response, 200, await training.openMapping(trainingId, token, await body(request)));
      else if (request.method === 'GET' && !section && !operation)
        send(response, 200, { training: await training.read(trainingId, token) });
      else if (request.method === 'DELETE' && !section && !operation) {
        await training.cancel(trainingId, token);
        send(response, 200, { cancelled: true });
      } else if (request.method === 'POST' && section === 'pages' && !pageId)
        send(response, 200, await training.capture(trainingId, token, await body(request)));
      else if (request.method === 'POST' && section === 'pages' && pageId)
        send(
          response,
          200,
          await training.savePage(trainingId, pageId, token, await body(request)),
        );
      else if (request.method === 'POST' && operation === 'preview-result')
        send(response, 200, await training.previewResult(trainingId, token, await body(request)));
      else if (request.method === 'POST' && operation === 'preview')
        send(response, 200, await training.preview(trainingId, token, await body(request)));
      else if (request.method === 'POST' && operation === 'publish')
        send(response, 200, await training.publish(trainingId, token, await body(request)));
      else if (request.method === 'POST' && operation === 'verify')
        send(response, 200, await training.verify(trainingId, token, await body(request)));
      else if (request.method === 'POST' && operation === 'activate')
        send(response, 200, await training.activate(trainingId, token, await body(request)));
      else throw new ApiError(404, 'not_found');
      return;
    }
    const match = /^\/v2\/jobs\/([a-f0-9-]{36})(?:\/(observe|receipts|pause|diagnostics))?$/.exec(
      url.pathname,
    );
    const jobId = match?.[1];
    const operation = match?.[2];
    if (!jobId) throw new ApiError(404, 'not_found');
    if (request.method === 'GET' && operation === 'diagnostics')
      send(response, 200, { ...(await service.diagnosticEvents(jobId, token)), buildVersion });
    else if (request.method === 'GET' && !operation)
      send(response, 200, { job: await service.read(jobId, token) });
    else if (request.method === 'DELETE' && !operation) {
      await service.cancel(jobId, token);
      send(response, 200, { cancelled: true });
    } else if (request.method === 'POST' && operation === 'observe')
      send(response, 200, await service.observe(jobId, token, await body(request)));
    else if (request.method === 'POST' && operation === 'receipts')
      send(response, 200, { job: await service.receipt(jobId, token, await body(request)) });
    else if (request.method === 'POST' && operation === 'pause')
      send(response, 200, { job: await service.pause(jobId, token) });
    else throw new ApiError(404, 'not_found');
  }
  const server = createServer((request, response) => {
    response.once('finish', () => metric(response.statusCode));
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException('Operation deadline exceeded', 'TimeoutError')),
      operationTimeoutMs,
    );
    timer.unref();
    response.once('close', () => {
      if (!response.writableEnded)
        controller.abort(new DOMException('Client disconnected', 'AbortError'));
    });
    const suppliedId = z.uuid().safeParse(request.headers['x-smartmapper-request-id']);
    const requestId = suppliedId.success ? suppliedId.data : randomUUID();
    const jobId = z
      .uuid()
      .safeParse(/^\/v2\/jobs\/([a-f0-9-]{36})(?:\/|$)/.exec(request.url ?? '')?.[1]);
    const trace = {
      requestId,
      jobId: jobId.success ? jobId.data : null,
      signal: controller.signal,
    };
    const quiet =
      request.method === 'OPTIONS' ||
      request.url === '/health' ||
      request.url?.endsWith('/diagnostics');
    void service.diagnostics.request(trace, async () => {
      const started = performance.now();
      if (!quiet) service.diagnostics.emit('request', 'begin');
      try {
        await untilAborted(route(request, response), controller.signal);
        if (!quiet) service.diagnostics.emit('request', 'end', performance.now() - started);
      } catch (error: unknown) {
        if (!quiet)
          service.diagnostics.emit(
            'request',
            'error',
            performance.now() - started,
            undefined,
            error,
          );
        const status =
          diagnosticCode(error) === 'timeout'
            ? 504
            : error instanceof ApiError
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
              ? (DiagnosticApiReasonSchema.safeParse(error.message).data ?? 'revision_conflict')
              : error instanceof ZodError
                ? 'invalid_payload'
                : 'service_unavailable';
        if (!response.writableEnded && !response.destroyed)
          send(response, status, {
            error: code,
            diagnosticCode: diagnosticCode(error),
            stage: service.diagnostics.current()?.stage,
            requestId,
          });
      } finally {
        clearTimeout(timer);
      }
    });
  });
  server.requestTimeout = 180_000;
  server.headersTimeout = 15_000;
  return server;
}
