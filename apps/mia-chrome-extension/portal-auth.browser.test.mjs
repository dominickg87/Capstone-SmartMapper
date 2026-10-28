import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';

const appDirectory = import.meta.dirname;
const demoOrigin = 'https://demo.mia.agency';
const syntheticToken = 'synthetic-portal-auth-token-not-a-credential';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function startExtension(savedSettings, portalOrigin = demoOrigin) {
  const directory = await mkdtemp(join(tmpdir(), 'mia-demo-portal-auth-'));
  let context;
  const requests = { connections: [], identity: [], unexpected: [] };
  const close = async () => {
    await context?.close();
    // Only remove the exact isolated profile created by this test.
    assert.equal(resolve(directory, '..'), resolve(tmpdir()));
    assert.ok(directory.includes('mia-demo-portal-auth-'));
    await rm(directory, { recursive: true, force: true });
  };
  try {
    const extensionPath = join(appDirectory, 'dist');
    context = await chromium.launchPersistentContext(join(directory, 'profile'), {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--host-resolver-rules=MAP * ~NOTFOUND',
      ],
    });
    await context.route(/^https?:\/\//, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === portalOrigin && url.pathname === '/extension/connect') {
        const state = url.searchParams.get('extension_state');
        requests.connections.push({ url: url.href, state });
        await route.fulfill({
          contentType: 'text/html',
          body: `<main><h1>Synthetic MIA connection</h1><script type="application/json"
            id="mia-extension-connection">${JSON.stringify({
              access_token: syntheticToken,
              token_type: 'Bearer',
              user: { id: 'synthetic-portal-user' },
              tenant: { id: 'synthetic-portal-tenant' },
            })}</script></main>`,
        });
        return;
      }
      if (url.origin === portalOrigin && url.pathname === '/api/extension/me') {
        requests.identity.push({
          url: url.href,
          authorization: request.headers().authorization,
        });
        await route.fulfill({
          json: {
            user: { id: 'synthetic-portal-user' },
            tenant: { id: 'synthetic-portal-tenant' },
          },
        });
        return;
      }
      requests.unexpected.push({
        url: url.href,
        authorization: request.headers().authorization,
      });
      await route.abort();
    });
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    assert.equal(
      await worker.evaluate(() => globalThis.chrome.runtime.getManifest().version),
      '1.4.23',
    );
    // Finish the new profile's first-install default write before seeding saved settings.
    await expect
      .poll(async () =>
        worker.evaluate(async () => {
          return (await globalThis.chrome.storage.sync.get('miaBaseUrl')).miaBaseUrl;
        }),
      )
      .toBe(demoOrigin);
    if (savedSettings) {
      await worker.evaluate(async ({ baseUrl, auth }) => {
        await globalThis.chrome.storage.sync.set({ miaBaseUrl: baseUrl });
        if (auth) await globalThis.chrome.storage.local.set({ miaSmartMapAuth: auth });
      }, savedSettings);
    }
    const extensionId = new URL(worker.url()).host;
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(panel.locator('#smartMapBtn')).toBeEnabled();
    await panel.locator('#smartMapBtn').click();
    await expect(panel.locator('#smartMapScreen')).toBeVisible();
    await expect(panel.locator('#smartMapQuoteSearch')).toBeDisabled();
    return { context, worker, panel, requests, close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function signIn(extension, expectedOrigin) {
  const { context, worker, panel, requests } = extension;
  const createdPage = context.waitForEvent('page');
  await panel.locator('#smartMapSignInBtn').click();
  const connectionPage = await createdPage;
  // Chrome-created tabs can initially navigate before Playwright attaches routing.
  // Read the original tab URL, including its generated state, before revisiting it.
  const connectionUrl = await worker.evaluate(async () => {
    const tabs = await globalThis.chrome.tabs.query({});
    return tabs.find((tab) => tab.url?.includes('/extension/connect'))?.url;
  });
  assert.ok(connectionUrl, 'Sign In must create a connection tab.');
  const parsedUrl = new URL(connectionUrl);
  assert.equal(parsedUrl.origin, expectedOrigin);
  assert.equal(parsedUrl.pathname, '/extension/connect');
  assert.match(parsedUrl.searchParams.get('extension_state') || '', uuidPattern);
  assert.deepEqual([...parsedUrl.searchParams.keys()], ['extension_state']);
  await connectionPage.goto(connectionUrl);
  await expect(panel.locator('#smartMapConnectionStatus')).toHaveText('Signed in');
  await expect(panel.locator('#smartMapQuoteSearch')).toBeEnabled();
  const auth = await worker.evaluate(async () => {
    return (await globalThis.chrome.storage.local.get('miaSmartMapAuth')).miaSmartMapAuth;
  });
  assert.equal(auth.baseUrl, expectedOrigin);
  assert.equal(auth.accessToken, syntheticToken);
  assert.ok(requests.connections.length > 0);
  assert.ok(
    requests.connections.every(
      (connection) => connection.state === parsedUrl.searchParams.get('extension_state'),
    ),
    'The connection callback must receive the generated extension_state unchanged.',
  );
  assert.ok(requests.identity.length > 0);
  assert.ok(
    requests.identity.every(
      (request) =>
        request.url === `${expectedOrigin}/api/extension/me` &&
        request.authorization === `Bearer ${syntheticToken}`,
    ),
  );
  assert.deepEqual(
    requests.unexpected,
    [],
    'Sign In must not call mapping or other portal routes.',
  );
  return connectionUrl;
}

test('fresh demo profile signs in through demo portal with extension_state and token handoff', async () => {
  const extension = await startExtension();
  try {
    await signIn(extension, demoOrigin);
  } finally {
    await extension.close();
  }
});

test('saved production default migrates to demo and discards its token before signing in', async () => {
  const extension = await startExtension({
    baseUrl: 'https://mia.agency',
    auth: {
      accessToken: 'synthetic-legacy-token-not-a-credential',
      tokenType: 'Bearer',
      baseUrl: 'https://mia.agency',
      user: { id: 'synthetic-legacy-user' },
      tenant: { id: 'synthetic-legacy-tenant' },
    },
  });
  try {
    const stored = await extension.worker.evaluate(async () => ({
      baseUrl: (await globalThis.chrome.storage.sync.get('miaBaseUrl')).miaBaseUrl,
      auth: (await globalThis.chrome.storage.local.get('miaSmartMapAuth')).miaSmartMapAuth,
    }));
    assert.equal(stored.baseUrl, demoOrigin);
    assert.equal(stored.auth, undefined, 'The old portal token must not be reused for the demo.');
    assert.deepEqual(extension.requests.identity, []);
    await signIn(extension, demoOrigin);
  } finally {
    await extension.close();
  }
});

test('custom test portal remains configurable and keeps extension_state during sign in', async () => {
  const customOrigin = 'https://mia.test';
  const extension = await startExtension({ baseUrl: customOrigin }, customOrigin);
  try {
    const savedBaseUrl = await extension.worker.evaluate(async () => {
      return (await globalThis.chrome.storage.sync.get('miaBaseUrl')).miaBaseUrl;
    });
    assert.equal(savedBaseUrl, customOrigin);
    await signIn(extension, customOrigin);
  } finally {
    await extension.close();
  }
});
