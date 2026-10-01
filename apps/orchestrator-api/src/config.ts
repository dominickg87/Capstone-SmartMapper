import { z } from 'zod';

const list = (value: string | undefined): Set<string> =>
  new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
const required = (env: NodeJS.ProcessEnv, name: string): string =>
  z
    .string()
    .min(1, name + ' is required')
    .parse(env[name]);
const origins = (env: NodeJS.ProcessEnv, name: string, localMock = false): Set<string> => {
  const result = list(required(env, name));
  if (!result.size) throw new Error('missing_' + name);
  for (const origin of result) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          (localMock || env.NODE_ENV !== 'production') &&
          ['localhost', '127.0.0.1'].includes(url.hostname)
        ))
    )
      throw new Error('invalid_' + name);
  }
  return result;
};

export function configuration(env: NodeJS.ProcessEnv) {
  const baseURL = required(env, 'AZURE_OPENAI_BASE_URL');
  const modelURL = new URL(baseURL);
  if (
    modelURL.protocol !== 'https:' ||
    !modelURL.hostname.endsWith('.services.ai.azure.com') ||
    modelURL.pathname !== '/openai/v1/' ||
    modelURL.search ||
    modelURL.hash ||
    modelURL.username ||
    modelURL.password
  )
    throw new Error('invalid_model_endpoint');
  const tableEndpoint = required(env, 'AZURE_STORAGE_TABLE_ENDPOINT');
  if (!/^https:\/\/[a-z0-9]+\.table\.core\.windows\.net\/?$/.test(tableEndpoint))
    throw new Error('invalid_table_endpoint');
  const extensionIds = list(required(env, 'SMARTMAPPER_EXTENSION_IDS'));
  if (!extensionIds.size || ![...extensionIds].every((id) => /^[a-p]{32}$/.test(id)))
    throw new Error('invalid_extension_id');
  // Mapping memory (proposed ADR 0007) stays off unless its own table is configured.
  const mappingsTable = env.AZURE_STORAGE_MAPPINGS_TABLE?.trim() || null;
  if (mappingsTable !== null && !/^[A-Za-z][A-Za-z0-9]{2,62}$/.test(mappingsTable))
    throw new Error('invalid_mappings_table');
  const principals = list(required(env, 'SMARTMAPPER_ALLOWED_PRINCIPALS'));
  if (!principals.size || ![...principals].every((id) => /^[^/\s]+\/[^/\s]+$/.test(id)))
    throw new Error('invalid_principal');
  return {
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PORT ?? env.SMARTMAPPER_API_PORT ?? 4300),
    model: {
      baseURL,
      deployment: required(env, 'AZURE_OPENAI_MODEL_DEPLOYMENT'),
      defaultEffort: z
        .enum(['high', 'max'])
        .parse(env.SMARTMAPPER_DEFAULT_REASONING_EFFORT ?? 'high'),
      escalationEffort: z
        .enum(['high', 'max'])
        .parse(env.SMARTMAPPER_ESCALATION_REASONING_EFFORT ?? 'max'),
    },
    tableEndpoint,
    table: required(env, 'AZURE_STORAGE_JOBS_TABLE'),
    mappingsTable,
    extensionOrigins: new Set([...extensionIds].map((id) => 'chrome-extension://' + id)),
    access: {
      miaOrigins: origins(env, 'SMARTMAPPER_MIA_ORIGINS'),
      // The service binds browser jobs to these origins; it never fetches carrier URLs.
      // Explicit localhost origins support the synthetic lab with the deployed backend.
      carrierOrigins: origins(env, 'SMARTMAPPER_CARRIER_ORIGINS', true),
      principals,
    },
  };
}
