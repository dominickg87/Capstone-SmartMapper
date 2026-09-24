import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { ExecutionMode, QuoteJob } from '@smartmapper/contracts';
import { InMemoryMiaQuoteProvider, syntheticQuotes } from '@smartmapper/mia-client';
import { JsonLineSafeLogger } from '@smartmapper/observability';

import { InMemoryJobStore, InMemoryQueueService, PrototypeJobService } from './services.js';
import { buildMapping, toQuoteSummary, type MiaPageSnapshot } from './smart-map.js';

const service = new PrototypeJobService(new InMemoryJobStore(), new InMemoryQueueService());
const quoteProvider = new InMemoryMiaQuoteProvider(syntheticQuotes);
const logger = new JsonLineSafeLogger();
const port = Number(process.env.SMARTMAPPER_API_PORT ?? 4300);

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const unknownChunk: unknown = chunk;
    if (typeof unknownChunk === 'string' || unknownChunk instanceof Uint8Array) {
      chunks.push(Buffer.from(unknownChunk));
    }
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    // Local development only: the side panel calls this from a chrome-extension:// origin.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, accept',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  response.end(JSON.stringify(body));
}

/* The posted snapshot is untrusted page data; narrow it to an object before reading it. */
function pageInput(value: unknown): MiaPageSnapshot {
  return typeof value === 'object' && value !== null ? value : {};
}

function stringInput(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function prototypeJob(input: Record<string, unknown>): QuoteJob {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  const executionMode: ExecutionMode =
    input.executionMode === 'remote_browser' ? 'remote_browser' : 'extension';
  return {
    version: '1.0',
    jobId: randomUUID(),
    tenantReference: 'tenant-synthetic',
    userReference: 'user-synthetic',
    quoteReference: stringInput(input.quoteReference, 'quote-synthetic-complete'),
    adapterId: stringInput(input.adapterId, 'mock-modern'),
    adapterVersion: '1.0.0',
    executionMode,
    state: 'created',
    reviewItems: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/*
 * The MIA extension's backend contract, implemented locally.
 *
 * This is the whole point of the local API: the extension posts a page snapshot to
 * /smart-map/map exactly as it would to MIA, and gets assignments back from the deterministic
 * matcher. No model, no API key, no MIA tenant. The extension is unaware of the difference.
 *
 * Authentication is a development stand-in. Any bearer token is accepted because this server
 * binds to loopback and serves only synthetic quotes; it is not an authorization model and must
 * never be exposed off the local machine.
 */
async function extensionRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  segments: string[],
): Promise<void> {
  const authorization = request.headers.authorization ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    json(response, 401, { message: 'Sign into MIA before using MIA-connected tools.' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/extension/me') {
    json(response, 200, {
      user: { id: 'user-synthetic', name: 'Local synthetic user' },
      tenant: { id: 'tenant-synthetic', name: 'Local synthetic tenant' },
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/extension/quotes/search') {
    const query = (url.searchParams.get('query') ?? '').toLocaleLowerCase();
    const results = syntheticQuotes
      .filter((quote) => {
        const haystack = [
          quote.metadata.quoteId,
          quote.applicant.firstName,
          quote.applicant.lastName,
        ]
          .join(' ')
          .toLocaleLowerCase();
        return query.length === 0 || haystack.includes(query);
      })
      .map(toQuoteSummary);
    json(response, 200, { results });
    return;
  }

  if (request.method === 'GET' && segments[2] === 'quotes' && segments[3]) {
    try {
      const quote = await quoteProvider.retrieveQuote(decodeURIComponent(segments[3]));
      json(response, 200, { quote: toQuoteSummary(quote) });
    } catch {
      json(response, 404, { message: 'Synthetic quote not found.' });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/extension/smart-map/map') {
    const body = await readJson(request);
    const quoteId = stringInput(body.quote_id, '');

    let quote;
    try {
      quote = await quoteProvider.retrieveQuote(quoteId);
    } catch {
      json(response, 404, { message: 'Synthetic quote not found: ' + quoteId });
      return;
    }

    const mapping = buildMapping(quote, pageInput(body.page));
    logger.write({
      level: 'info',
      event: 'local_smart_map_completed',
      fields: {
        quoteReference: quoteId,
        provider: mapping.mapping.provider,
        assignments: mapping.mapping.assignments.length,
        skipped: mapping.mapping.skipped.length,
      },
    });
    json(response, 200, mapping);
    return;
  }

  if (
    request.method === 'POST' &&
    (url.pathname === '/api/extension/smart-map/feedback' ||
      url.pathname === '/api/extension/smart-map/training')
  ) {
    json(response, 200, { success: true });
    return;
  }

  json(response, 404, { message: 'route_not_found' });
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const segments = url.pathname.split('/').filter(Boolean);

  if (request.method === 'OPTIONS') {
    json(response, 204, {});
    return;
  }

  if (segments[0] === 'api' && segments[1] === 'extension') {
    await extensionRoute(request, response, url, segments);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { status: 'ok', provider: 'in-memory' });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/v1/jobs') {
    const job = await service.create(prototypeJob(await readJson(request)));
    json(response, 201, job);
    return;
  }

  if (segments[0] === 'v1' && segments[1] === 'jobs' && segments[2]) {
    const jobId = segments[2];
    if (request.method === 'GET' && segments.length === 3) {
      const job = await service.read(jobId);
      json(response, job ? 200 : 404, job ?? { error: 'job_not_found' });
      return;
    }
    if (request.method === 'POST' && segments[3] === 'cancel') {
      const job = await service.cancel(jobId);
      json(response, job ? 200 : 404, job ?? { error: 'job_not_found' });
      return;
    }
    if (request.method === 'POST' && segments[3] === 'responses') {
      const body = await readJson(request);
      const job = await service.submitHumanResponse(jobId, stringInput(body.reviewItemId, ''));
      json(response, job ? 200 : 404, job ?? { error: 'job_not_found' });
      return;
    }
    if (request.method === 'GET' && segments[3] === 'review') {
      const summary = await service.reviewSummary(jobId);
      json(response, summary ? 200 : 404, summary ?? { error: 'job_not_found' });
      return;
    }
  }

  json(response, 404, { error: 'route_not_found' });
}

const server = createServer((request, response) => {
  void route(request, response).catch((error: unknown) => {
    logger.write({
      level: 'error',
      event: 'prototype_api_request_failed',
      fields: { message: error instanceof Error ? error.message : 'unknown_error' },
    });
    json(response, 500, { error: 'internal_error' });
  });
});

server.listen(port, '127.0.0.1', () => {
  logger.write({
    level: 'info',
    event: 'prototype_api_started',
    fields: { port, dataProvider: 'synthetic_in_memory' },
  });
});
