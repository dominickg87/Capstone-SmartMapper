import { AstraMapperProvider } from '@smartmapper/ai-mapper';
import { MiaActiveTabSourceProvider } from '@smartmapper/mia-client';
import insights from 'applicationinsights';
import { ActiveTabJobService } from './active-tab-service.js';
import { AzureCheckpointStore } from './checkpoints.js';
import { configuration } from './config.js';
import { createApi } from './http.js';
import { AzureMappingStore } from './mapping-memory-store.js';

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
const store = new AzureCheckpointStore(config.tableEndpoint, config.table);
const mapper = new AstraMapperProvider(config.model);
const service = new ActiveTabJobService(
  store,
  new MiaActiveTabSourceProvider(config.access.miaOrigins),
  mapper,
  mapper,
  config.access,
  config.mappingsTable
    ? new AzureMappingStore(config.tableEndpoint, config.mappingsTable)
    : undefined,
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
server.listen(config.port, '0.0.0.0', () => {
  console.info('SmartMapper API ready');
});
process.on('SIGTERM', () => {
  clearInterval(cleanup);
  server.close();
});
