import { AstraMapperProvider } from '@smartmapper/ai-mapper';
import { MiaActiveTabSourceProvider } from '@smartmapper/mia-client';
import insights from 'applicationinsights';
import { ActiveTabJobService } from './active-tab-service.js';
import { AzureCheckpointStore, MemoryCheckpointStore } from './checkpoints.js';
import { configuration } from './config.js';
import { createApi } from './http.js';

const config = configuration(process.env);
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  insights
    .setup()
    .setAutoCollectRequests(false)
    .setAutoCollectDependencies(false)
    .setAutoCollectExceptions(false)
    .setAutoCollectConsole(false)
    .setAutoCollectPerformance(false, false)
    .setSendLiveMetrics(false)
    .start();
}
const store =
  config.checkpoints.kind === 'memory'
    ? new MemoryCheckpointStore()
    : new AzureCheckpointStore(config.checkpoints.endpoint, config.checkpoints.table);
const mapper = new AstraMapperProvider(config.model, undefined, (timing) => {
  if (process.env.NODE_ENV === 'development')
    console.info(JSON.stringify({ event: 'smartmapper.model_timing', ...timing }));
  insights.defaultClient?.trackMetric({
    name: 'smartmapper.model_duration_ms',
    value: timing.elapsedMs,
    properties: { stage: timing.stage, serviceTier: timing.serviceTier },
  });
});
const service = new ActiveTabJobService(
  store,
  new MiaActiveTabSourceProvider(config.access.miaOrigins),
  mapper,
  mapper,
  config.access,
);
const server = createApi(service, config.extensionOrigins, (status) => {
  insights.defaultClient?.trackMetric({
    name: 'smartmapper.request',
    value: 1,
    properties: { status: String(status) },
  });
});
const cleanup = setInterval(() => {
  void store.purgeExpired(new Date().toISOString()).catch(() => {
    insights.defaultClient?.trackEvent({ name: 'smartmapper.cleanup_failed' });
  });
}, 5 * 60_000);
cleanup.unref();
server.listen(config.port, config.listenHost, () => {
  console.info('SmartMapper API ready');
});
process.on('SIGTERM', () => {
  clearInterval(cleanup);
  server.close();
});
