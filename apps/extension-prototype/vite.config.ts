import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig(() => {
  const configuredOrigin = (value: string): string => {
    const url = new URL(value);
    if (
      url.origin !== value ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))
    )
      throw new Error('Expected an exact HTTPS or localhost origin');
    return url.origin;
  };
  const miaOrigin = configuredOrigin(
    process.env.VITE_SMARTMAPPER_MIA_ORIGIN ?? 'https://demo.mia.agency',
  );
  const carrierOrigin = configuredOrigin(
    process.env.VITE_HOME_DEMO_CARRIER_ORIGIN ?? 'https://www.alliedtrustagents.com',
  );
  return {
    define: { __HOME_DEMO_CONFIG__: JSON.stringify({ miaOrigin, carrierOrigin }) },
    plugins: [
      react(),
      {
        name: 'smartmapper-reader-manifest',
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
                description: 'Map a M.I.A. Homeowners quote with a deterministic demo profile.',
                permissions: ['activeTab', 'scripting', 'sidePanel', 'storage'],
                host_permissions: [miaOrigin + '/*'],
                content_scripts: [
                  {
                    matches: [miaOrigin + '/extension/connect*'],
                    js: ['auth-content.js'],
                    run_at: 'document_idle',
                  },
                ],
                background: { service_worker: 'background.js', type: 'module' },
                action: { default_title: 'Open SmartMapper' },
                side_panel: { default_path: 'sidepanel.html' },
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
          background: resolve(import.meta.dirname, 'src/demo-background.ts'),
          'auth-content': resolve(import.meta.dirname, 'src/auth-content.ts'),
        },
        output: { entryFileNames: '[name].js' },
      },
    },
  };
});
