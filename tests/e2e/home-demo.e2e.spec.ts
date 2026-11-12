import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium, expect, test } from '@playwright/test';
import { homeDemoProfile, homeDemoTitle } from '@smartmapper/carrier-adapters';
import { activateToolbar, clickPanelButton, panelText } from './helpers/side-panel.js';
const carrierOrigin = 'http://127.0.0.1:4173',
  miaOrigin = 'http://127.0.0.1:5178';
const extensionPath = resolve('.tools/e2e-home-demo-extension');
const quote = {
  applicant1: {
    firstName: 'Synthetic',
    lastName: 'Example',
    dob: '1985-04-16',
    ssn: '000-12-3456',
    phone: '202-555-0106',
    email: 'synthetic@example.test',
    physicalAddress: '123 Synthetic Ave',
    physicalCity: 'Testville',
    physicalState: 'LA',
    physicalZipCode: '70001',
    maritalStatus: 'Married',
    priorAddress: '456 Prior Test Ave',
    priorCity: 'Testville',
    priorState: 'LA',
    priorZipCode: '70002',
  },
  insuredLocationSameAsApplicant: true,
  coverageA_Dwelling: 400000,
  coverageB_OtherStructures: 40000,
  coverageC_PersonalProperty: 200000,
  coverageD_LossOfUse: 80000,
  coverageE_Liability: '$300,000',
  coverageF_MedicalPayments: '$5,000',
  constructionType: 'frame',
  foundationType: 'Slab',
  squareFootage: 2100,
  numberOfStories: 2,
  frameExteriorMaterials: ['Brick veneer'],
  roofType: 'architectural_shingle',
  roofShape: 'Gabled',
  allOtherPerilsDeductible: 2500,
  windHailNamedStormDeductible: '2%',
  homeInsurancePayor: 'Insured PIF',
  numberOfResidents: 4,
  h2oHeaterLastUpdateYear: 2020,
  hotWaterHeaterType: 'Tank - Attic',
  propertyType: 'single_family',
  propertyStatus: 'Owner Occupied (Primary)',
  yearBuilt: 2002,
  purchaseDate: '2015-06-20',
  yearOfLastRoofUpdate: 2021,
  hoaCoaSecurityFeatures: ['Gated Access'],
  alarmSystem: 'Yes - Monitored Burglary & Fire',
  heatTypes: ['Forced Air Electric'],
  fortifiedRoofCertificate: 'Gold',
  plumbingLastUpdateYear: 2019,
  hvacLastUpdateYear: 2020,
  electricalLastUpdateYear: 2018,
  isPropertyInEntityName: false,
  protectionClass: '3',
};
test.beforeAll(() => {
  const cwd = resolve('apps/extension-prototype'),
    vite = resolve('node_modules/vite/bin/vite.js');
  const env = {
    ...process.env,
    VITE_SMARTMAPPER_MIA_ORIGIN: miaOrigin,
    VITE_HOME_DEMO_CARRIER_ORIGIN: carrierOrigin,
  };
  execFileSync(process.execPath, [vite, 'build', '--outDir', extensionPath, '--emptyOutDir'], {
    cwd,
    env,
    stdio: 'pipe',
  });
  execFileSync(
    process.execPath,
    [vite, 'build', '--config', 'vite.content.config.ts', '--outDir', extensionPath],
    { cwd, env, stdio: 'pipe' },
  );
});
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
function form(): string {
  const fields = homeDemoProfile.fields
    .filter((field) => field.visible && field.id !== '(none)')
    .map((field) => {
      const label = escape(homeDemoTitle(field)),
        id = escape(field.id),
        name = escape(field.name);
      if (['button', 'submit'].includes(field.type))
        return `<button type="button" id="${id}" name="${name}" data-final="true" onclick="document.body.dataset.finalClicked='true'">${label}</button>`;
      if (field.type === 'dropdown')
        return `<label>${label}<select id="${id}" name="${name}" data-number="${field.number}">${field.options.map((option, index) => `<option value="${option.label === 'Option 1' ? '' : `code-${index}`}" ${option.disabled && ![16, 17].includes(field.number) ? 'disabled' : ''} ${[16, 17].includes(field.number) && ['LA', 'HO3LA'].includes(option.label) ? 'selected' : ''}>${escape(option.label)}</option>`).join('')}</select></label>`;
      return `<label>${label}<input id="${id}" name="${name}" data-number="${field.number}"></label>`;
    })
    .join('\n');
  return `<!doctype html><html><head><title>Synthetic Home demo</title><style>body{font:14px Arial}label{display:block;padding:7px}input,select{margin-left:10px}button{margin:5px}</style></head><body data-final-clicked="false"><h1>Synthetic Home quote</h1>${fields}<script>
 const saved=JSON.parse(sessionStorage.getItem('synthetic-values')||'{}');
 for(const input of document.querySelectorAll('input,select'))if(saved[input.id]!==undefined)input.value=saved[input.id];
 document.addEventListener('change',event=>{const input=event.target;saved[input.id]=input.value;sessionStorage.setItem('synthetic-values',JSON.stringify(saved));if(input.dataset.number==='75'&&!sessionStorage.getItem('postback-done')){sessionStorage.setItem('postback-done','yes');location.reload();}});
 </script></body></html>`;
}

test('connects, selects a Home quote, maps through a postback and leaves consent/final actions untouched', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  test.setTimeout(120000);
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', miaOrigin);
    requests.push(url.pathname);
    if (url.pathname === '/extension/connect') {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        `<main><script type="application/json" id="mia-extension-connection">${JSON.stringify({ access_token: 'mia_ext_syntheticTokenForTestOnly1234567890', expires_at: new Date(Date.now() + 3600000).toISOString() })}</script></main>`,
      );
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    if (request.headers.authorization !== 'Bearer mia_ext_syntheticTokenForTestOnly1234567890') {
      response.writeHead(401);
      response.end('{}');
      return;
    }
    const summary = {
      id: 1,
      quote_number: 'SYNTHETIC-HOME-001',
      form_type: 'home',
      client_name: 'Synthetic Example',
    };
    if (url.pathname === '/api/extension/me')
      response.end(
        JSON.stringify({ success: true, user: { id: 1 }, tenant: { id: 'synthetic-tenant' } }),
      );
    else if (url.pathname === '/api/extension/quotes/search')
      response.end(
        JSON.stringify({
          success: true,
          results: [
            summary,
            { ...summary, id: 2, form_type: 'auto', quote_number: 'SYNTHETIC-AUTO-002' },
          ],
        }),
      );
    else if (url.pathname === '/api/extension/quotes/1')
      response.end(JSON.stringify({ success: true, quote: { ...summary, form_data: quote } }));
    else {
      response.writeHead(404);
      response.end('{}');
    }
  });
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(5178, '127.0.0.1', done);
  });
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
    headless: true,
    channel: 'chromium',
    args: [
      '--enable-unsafe-extension-debugging',
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath,
    ],
  });
  try {
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === carrierOrigin && url.pathname === '/Quote/Quote.aspx')
        return route.fulfill({ contentType: 'text/html', body: form() });
      if (url.origin === miaOrigin) {
        await route.continue();
        return;
      }
      throw new Error('Unexpected synthetic request: ' + url.origin + url.pathname);
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).hostname;
    const page = await context.newPage();
    await page.goto(carrierOrigin + '/Quote/Quote.aspx');
    const cdp = await context.browser()!.newBrowserCDPSession();
    await activateToolbar(cdp, extensionId, page);
    const tabId = await worker.evaluate(
      async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!.id!,
    );
    const panelUrl = `chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`,
      text = () => panelText(cdp, panelUrl);
    await expect.poll(text).toContain('Sign in to M.I.A.');
    expect(await clickPanelButton(cdp, panelUrl, 'Sign in to M.I.A.')).toBe('clicked');
    await expect.poll(text, { timeout: 15000 }).toContain('Synthetic Example');
    expect(await text()).not.toContain('SYNTHETIC-AUTO-002');
    await expect
      .poll(() =>
        worker.evaluate(
          async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id,
        ),
      )
      .toBe(tabId);
    await panelText(
      cdp,
      panelUrl,
      "(() => { document.querySelector('.quote').click(); return 'selected'; })()",
    );
    await expect.poll(text).toContain('Ready to map');
    expect(await clickPanelButton(cdp, panelUrl, 'Map quote')).toBe('clicked');
    await expect.poll(text, { timeout: 90000 }).toContain('Mapping finished.');
    const input = (number: number) => page.locator(`[data-number="${number}"]`);
    await expect(input(19)).toHaveValue('Synthetic');
    await expect(input(22)).toHaveValue('04/16/1985');
    await expect(input(74)).toHaveValue('400000');
    await expect(input(79)).toHaveValue('2100');
    for (const [number, label] of [
      [75, 'Frame'],
      [76, '10%'],
      [78, '50%'],
      [80, '20%'],
      [82, '$300,000'],
      [85, 'Architectural Shingle'],
      [86, 'Gable'],
      [89, '2%'],
      [97, '4'],
      [99, 'Married'],
      [107, 'Owner'],
      [120, 'Level 3 - Central Reporting System'],
      [123, 'IBHS Gold'],
      [127, 'Level 2 - Central Reporting Fire Alarm'],
    ] as const)
      await expect(input(number).locator('option:checked')).toHaveText(label);
    await expect(input(101)).toHaveValue('');
    await expect(page.locator('body')).toHaveAttribute('data-final-clicked', 'false');
    expect(await page.evaluate(() => sessionStorage.getItem('postback-done'))).toBe('yes');
    expect(await text()).toContain('to review');
    expect(requests.some((path) => /smartmapper|catalog|training/.test(path))).toBe(false);
    // Changed options must not be guessed on a second run; other fields remain usable.
    await input(85).evaluate((element) => {
      const select = element as HTMLSelectElement;
      select.innerHTML =
        '<option value="">Choose</option><optgroup disabled><option value="blocked">Architectural Shingle</option></optgroup>';
    });
    expect(await clickPanelButton(cdp, panelUrl, 'Map quote')).toBe('clicked');
    await expect
      .poll(text, { timeout: 90000 })
      .toContain('Equivalent carrier option is missing, disabled or ambiguous.');
    await expect.poll(text, { timeout: 90000 }).toContain('Mapping finished.');
    await expect(input(85)).toHaveValue('');
    await expect(page.locator('body')).toHaveAttribute('data-final-clicked', 'false');
    await page.screenshot({ path: testInfo.outputPath('synthetic-mapped-page.png') });
  } finally {
    await context.close();
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
});
