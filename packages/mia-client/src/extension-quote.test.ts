import { describe, expect, it } from 'vitest';
import { resolveExtensionQuoteField, validateExtensionQuoteIdentity } from './extension-quote.js';

const quote = {
  id: 'synthetic-mia-quote',
  form_type: 'home',
  client_name: 'Display summary only',
  form_data: {
    applicant1: { firstName: 'Avery', dob: '02/03/1991', physicalState: 'IL' },
    applicant2: { firstName: 'Riley' },
    yearBuilt: 1984,
    squareFootage: 1800,
  },
};

describe('MIA extension quote boundary', () => {
  it('uses explicit MIA paths with original provenance and validated dates', () => {
    expect(resolveExtensionQuoteField(quote, 'applicant.firstName')).toEqual({
      value: 'Avery',
      sourceDataPath: 'form_data.applicant1.firstName',
    });
    expect(resolveExtensionQuoteField(quote, 'applicant.dateOfBirth').value).toBe('1991-02-03');
    expect(resolveExtensionQuoteField(quote, 'properties[0].squareFeet').value).toBe(1800);
  });
  it('supports the stored JSON and nested form envelopes', () => {
    const nested = { ...quote, form_data: JSON.stringify({ form_data: quote.form_data }) };
    expect(resolveExtensionQuoteField(nested, 'applicant.firstName').sourceDataPath).toBe(
      'form_data.form_data.applicant1.firstName',
    );
  });
  it('preserves indexed vehicle identities without manufacturing drivers', () => {
    const auto = {
      id: quote.id,
      form_type: 'auto',
      form_data: {
        vehicles: [
          { vehicleYear: '2020', vehicleMake: 'Example A' },
          { vehicleYear: 2022, vehicleMake: 'Example B' },
        ],
        applicant1: quote.form_data.applicant1,
      },
    };
    expect(resolveExtensionQuoteField(auto, 'vehicles[1].make').value).toBe('Example B');
    expect(resolveExtensionQuoteField(auto, 'vehicles[0].year').value).toBe(2020);
    expect(() => resolveExtensionQuoteField(auto, 'drivers[0].firstName')).toThrow(
      'missing_source',
    );
  });
  it('does not substitute display summaries, co-applicants, defaults, or unknown paths', () => {
    expect(() =>
      resolveExtensionQuoteField(
        { ...quote, form_data: { applicant2: quote.form_data.applicant2 } },
        'applicant.firstName',
      ),
    ).toThrow('missing_source');
    expect(() => resolveExtensionQuoteField(quote, 'applicant.phone')).toThrow('missing_source');
    expect(() => resolveExtensionQuoteField(quote, 'constructor')).toThrow('unsupported_source');
    expect(() =>
      resolveExtensionQuoteField({ ...quote, form_type: 'unknown' }, 'applicant.firstName'),
    ).toThrow('missing_source');
  });
  it('rejects conflicting, malformed, and invalid source data without leaking values', () => {
    expect(() =>
      resolveExtensionQuoteField(
        { ...quote, applicant: { firstName: 'Different synthetic name' } },
        'applicant.firstName',
      ),
    ).toThrow('conflicting_source');
    expect(() =>
      resolveExtensionQuoteField({ ...quote, form_data: '{' }, 'applicant.firstName'),
    ).toThrow('invalid_source');
    expect(() =>
      resolveExtensionQuoteField(
        { ...quote, applicant: { dateOfBirth: '1991-02-30' }, form_data: {} },
        'applicant.dateOfBirth',
      ),
    ).toThrow('invalid_source');
    expect(() => validateExtensionQuoteIdentity(quote, 'different-quote')).toThrow(
      'quote_identity_mismatch',
    );
  });
});
