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
  const checkpointKind = z
    .enum(['azure', 'memory'])
    .parse(env.SMARTMAPPER_CHECKPOINT_STORE ?? 'azure');
  if (checkpointKind === 'memory' && env.NODE_ENV !== 'development')
    throw new Error('memory_checkpoints_require_development');
  const allowAnyCarrier =
    z.enum(['true', 'false']).parse(env.SMARTMAPPER_ALLOW_ANY_CARRIER ?? 'false') === 'true';
  if (allowAnyCarrier && env.NODE_ENV !== 'development')
    throw new Error('any_carrier_requires_development');
  const checkpoints = (() => {
    if (checkpointKind === 'memory') return { kind: 'memory' as const };
    const endpoint = required(env, 'AZURE_STORAGE_TABLE_ENDPOINT');
    if (!/^https:\/\/[a-z0-9]+\.table\.core\.windows\.net\/?$/.test(endpoint))
      throw new Error('invalid_table_endpoint');
    return { kind: 'azure' as const, endpoint, table: required(env, 'AZURE_STORAGE_JOBS_TABLE') };
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
    model: {
      baseURL,
      deployment: required(env, 'AZURE_OPENAI_MODEL_DEPLOYMENT'),
      defaultEffort: z
        .enum(['low', 'medium', 'high', 'max'])
        .parse(env.SMARTMAPPER_DEFAULT_REASONING_EFFORT ?? 'high'),
      escalationEffort: z
        .enum(['high', 'max'])
        .parse(env.SMARTMAPPER_ESCALATION_REASONING_EFFORT ?? 'max'),
    },
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
