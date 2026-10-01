import { describe, expect, it } from 'vitest';
import { configuration } from './config.js';

const env = {
  NODE_ENV: 'production',
  AZURE_OPENAI_BASE_URL: 'https://synthetic.services.ai.azure.com/openai/v1/',
  AZURE_OPENAI_MODEL_DEPLOYMENT: 'synthetic',
  AZURE_STORAGE_TABLE_ENDPOINT: 'https://synthetic.table.core.windows.net/',
  AZURE_STORAGE_JOBS_TABLE: 'Jobs',
  SMARTMAPPER_EXTENSION_IDS: 'a'.repeat(32),
  SMARTMAPPER_ALLOWED_PRINCIPALS: 'demo/7',
  SMARTMAPPER_MIA_ORIGINS: 'https://mia.test',
  SMARTMAPPER_CARRIER_ORIGINS: 'http://127.0.0.1:4173',
};

describe('deployment scope configuration', () => {
  it('allows an explicitly configured localhost mock carrier with the Azure backend', () => {
    expect(configuration(env).access.carrierOrigins).toEqual(new Set(['http://127.0.0.1:4173']));
  });

  it('keeps mapping memory off unless its own table is configured', () => {
    expect(configuration(env).mappingsTable).toBeNull();
    expect(configuration({ ...env, AZURE_STORAGE_MAPPINGS_TABLE: ' ' }).mappingsTable).toBeNull();
    expect(
      configuration({ ...env, AZURE_STORAGE_MAPPINGS_TABLE: 'SmartMapperMappings' }).mappingsTable,
    ).toBe('SmartMapperMappings');
    expect(() => configuration({ ...env, AZURE_STORAGE_MAPPINGS_TABLE: 'mappings;drop' })).toThrow(
      'invalid_mappings_table',
    );
  });

  it.each([
    ['SMARTMAPPER_MIA_ORIGINS', 'http://localhost:4173'],
    ['SMARTMAPPER_CARRIER_ORIGINS', 'http://carrier.test'],
    ['SMARTMAPPER_CARRIER_ORIGINS', 'ftp://localhost:4173'],
    ['SMARTMAPPER_CARRIER_ORIGINS', 'https://carrier.test/quote'],
    ['SMARTMAPPER_EXTENSION_IDS', ' , '],
    ['SMARTMAPPER_ALLOWED_PRINCIPALS', ' , '],
    ['SMARTMAPPER_MIA_ORIGINS', ' , '],
    ['AZURE_OPENAI_BASE_URL', env.AZURE_OPENAI_BASE_URL + '?secret=synthetic'],
  ])('refuses unsafe or empty %s scope: %s', (name, value) => {
    expect(() => configuration({ ...env, [name]: value })).toThrow();
  });
});
