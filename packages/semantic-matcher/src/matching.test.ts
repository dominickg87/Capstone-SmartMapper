import { AccessibleControlSchema, type AccessibleControl } from '@smartmapper/contracts';
import { describe, expect, it } from 'vitest';

import { findDefinition, type FieldSignalDefinition } from './field-dictionary.js';
import { matchAll, matchAllByContainer, matchField, tokenize } from './matching.js';

interface ControlSeed {
  controlKey: string;
  role?: string;
  label?: string;
  accessibleName?: string;
  name?: string;
  stableId?: string;
  inputType?: string;
  autocomplete?: string;
  placeholder?: string;
  nearbyText?: string[];
  disabled?: boolean;
  readOnly?: boolean;
  visible?: boolean;
  containerKey?: string;
  containerLabel?: string;
}

/** Builds a control through the real schema, so every fixture is contract-valid. */
function control(seed: ControlSeed): AccessibleControl {
  return AccessibleControlSchema.parse({
    role: 'input',
    required: false,
    disabled: false,
    nearbyText: [],
    ...seed,
  });
}

function definition(sourcePath: string): FieldSignalDefinition {
  const found = findDefinition(sourcePath);
  if (found === undefined) {
    throw new Error('Test refers to a missing dictionary entry: ' + sourcePath);
  }
  return found;
}

const lastName = definition('applicant.lastName');
const firstName = definition('applicant.firstName');
const yearBuilt = definition('properties[0].yearBuilt');

describe('signal precedence', () => {
  it('treats a standard autocomplete token as definitive', () => {
    const match = matchField(lastName, [
      control({ controlKey: 'c1', autocomplete: 'family-name', name: 'q_87234' }),
    ]);

    expect(match.outcome).toBe('matched');
    if (match.outcome !== 'matched') {
      return;
    }
    expect(match.score).toBe(0.98);
    expect(match.evidence[0]?.kind).toBe('autocomplete');
  });

  it('recovers a field from an obfuscated framework name attribute', () => {
    const match = matchField(lastName, [
      control({ controlKey: 'c1', name: 'ctl00$ContentPlaceHolder1$txtLName' }),
    ]);

    expect(match.outcome).toBe('matched');
    if (match.outcome !== 'matched') {
      return;
    }
    expect(match.score).toBe(0.9);
    expect(match.evidence[0]?.detail).toContain('lname');
  });

  it('drops meaningless framework segments when tokenizing', () => {
    expect(tokenize('ctl00$ContentPlaceHolder1$txtLName')).toContain('lname');
    expect(tokenize('ctl00$ContentPlaceHolder1$txtLName')).not.toContain('txt');
    expect(tokenize('q_87234')).toEqual([]);
  });

  it('orders the evidence trail strongest first', () => {
    const match = matchField(lastName, [
      control({
        controlKey: 'c1',
        autocomplete: 'family-name',
        label: 'Last name',
        placeholder: 'Last name',
      }),
    ]);

    expect(match.outcome).toBe('matched');
    if (match.outcome !== 'matched') {
      return;
    }
    expect(match.evidence.map((entry) => entry.kind)).toEqual([
      'autocomplete',
      'label',
      'placeholder',
    ]);
  });
});

describe('refusing to fill the wrong control', () => {
  it('never reads a co-applicant field as the applicant', () => {
    const match = matchField(lastName, [
      control({ controlKey: 'c1', label: 'Co-applicant last name' }),
    ]);

    expect(match.outcome).toBe('notFound');
  });

  it('reports a tie rather than guessing between equal candidates', () => {
    const match = matchField(lastName, [
      control({ controlKey: 'c1', label: 'Last name' }),
      control({ controlKey: 'c2', label: 'Last name' }),
    ]);

    expect(match.outcome).toBe('ambiguous');
    if (match.outcome !== 'ambiguous') {
      return;
    }
    expect(match.candidates).toHaveLength(2);
  });

  it('does not read a vehicle year as the year the home was built', () => {
    const match = matchField(yearBuilt, [
      control({ controlKey: 'c1', label: 'Vehicle year', name: 'vehicleYear' }),
    ]);

    expect(match.outcome).toBe('notFound');
  });

  it.each([
    ['disabled', { controlKey: 'c1', label: 'Last name', disabled: true }],
    ['read-only', { controlKey: 'c1', label: 'Last name', readOnly: true }],
    ['not visible', { controlKey: 'c1', label: 'Last name', visible: false }],
    ['a password box', { controlKey: 'c1', label: 'Last name', inputType: 'password' }],
    ['a submit button', { controlKey: 'c1', label: 'Last name', role: 'button' }],
  ])('never targets a control that is %s', (_description, seed: ControlSeed) => {
    expect(matchField(lastName, [control(seed)]).outcome).toBe('notFound');
  });
});

describe('claiming controls', () => {
  it('does not let two fields resolve to the same control', () => {
    // This control carries a signal for both fields; whichever is matched first owns it.
    const contested = control({
      controlKey: 'c1',
      label: 'Last name',
      autocomplete: 'given-name',
    });

    const [lastNameMatch, firstNameMatch] = matchAll([lastName, firstName], [contested]);

    expect(lastNameMatch?.outcome).toBe('matched');
    expect(firstNameMatch?.outcome).toBe('notFound');
  });
});

describe('changed layouts', () => {
  it('still resolves the applicant first name when the label is reworded', () => {
    // The mock modern flow renames "First name" to "Given name" in its changed-layout variant.
    const match = matchField(firstName, [control({ controlKey: 'c1', label: 'Given name' })]);

    expect(match.outcome).toBe('matched');
  });
});

describe('repeated records', () => {
  const repeated = [
    control({
      controlKey: 'd1-last',
      label: 'Last name',
      containerKey: 'driver-1',
      containerLabel: 'Driver 1',
    }),
    control({
      controlKey: 'd2-last',
      label: 'Last name',
      containerKey: 'driver-2',
      containerLabel: 'Driver 2',
    }),
  ];

  it('ties page-wide, because both blocks look identical', () => {
    expect(matchField(lastName, repeated).outcome).toBe('ambiguous');
  });

  it('resolves one control per section when matched by container', () => {
    const groups = matchAllByContainer([lastName], repeated);

    expect(groups.map((group) => group.containerLabel)).toEqual(['Driver 1', 'Driver 2']);
    expect(groups.every((group) => group.matches[0]?.outcome === 'matched')).toBe(true);
  });

  it('treats controls without a container as one page-level group', () => {
    const groups = matchAllByContainer(
      [lastName],
      [control({ controlKey: 'c1', label: 'Last name' })],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.containerKey).toBe('page');
  });
});
