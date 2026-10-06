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
  const checkpointKind = z
    .enum(['azure', 'memory'])
    .parse(env.SMARTMAPPER_CHECKPOINT_STORE ?? 'azure');
  if (checkpointKind === 'memory' && env.NODE_ENV !== 'development')
    throw new Error('memory_checkpoints_require_development');
  const allowAnyCarrier =
    z.enum(['true', 'false']).parse(env.SMARTMAPPER_ALLOW_ANY_CARRIER ?? 'false') === 'true';
  const checkpoints = (() => {
    if (checkpointKind === 'memory') return { kind: 'memory' as const };
    const endpoint = required(env, 'AZURE_STORAGE_TABLE_ENDPOINT');
    if (!/^https:\/\/[a-z0-9]+\.table\.core\.windows\.net\/?$/.test(endpoint))
      throw new Error('invalid_table_endpoint');
    const table = required(env, 'AZURE_STORAGE_JOBS_TABLE');
    const mappingsTable = required(env, 'AZURE_STORAGE_MAPPINGS_TABLE');
    if (![table, mappingsTable].every((name) => /^[A-Za-z][A-Za-z0-9]{2,62}$/.test(name)))
      throw new Error('invalid_table_name');
    return { kind: 'azure' as const, endpoint, table, mappingsTable };
  })();
  const extensionIds = list(required(env, 'SMARTMAPPER_EXTENSION_IDS'));
  if (!extensionIds.size || ![...extensionIds].every((id) => /^[a-p]{32}$/.test(id)))
    throw new Error('invalid_extension_id');
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
    checkpoints,
    listenHost: env.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0',
    extensionOrigins: new Set([...extensionIds].map((id) => 'chrome-extension://' + id)),
    access: {
      allowAnyCarrier,
      autoNext: z.enum(['true', 'false']).parse(env.SMARTMAPPER_AUTO_NEXT ?? 'false') === 'true',
      miaOrigins: origins(env, 'SMARTMAPPER_MIA_ORIGINS'),
      // The service binds browser jobs to these origins; it never fetches carrier URLs.
      // Explicit localhost origins support the synthetic lab with the deployed backend.
      carrierOrigins: origins(env, 'SMARTMAPPER_CARRIER_ORIGINS', true),
      principals,
    },
  };
}
