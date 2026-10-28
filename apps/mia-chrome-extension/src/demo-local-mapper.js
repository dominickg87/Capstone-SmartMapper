const aliases = {
  first_name: ['first name', 'given name', 'applicant first name', 'insured first name'],
  last_name: ['last name', 'surname', 'family name', 'applicant last name', 'insured last name'],
  full_name: ['full name', 'client name', 'applicant name', 'named insured'],
  email: ['email', 'email address', 'e mail', 'e mail address'],
  street: [
    'street',
    'street address',
    'address line 1',
    'address line one',
    'addr line1',
    'address1',
    'property address',
    'risk address',
  ],
  city: ['city', 'town', 'property city', 'address city'],
  state: ['state', 'province', 'property state', 'address state'],
  zip: ['zip', 'zip code', 'zipcode', 'postal', 'postal code', 'property zip', 'address zip'],
  county: ['county', 'parish', 'property county'],
  year_built: ['year built', 'yearbuilt', 'construction year'],
  square_feet: ['square feet', 'square footage', 'sq ft', 'sqft', 'living area'],
  bedrooms: ['bedrooms', 'bedroom count', 'number of bedrooms'],
  bathrooms: ['bathrooms', 'bathroom count', 'number of bathrooms'],
};
const normalize = (value) =>
  String(value ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
const compact = (value) => normalize(value).replaceAll(' ', '');
const exactAliases = new Map(
  Object.entries(aliases).flatMap(([key, names]) => names.map((name) => [compact(name), key])),
);
const prohibited =
  /\b(ssn|social security|tax id|payment|card|bank|routing|account number|cvv|cvc|signature|sign here|consent|agree|agreement|acknowledgment|acknowledgement|attestation|attest|certify|certification|authorize|authorization|submit|bind|issue|purchase|captcha|password|mfa|security code|birth|dob|premium|coverage|deductible)\b/;
const excludedScope =
  /\b(agent|agency|broker|producer|billing|mailing|previous|prior|secondary|co applicant|coapplicant|additional|spouse|beneficiary|employer|mortgage|lender|payment|metadata|user|tenant)\b/;
const wrappers = new Set([
  'data',
  'formdata',
  'quotedata',
  'answers',
  'responses',
  'fields',
  'applicant',
  'primaryapplicant',
  'primaryinsured',
  'insured',
  'contact',
  'customer',
  'client',
  'personal',
  'home',
  'homequote',
  'homeowners',
  'property',
  'propertydetails',
  'address',
  'propertyaddress',
  'risk',
  'residence',
  'location',
  'details',
  'information',
  'form',
  'quote',
]);
function sourceSemantic(key, context) {
  const normalized = normalize(key);
  const direct = exactAliases.get(compact(key));
  if (direct) return direct;
  for (const prefix of [
    'applicant',
    'insured',
    'contact',
    'customer',
    'property',
    'home',
    'risk',
    'primary applicant',
  ]) {
    if (normalized.startsWith(prefix + ' ')) {
      const result = exactAliases.get(compact(normalized.slice(prefix.length)));
      if (result) return result;
    }
  }
  if (
    ['first', 'last'].includes(normalized) &&
    /\b(name|applicant|insured|contact|customer)\b/.test(context)
  )
    return normalized === 'first' ? 'first_name' : 'last_name';
  return null;
}
function scalar(value, semantic) {
  if (
    !['string', 'number'].includes(typeof value) ||
    (typeof value === 'number' && !Number.isFinite(value))
  )
    return null;
  const result = String(value).trim();
  if (
    !result ||
    result.length > 250 ||
    ['unknown', 'n/a', 'not provided', 'not applicable', 'null', 'undefined'].includes(
      result.toLowerCase(),
    )
  )
    return null;
  if (['year_built', 'square_feet', 'bedrooms', 'bathrooms'].includes(semantic)) {
    if (!/^\d+(?:\.\d+)?$/.test(result)) return null;
    if (semantic === 'year_built' && !/^\d{4}$/.test(result)) return null;
    if (semantic === 'square_feet' && Number(result) <= 0) return null;
  }
  return result;
}
function quoteSources(quote) {
  const found = new Map();
  const visited = new WeakSet();
  let remaining = 1500;
  let complete = true;
  const add = (semantic, value, path) => {
    const safe = scalar(value, semantic);
    if (safe === null) return;
    const list = found.get(semantic) || [];
    list.push({ value: safe, path });
    found.set(semantic, list);
  };
  function visit(node, path, context, depth) {
    if (depth > 10 || remaining-- <= 0) {
      complete = false;
      return;
    }
    if (node === null || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      if (node.length > 100) complete = false;
      for (let index = 0; index < Math.min(node.length, 100); index++)
        visit(node[index], path + '[' + index + ']', context, depth + 1);
      return;
    }
    const question = node.question || node.label || node.field_name || node.key || node.name;
    if (typeof question === 'string') {
      const prompt = normalize(question).replace(
        /^(what is (your|the)|please enter (your|the)|enter (your|the)|your|the) /,
        '',
      );
      const semantic = sourceSemantic(prompt, context);
      if (
        semantic &&
        !prohibited.test(normalize(question)) &&
        !excludedScope.test(normalize(question))
      ) {
        if (Object.hasOwn(node, 'answer')) add(semantic, node.answer, path + '.answer');
        else if (Object.hasOwn(node, 'value')) add(semantic, node.value, path + '.value');
      }
    }
    if (Object.keys(node).length > 150) complete = false;
    for (const [key, value] of Object.entries(node).slice(0, 150)) {
      const words = normalize(key);
      if (excludedScope.test(words) || prohibited.test(words)) continue;
      const semantic = sourceSemantic(key, context);
      if (semantic) add(semantic, value, path + '.' + key);
      const known =
        wrappers.has(compact(key)) ||
        /^(applicant|property|home|contact|address) (data|details|information)$/.test(words);
      if (known && value && typeof value === 'object')
        visit(value, path + '.' + key, context + ' ' + words, depth + 1);
      if (known && typeof value === 'string' && ['{', '['].includes(value.trimStart()[0])) {
        if (value.length > 100000) {
          complete = false;
          continue;
        }
        try {
          visit(JSON.parse(value), path + '.' + key, context + ' ' + words, depth + 1);
        } catch {
          complete = false;
        }
      }
    }
  }
  visit(quote, 'quote', '', 0);
  return complete ? found : new Map();
}
function semanticHints(value) {
  const text = normalize(value);
  const result = new Set();
  for (const [semantic, names] of Object.entries(aliases)) {
    if (names.some((name) => (' ' + text + ' ').includes(' ' + normalize(name) + ' ')))
      result.add(semantic);
  }
  if (/\b(name|fullname|full name) (first|given)\b/.test(text)) result.add('first_name');
  if (/\b(name|fullname|full name) (last|family)\b/.test(text)) result.add('last_name');
  if (/\b(address|addr) (addr line1|line 1|street)\b/.test(text)) result.add('street');
  if (result.has('first_name') || result.has('last_name')) result.delete('full_name');
  return result;
}
function fieldSemantic(field) {
  const context = [
    field.label,
    field.name,
    field.htmlId,
    field.placeholder,
    field.nearbyText,
    field.section,
  ]
    .map(normalize)
    .join(' ');
  if (prohibited.test(context) || excludedScope.test(context)) return null;
  const direct = new Set(
    [field.label, field.name, field.htmlId, field.placeholder].flatMap((value) => [
      ...semanticHints(value),
    ]),
  );
  // Nearby text only disambiguates otherwise unnamed controls; never overrides their identity.
  const candidates = direct.size
    ? direct
    : semanticHints(field.nearbyText || field.previousCellText);
  return candidates.size === 1 ? [...candidates][0] : null;
}
export function isDemoFallbackEligible(baseUrl, error) {
  if (error?.status !== 404) return false;
  try {
    const url = new URL(baseUrl);
    return (
      url.origin === 'https://demo.mia.agency' &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function createDemoLocalMapping(quote, snapshot) {
  const result = { source: 'demo-local', assignments: [], skipped: [], warnings: [] };
  const sources = quoteSources(quote);
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields.slice(0, 120) : [];
  const semantics = fields.map(fieldSemantic);
  const ids = fields.map((field) => field.id);
  for (const [index, field] of fields.entries()) {
    const skip = (reason) => result.skipped.push({ field_id: field.id, reason });
    const context = [
      field.label,
      field.name,
      field.htmlId,
      field.placeholder,
      field.nearbyText,
      field.section,
    ]
      .map(normalize)
      .join(' ');
    if (
      prohibited.test(context) ||
      /\b(co applicant|coapplicant|spouse|secondary|agent|billing|mailing)\b/.test(context) ||
      field.disabled ||
      field.hasValue ||
      !['text', 'email', 'number', 'tel', 'textarea', 'select', 'select-one'].includes(field.type)
    ) {
      skip('Protected, populated, or unsupported field. Review manually.');
      continue;
    }
    const semantic = semantics[index];
    if (
      !semantic ||
      semantics.filter((key) => key === semantic).length !== 1 ||
      !field.id ||
      ids.filter((id) => id === field.id).length !== 1
    ) {
      skip('Ambiguous or unrecognized field. Review manually.');
      continue;
    }
    const candidates = sources.get(semantic) || [];
    const values = new Set(
      candidates.map((candidate) => candidate.value.toLowerCase().replace(/\s+/g, ' ')),
    );
    if (values.size !== 1) {
      skip('Missing or conflicting selected-quote value. Review manually.');
      continue;
    }
    let value = candidates[0].value;
    if (['select', 'select-one'].includes(field.type)) {
      const options = (Array.isArray(field.options) ? field.options : []).filter(
        (option) =>
          !option.disabled &&
          String(option.value ?? '').trim() !== '' &&
          (String(option.value).trim().toLowerCase() === value.toLowerCase() ||
            String(option.label ?? option.text ?? '')
              .trim()
              .toLowerCase() === value.toLowerCase()),
      );
      if (options.length !== 1) {
        skip('No unique exact option. Review manually.');
        continue;
      }
      value = String(options[0].value);
    }
    if (field.type === 'number' && !/^-?\d+(?:\.\d+)?$/.test(value)) {
      skip('Unsupported numeric value. Review manually.');
      continue;
    }
    result.assignments.push({
      field_id: field.id,
      value,
      confidence: 1,
      source_path: candidates[0].path,
      semantic_key: semantic,
      target: Object.fromEntries(
        ['type', 'label', 'name', 'htmlId', 'placeholder'].map((key) => [key, field[key] || '']),
      ),
    });
  }
  return result;
}
