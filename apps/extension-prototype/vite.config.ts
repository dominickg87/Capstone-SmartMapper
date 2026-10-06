import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const origin = (value: string): string => {
    const url = new URL(value);
    if (
      url.origin !== value ||
      (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))
    )
      throw new Error('Expected an exact HTTPS origin or localhost');
    return value;
  };
  const backendOrigin = origin(
    env.VITE_SMARTMAPPER_BACKEND_ORIGIN ??
      'https://asp-smartmapper-dev-fgbqddfbewfrd2at.eastus-01.azurewebsites.net',
  );
  const miaOrigin = origin(env.VITE_SMARTMAPPER_MIA_ORIGIN ?? 'https://mia.test');
  const carrierOrigins = (
    env.VITE_SMARTMAPPER_CARRIER_ORIGINS ?? 'http://localhost:4173,http://127.0.0.1:4173'
  )
    .split(',')
    .map((item) => origin(item.trim()));
  const anyCarrierSetting = env.VITE_SMARTMAPPER_ALLOW_ANY_CARRIER ?? 'false';
  if (!['true', 'false'].includes(anyCarrierSetting))
    throw new Error('Expected true or false for VITE_SMARTMAPPER_ALLOW_ANY_CARRIER');
  const allowAnyCarrier = anyCarrierSetting === 'true';
  return {
    define: {
      __SMARTMAPPER_CONFIG__: JSON.stringify({
        backendOrigin,
        miaOrigin,
        carrierOrigins,
        allowAnyCarrier,
      }),
    },
    plugins: [
      react(),
      {
        name: 'smartmapper-manifest',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'manifest.json',
            source: JSON.stringify(
              {
                manifest_version: 3,
                name: 'M.I.A. SmartMapper POC',
                version: packageJson.version,
                minimum_chrome_version: '116',
                description:
                  'Map a selected M.I.A. quote across pages, with source checks and human review.',
                permissions: ['activeTab', 'storage', 'scripting', 'sidePanel'],
                host_permissions: [
                  ...new Set([
                    backendOrigin,
                    miaOrigin,
                    ...(allowAnyCarrier ? [] : carrierOrigins),
                  ]),
                ].map((item) => item + '/*'),
                background: { service_worker: 'background.js', type: 'module' },
                action: { default_title: 'Open SmartMapper' },
                side_panel: { default_path: 'sidepanel.html' },
                content_scripts: [
                  {
                    matches: [miaOrigin + '/extension/connect*'],
                    js: ['auth-content.js'],
                    run_at: 'document_idle',
                  },
                ],
              },
              null,
              2,
            ),
          });
        },
      },
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          sidepanel: resolve(import.meta.dirname, 'sidepanel.html'),
          background: resolve(import.meta.dirname, 'src/background.ts'),
          'auth-content': resolve(import.meta.dirname, 'src/auth-content.ts'),
        },
        output: { entryFileNames: '[name].js' },
      },
    },
  };
});
