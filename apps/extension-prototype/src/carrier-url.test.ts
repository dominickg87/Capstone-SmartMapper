import { describe, expect, it } from 'vitest';
import { sanitizedCarrierPageUrl, stableCarrierBaseUrl } from './carrier-url.js';

describe('stable carrier workflow base URL', () => {
  it('uses only the carrier origin for a persisted workflow base URL', () => {
    expect(
      stableCarrierBaseUrl(
        'https://user:secret@carrier.example.test/Quote/Quote.aspx?quote=secret#applicant',
      ),
    ).toBe('https://carrier.example.test');
  });

  it('preserves the active quote path for runtime matching but removes URL secrets', () => {
    expect(
      sanitizedCarrierPageUrl(
        'https://user:secret@carrier.example.test/quote/ABC123456/edit?token=secret#step',
      ),
    ).toBe('https://carrier.example.test/quote/ABC123456/edit');
  });

  it('never persists numeric, UUID, mixed-token, or name-only path segments', () => {
    expect(stableCarrierBaseUrl('https://carrier.example.test/quote/6316559/edit')).toBe(
      'https://carrier.example.test',
    );
    expect(
      stableCarrierBaseUrl(
        'https://carrier.example.test/policy/550e8400-e29b-41d4-a716-446655440000/edit',
      ),
    ).toBe('https://carrier.example.test');
    expect(stableCarrierBaseUrl('https://carrier.example.test/quote/ABC123456/edit')).toBe(
      'https://carrier.example.test',
    );
    expect(stableCarrierBaseUrl('https://carrier.example.test/quote/Jordan-Smith/edit')).toBe(
      'https://carrier.example.test',
    );
  });

  it('falls back to the origin when the first path segment is identifier-like', () => {
    expect(stableCarrierBaseUrl('https://carrier.example.test/123456789')).toBe(
      'https://carrier.example.test',
    );
  });
});
