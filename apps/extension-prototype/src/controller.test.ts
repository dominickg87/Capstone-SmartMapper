import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExtensionExecutor } from './controller.js';

vi.mock('./config.js', () => ({
  config: { miaOrigin: 'https://mia.test', backendOrigin: 'https://backend.test' },
}));
vi.mock('./session.js', () => ({
  miaToken: () => Promise.resolve('synthetic-token'),
  jobSession: () => Promise.resolve(null),
  saveSession: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

describe('mapping startup diagnostics', () => {
  it('explains an unactivated mapping instead of asking to resume a nonexistent job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: 'mapping_not_trained',
              message: 'Customer-private server text',
            }),
            { status: 409 },
          ),
        ),
      ),
    );
    await expect(new ExtensionExecutor(() => undefined).search('synthetic')).rejects.toThrow(
      /Test this mapping/,
    );
    await expect(new ExtensionExecutor(() => undefined).search('synthetic')).rejects.not.toThrow(
      /Customer-private|page or job changed/,
    );
  });
  it('reports a reachable backend build even when authorization failed before creating a job', async () => {
    vi.stubGlobal('chrome', { runtime: { getManifest: () => ({ version: '0.3.3' }) } });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: 'ok', version: '2.0', buildVersion: '0.3.3' })),
        ),
      ),
    );
    const report: unknown = JSON.parse(
      await new ExtensionExecutor(() => undefined).diagnosticReport(),
    );
    expect(report).toMatchObject({
      extensionVersion: '0.3.3',
      backendVersion: '0.3.3',
      events: [],
    });
  });
});
