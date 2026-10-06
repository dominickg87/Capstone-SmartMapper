import { describe, expect, it } from 'vitest';
import { boundedNearbyTextCue, privacySafeRouteSeed } from './browser-page.js';

describe('nearby control text cues', () => {
  it('accepts short field wording and removes presentation punctuation', () => {
    expect(boundedNearbyTextCue('  First: *  ')).toBe('First');
    expect(boundedNearbyTextCue('Last')).toBe('Last');
    expect(boundedNearbyTextCue('Second applicant')).toBe('Second applicant');
  });

  it('does not turn a container-sized block or punctuation into a label', () => {
    expect(boundedNearbyTextCue('word '.repeat(17))).toBe('');
    expect(boundedNearbyTextCue('x'.repeat(121))).toBe('');
    expect(boundedNearbyTextCue(' : * ')).toBe('');
  });
});

describe('privacy-safe route identity', () => {
  it('normalizes quote identifiers and query values while retaining step identity', () => {
    const first = privacySafeRouteSeed(
      '/quotes/6316559/application',
      '?quoteId=6316559&step=drivers',
      '',
    );
    const second = privacySafeRouteSeed(
      '/quotes/9876543/application',
      '?quoteId=9876543&step=drivers',
      '',
    );
    const vehicles = privacySafeRouteSeed(
      '/quotes/9876543/application',
      '?quoteId=9876543&step=vehicles',
      '',
    );
    expect(first).toBe(second);
    expect(first).not.toContain('6316559');
    expect(first).not.toBe(vehicles);
  });

  it('normalizes UUID and token path segments without exposing them', () => {
    const seed = privacySafeRouteSeed(
      '/quote/33f13d6c-17ed-4e78-b1f8-abaef0903513/session/AbCdEf1234567890',
      '',
      '#page=2&session=secret-token-value',
    );
    expect(seed).toBe('/quote/:id/session/:token#page=2&session=:value');
  });

  it('keeps page identity stable across compact mixed quote identifiers', () => {
    expect(privacySafeRouteSeed('/quote/ABC123456/edit', '', '')).toBe(
      privacySafeRouteSeed('/quote/XYZ987654/edit', '', ''),
    );
    expect(privacySafeRouteSeed('/quote/ABC123456/edit', '', '')).toBe('/quote/:token/edit');
  });
});
