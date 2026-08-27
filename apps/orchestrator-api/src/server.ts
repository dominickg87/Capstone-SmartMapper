import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import type { ExecutionMode, QuoteJob } from '@smartmapper/contracts';
import { JsonLineSafeLogger } from '@smartmapper/observability';

import { InMemoryJobStore, InMemoryQueueService, PrototypeJobService } from './services.js';

const service = new PrototypeJobService(new InMemoryJobStore(), new InMemoryQueueService());
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
  });
  response.end(JSON.stringify(body));
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

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const segments = url.pathname.split('/').filter(Boolean);

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
