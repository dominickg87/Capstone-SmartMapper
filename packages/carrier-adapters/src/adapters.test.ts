import type { CarrierPageSnapshot } from '@smartmapper/contracts';
import { describe, expect, it } from 'vitest';

import { isAllowedAdapterUrl, mockCarrierAdapters, mockModernAdapter } from './index.js';

function snapshot(overrides: Partial<CarrierPageSnapshot> = {}): CarrierPageSnapshot {
  return {
    version: '1.0',
    url: 'http://127.0.0.1:4173/modern?layout=changed',
    title: 'Synthetic flow',
    headings: ['Tell us about the applicant'],
    controls: [],
    labels: ['Given name', 'Birth date', 'Residence state'],
    options: [],
    validationMessages: [],
    iframes: [],
    capturedAt: '2026-01-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('mock carrier adapters', () => {
  it('recognizes the changed modern layout from stable semantics', () => {
    const fingerprint = mockModernAdapter.recognizePage(snapshot());
    expect(fingerprint?.pageId).toBe('applicant');
    expect(fingerprint?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('allows only localhost mock origins', () => {
    for (const adapter of mockCarrierAdapters) {
      expect(isAllowedAdapterUrl(adapter, 'http://127.0.0.1:4173/modern')).toBe(true);
      expect(isAllowedAdapterUrl(adapter, 'https://carrier.example.com/quote')).toBe(false);
    }
  });

  it('does not encode brittle nth-child or XPath selector strategies', () => {
    const serialized = JSON.stringify(mockCarrierAdapters);
    expect(serialized).not.toMatch(/nth-child|xpath|\/html\//i);
  });
});
