import { describe, expect, it } from 'vitest';
import { configuration } from './config.js';

const env = {
  NODE_ENV: 'production',
  AZURE_STORAGE_TABLE_ENDPOINT: 'https://synthetic.table.core.windows.net/',
  AZURE_STORAGE_JOBS_TABLE: 'Jobs',
  AZURE_STORAGE_MAPPINGS_TABLE: 'SmartMapperMappings',
  SMARTMAPPER_EXTENSION_IDS: 'a'.repeat(32),
  SMARTMAPPER_ALLOWED_PRINCIPALS: 'demo/7',
  SMARTMAPPER_MIA_ORIGINS: 'https://mia.test',
  SMARTMAPPER_CARRIER_ORIGINS: 'http://127.0.0.1:4173',
};

describe('deployment scope configuration', () => {
  it('requires an explicit automatic Next setting', () => {
    expect(configuration(env).access.autoNext).toBe(false);
    expect(configuration({ ...env, SMARTMAPPER_AUTO_NEXT: 'true' }).access.autoNext).toBe(true);
    expect(() => configuration({ ...env, SMARTMAPPER_AUTO_NEXT: 'yes' })).toThrow();
  });
  it('allows an explicitly configured localhost mock carrier with the Azure backend', () => {
    expect(configuration(env).access.carrierOrigins).toEqual(new Set(['http://127.0.0.1:4173']));
    expect(configuration(env).access.allowAnyCarrier).toBe(false);
    expect(configuration(env).checkpoints).toEqual({
      kind: 'azure',
      endpoint: env.AZURE_STORAGE_TABLE_ENDPOINT,
      table: 'Jobs',
      mappingsTable: 'SmartMapperMappings',
    });
  });

  it('supports loopback-only local development without an Azure storage account', () => {
    const config = configuration({
      ...env,
      NODE_ENV: 'development',
      SMARTMAPPER_CHECKPOINT_STORE: 'memory',
      AZURE_STORAGE_TABLE_ENDPOINT: undefined,
      AZURE_STORAGE_JOBS_TABLE: undefined,
      AZURE_STORAGE_MAPPINGS_TABLE: undefined,
    });
    expect(config.checkpoints).toEqual({ kind: 'memory' });
    expect(config.listenHost).toBe('127.0.0.1');
  });

  it.each(['production', 'development', 'test', undefined])(
    'enables supervised any-HTTPS-carrier mode only through an explicit setting with NODE_ENV=%s',
    (mode) => {
      expect(
        configuration({ ...env, NODE_ENV: mode, SMARTMAPPER_ALLOW_ANY_CARRIER: 'true' }).access
          .allowAnyCarrier,
      ).toBe(true);
    },
  );
  it('rejects an invalid any-carrier setting', () => {
    expect(() => configuration({ ...env, SMARTMAPPER_ALLOW_ANY_CARRIER: 'yes' })).toThrow();
  });

  it.each(['production', 'test', undefined])(
    'refuses memory checkpoints with NODE_ENV=%s',
    (mode) => {
      expect(() =>
        configuration({ ...env, NODE_ENV: mode, SMARTMAPPER_CHECKPOINT_STORE: 'memory' }),
      ).toThrow('memory_checkpoints_require_development');
    },
  );

  it.each([
    ['SMARTMAPPER_MIA_ORIGINS', 'http://localhost:4173'],
    ['SMARTMAPPER_CARRIER_ORIGINS', 'http://carrier.test'],
    ['SMARTMAPPER_CARRIER_ORIGINS', 'ftp://localhost:4173'],
    ['SMARTMAPPER_CARRIER_ORIGINS', 'https://carrier.test/quote'],
    ['SMARTMAPPER_EXTENSION_IDS', ' , '],
    ['SMARTMAPPER_ALLOWED_PRINCIPALS', ' , '],
    ['SMARTMAPPER_MIA_ORIGINS', ' , '],
    ['AZURE_STORAGE_MAPPINGS_TABLE', 'not-valid'],
  ])('refuses unsafe or empty %s scope: %s', (name, value) => {
    expect(() => configuration({ ...env, [name]: value })).toThrow();
  });
});
