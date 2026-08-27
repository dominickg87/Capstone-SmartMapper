export * from './contract.js';
export * from './mock-classic.js';
export * from './mock-modern.js';

import type { CarrierAdapter } from './contract.js';
import { mockClassicAdapter } from './mock-classic.js';
import { mockModernAdapter } from './mock-modern.js';

export const mockCarrierAdapters: readonly CarrierAdapter[] = [
  mockModernAdapter,
  mockClassicAdapter,
];
