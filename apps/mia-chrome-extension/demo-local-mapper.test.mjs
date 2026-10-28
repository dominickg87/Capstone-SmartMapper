import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoLocalMapping, isDemoFallbackEligible } from './src/demo-local-mapper.js';

const field = (id, label, extra = {}) => ({
  id,
  label,
  type: 'text',
  name: '',
  htmlId: '',
  placeholder: '',
  nearbyText: '',
  section: '',
  disabled: false,
  hasValue: false,
  options: [],
  ...extra,
});
const map = (quote, fields) => createDemoLocalMapping(quote, { fields });
test('fallback requires an exact demo portal and HTTP404', () => {
  assert.equal(isDemoFallbackEligible('https://demo.mia.agency', { status: 404 }), true);
  assert.equal(isDemoFallbackEligible('https://demo.mia.agency/', { status: 404 }), true);
  for (const status of [200, 401, 403, 422, 500, 503, undefined, '404'])
    assert.equal(isDemoFallbackEligible('https://demo.mia.agency', { status }), false);
  for (const origin of [
    'http://demo.mia.agency',
    'https://mia.agency',
    'https://mia.test',
    'https://demo.mia.agency.evil.test',
    'https://demo.mia.agency/path',
    'https://user@demo.mia.agency',
    'invalid',
  ])
    assert.equal(isDemoFallbackEligible(origin, { status: 404 }), false);
  assert.equal(
    isDemoFallbackEligible('https://demo.mia.agency', new Error('Route not found')),
    false,
  );
});
test('explicit selected quote values carry their source provenance without mutating inputs', () => {
  const quote = {
    first_name: 'Synthetic',
    last_name: 'Example',
    email: 'synthetic@example.invalid',
    address: {
      street: '123 Synthetic Lane',
      city: 'Testville',
      state: 'IL',
      zip: '60000',
      county: 'Synthetic County',
    },
    property: { year_built: 1999, square_feet: 1800 },
  };
  const fields = [
    'First name',
    'Last name',
    'Email',
    'Street address',
    'City',
    'State',
    'ZIP',
    'County',
    'Year built',
    'Square feet',
  ].map((label, index) => field('field_' + index, label));
  const before = JSON.stringify({ quote, fields });
  const mapping = map(quote, fields);
  assert.equal(mapping.source, 'demo-local');
  assert.equal(mapping.assignments.length, 10);
  assert.equal(mapping.assignments[0].value, quote.first_name);
  assert.equal(mapping.assignments[3].source_path, 'quote.address.street');
  assert.equal(mapping.assignments[9].value, '1800');
  assert.equal(
    mapping.assignments.every((a) => a.confidence === 1 && a.target && a.source_path),
    true,
  );
  assert.equal(JSON.stringify({ quote, fields }), before);
});
test('matches Jotform name parts, camel case IDs, placeholders and local nearby text', () => {
  const mapping = map(
    {
      firstName: 'Synthetic',
      lastName: 'Example',
      address: { street: '123 Synthetic Lane', city: 'Testville' },
    },
    [
      field('f1', '', { name: 'q3_fullName[first]' }),
      field('f2', '', { name: 'q3_fullName[last]' }),
      field('f3', '', { placeholder: 'Street address' }),
      field('f4', '', { nearbyText: 'City' }),
    ],
  );
  assert.deepEqual(
    mapping.assignments.map((a) => a.semantic_key),
    ['first_name', 'last_name', 'street', 'city'],
  );
});
test('conflicting source values and repeated target roles require manual review', () => {
  assert.equal(
    map({ first_name: 'One', applicant: { first_name: 'Two' } }, [field('x', 'First name')])
      .assignments.length,
    0,
  );
  assert.equal(
    map({ first_name: 'One' }, [field('x', 'First name'), field('y', 'First name')]).assignments
      .length,
    0,
  );
  assert.equal(
    map({ first_name: 'One', last_name: 'Two' }, [field('x', 'First name or last name')])
      .assignments.length,
    0,
  );
});
test('agent and billing values never become applicant values', () => {
  const result = map(
    { agent: { first_name: 'Agent' }, billing: { email: 'billing@example.invalid' } },
    [field('x', 'First name'), field('y', 'Email')],
  );
  assert.equal(result.assignments.length, 0);
});
test('missing facts and display names are never split or invented', () => {
  const result = map({ client_name: 'Synthetic Example' }, [
    field('x', 'First name'),
    field('y', 'Last name'),
    field('z', 'County'),
  ]);
  assert.equal(result.assignments.length, 0);
  assert.equal(result.skipped.length, 3);
});
test('protected and uncertain fields remain untouched even with matching name hints', () => {
  const fields = [
    field('ssn', 'First name SSN'),
    field('pay', 'First name payment'),
    field('sig', 'First name signature'),
    field('att', 'I attest the first name is correct'),
    field('consent', 'First name consent', { type: 'checkbox' }),
    field('submit', 'First name submit', { type: 'submit' }),
    field('hidden', 'First name', { type: 'hidden' }),
    field('pwd', 'First name', { type: 'password' }),
    field('other', 'Uncertain detail'),
  ];
  assert.equal(map({ first_name: 'Synthetic' }, fields).assignments.length, 0);
});
test('a prohibited sibling cannot prevent detection of a distinct safe field', () => {
  const result = map({ first_name: 'Synthetic' }, [
    field('safe', 'First name'),
    field('att', 'I attest first name is correct'),
  ]);
  assert.deepEqual(
    result.assignments.map((a) => a.field_id),
    ['safe'],
  );
});
test('populated disabled and unsupported controls require manual review', () => {
  for (const extra of [
    { hasValue: true },
    { disabled: true },
    { type: 'combobox' },
    { type: 'radio' },
    { type: 'date' },
  ])
    assert.equal(
      map({ email: 'synthetic@example.invalid' }, [field('x', 'Email', extra)]).assignments.length,
      0,
    );
});
test('dropdown matching requires one exact label or value and retains its actual value', () => {
  const select = field('s', 'State', {
    type: 'select',
    options: [
      { value: '', label: 'Choose' },
      { value: 'IL', label: 'Illinois' },
    ],
  });
  assert.equal(map({ state: 'Illinois' }, [select]).assignments[0].value, 'IL');
  assert.equal(map({ state: 'Ill' }, [select]).assignments.length, 0);
  select.options.push({ value: 'other', label: 'Illinois' });
  assert.equal(map({ state: 'Illinois' }, [select]).assignments.length, 0);
});
test('basic numeric property facts require explicit scalar values', () => {
  assert.equal(
    map({ property: { year_built: 'unknown' } }, [field('x', 'Year built')]).assignments.length,
    0,
  );
  assert.equal(
    map({ property: { year_built: 1999 } }, [field('x', 'Year built')]).assignments[0].value,
    '1999',
  );
  assert.equal(
    map({ property: { square_feet: { min: 1000, max: 2000 } } }, [field('x', 'Square feet')])
      .assignments.length,
    0,
  );
});
test('known serialized and question-answer source containers remain selected quote data', () => {
  assert.equal(
    map({ form_data: JSON.stringify({ first_name: 'Synthetic' }) }, [field('x', 'First name')])
      .assignments[0].value,
    'Synthetic',
  );
  assert.equal(
    map({ answers: [{ question: 'First name', answer: 'Synthetic' }] }, [field('x', 'First name')])
      .assignments[0].source_path,
    'quote.answers[0].answer',
  );
});
test('duplicate target IDs and duplicate exact options are rejected', () => {
  assert.equal(
    map({ first_name: 'Synthetic', last_name: 'Example' }, [
      field('x', 'First name'),
      field('x', 'Last name'),
    ]).assignments.length,
    0,
  );
  assert.equal(
    map({ state: 'IL' }, [
      field('x', 'State', {
        type: 'select',
        options: [
          { value: 'IL', label: 'One' },
          { value: 'IL', label: 'Two' },
        ],
      }),
    ]).assignments.length,
    0,
  );
});

test('truncated or malformed known answer containers cannot hide conflicting facts', () => {
  const target = [field('x', 'First name')];
  assert.equal(
    map(
      {
        first_name: 'Synthetic',
        answers: Array.from({ length: 101 }, () => ({ question: 'First name', answer: 'Other' })),
      },
      target,
    ).assignments.length,
    0,
  );
  assert.equal(
    map({ first_name: 'Synthetic', form_data: '{broken' }, target).assignments.length,
    0,
  );
  assert.equal(
    map({ first_name: 'Synthetic', form_data: '{' + ' '.repeat(100001) + '}' }, target).assignments
      .length,
    0,
  );
});
test('explicit question wording and named answer records preserve values and provenance', () => {
  const result = map(
    {
      answers: [
        { question: 'What is your first name?', answer: 'Synthetic' },
        { name: 'last_name', value: 'Example' },
      ],
    },
    [field('x', 'First name'), field('y', 'Last name')],
  );
  assert.deepEqual(
    result.assignments.map((a) => a.value),
    ['Synthetic', 'Example'],
  );
  assert.equal(result.assignments[1].source_path, 'quote.answers[1].value');
});

test('answer labels for agents or secondary people cannot supply applicant answers', () => {
  const result = map(
    {
      answers: [
        { question: 'Agent email', answer: 'agent@example.invalid' },
        { question: 'Spouse first name', answer: 'Other' },
      ],
    },
    [field('x', 'First name'), field('y', 'Email')],
  );
  assert.equal(result.assignments.length, 0);
});
