import type { Normalization, Transformation } from '@smartmapper/automation-core';

/*
 * FIELD DICTIONARY — pure data, no logic.
 *
 * One entry per field this matcher knows how to resolve. Each entry answers two questions:
 *   1. Where does the value come from?        -> sourcePath, a semantic path into the quote
 *   2. How is the control recognized on page? -> the signal lists below
 *
 * This is the file to edit when a carrier form uses wording that is not handled yet. The
 * matching algorithm never needs to change for that.
 *
 * No entry contains a quote value. The dictionary is vocabulary only, which is what lets
 * the whole table cross the sanitized mapper boundary without carrying applicant data.
 */
export interface FieldSignalDefinition {
  /** Semantic path into the MIA quote payload. Resolved to a value only at the approved target. */
  readonly sourcePath: string;
  readonly displayName: string;
  readonly description: string;
  readonly dataType: 'text' | 'date' | 'number' | 'boolean' | 'enum';
  readonly risk: 'low' | 'medium' | 'high';
  /** Standard HTML autocomplete tokens. The strongest signal available. */
  readonly autocomplete: readonly string[];
  /** Phrases matched against label, accessible name, placeholder and adjacent text. */
  readonly labels: readonly string[];
  /** Tokens matched against the name and stable id attributes. */
  readonly nameTokens: readonly string[];
  /** If any of these appear in a control's identifying text, it is never this field. */
  readonly avoid: readonly string[];
  /** Acceptable input types. Empty means any text-like control. */
  readonly inputTypes: readonly string[];
  readonly transformation: Transformation;
  readonly readBackNormalization: Normalization;
}

const PERSON_AVOID = [
  'co-applicant',
  'coapplicant',
  'co applicant',
  'spouse',
  'driver',
  'previous',
  'former',
  'business',
  'company',
  'second',
  'agent',
];

const ADDRESS_AVOID = ['previous', 'prior', 'mailing', 'business'];

export const fieldDictionary: readonly FieldSignalDefinition[] = [
  {
    sourcePath: 'applicant.lastName',
    displayName: 'Applicant last name',
    description: 'Family name of the primary applicant',
    dataType: 'text',
    risk: 'low',
    autocomplete: ['family-name'],
    labels: ['last name', 'surname', 'family name'],
    nameTokens: ['lastname', 'last', 'lname', 'surname', 'familyname'],
    avoid: [...PERSON_AVOID, 'maiden'],
    inputTypes: ['text', 'search'],
    transformation: 'identity',
    readBackNormalization: 'text',
  },
  {
    sourcePath: 'applicant.firstName',
    displayName: 'Applicant first name',
    description: 'Given name of the primary applicant',
    dataType: 'text',
    risk: 'low',
    autocomplete: ['given-name'],
    labels: ['first name', 'given name', 'forename'],
    nameTokens: ['firstname', 'first', 'fname', 'givenname', 'given'],
    avoid: [...PERSON_AVOID, 'middle'],
    inputTypes: ['text', 'search'],
    transformation: 'identity',
    readBackNormalization: 'text',
  },
  {
    sourcePath: 'applicant.email',
    displayName: 'Applicant email address',
    description: 'Contact email address for the primary applicant',
    dataType: 'text',
    risk: 'low',
    autocomplete: ['email'],
    labels: ['email', 'e-mail'],
    nameTokens: ['email', 'emailaddress', 'mail'],
    avoid: ['confirm', 'verify', 'repeat', 'agent'],
    inputTypes: ['text', 'email'],
    transformation: 'identity',
    readBackNormalization: 'case_insensitive',
  },
  {
    sourcePath: 'applicant.phone',
    displayName: 'Applicant phone number',
    description: 'Primary contact telephone number',
    dataType: 'text',
    risk: 'low',
    autocomplete: ['tel', 'tel-national'],
    labels: ['phone', 'telephone', 'mobile', 'cell'],
    nameTokens: ['phone', 'phonenumber', 'telephone', 'tel', 'mobile', 'cell'],
    avoid: ['fax', 'work', 'business', 'agent', 'extension'],
    inputTypes: ['text', 'tel'],
    transformation: 'digits_only',
    readBackNormalization: 'digits',
  },
  {
    sourcePath: 'applicant.dateOfBirth',
    displayName: 'Applicant date of birth',
    description: 'Date of birth of the primary applicant',
    dataType: 'date',
    // Rating-relevant and easy to mis-target across repeated driver blocks.
    risk: 'medium',
    autocomplete: ['bday'],
    labels: ['date of birth', 'birth date', 'birthdate', 'birthday'],
    nameTokens: ['dateofbirth', 'dob', 'birthdate', 'birthday', 'birth'],
    avoid: ['driver', 'spouse', 'co-applicant', 'coapplicant', 'second'],
    /*
     * tel and number appear because a masked MM/DD/YYYY field asks for the numeric keypad
     * on mobile; it is still a plain text box as far as matching is concerned.
     */
    inputTypes: ['text', 'date', 'tel', 'number'],
    transformation: 'date_mm_dd_yyyy',
    readBackNormalization: 'date',
  },
  {
    sourcePath: 'applicant.address.postalCode',
    displayName: 'Applicant postal code',
    description: 'ZIP or postal code of the applicant mailing address',
    dataType: 'text',
    risk: 'low',
    autocomplete: ['postal-code'],
    labels: ['zip code', 'zip', 'postal code', 'postcode'],
    nameTokens: ['zip', 'zipcode', 'postalcode', 'postal', 'postcode'],
    avoid: [...ADDRESS_AVOID, 'garaging'],
    inputTypes: ['text', 'tel', 'number', 'search'],
    transformation: 'identity',
    readBackNormalization: 'digits',
  },
  {
    sourcePath: 'applicant.address.line1',
    displayName: 'Applicant street address',
    description: 'First line of the applicant street address',
    dataType: 'text',
    risk: 'low',
    autocomplete: ['address-line1', 'street-address'],
    labels: ['street address', 'address line 1', 'address'],
    nameTokens: ['address', 'address1', 'addressline1', 'street', 'streetaddress', 'addr1'],
    avoid: [...ADDRESS_AVOID, 'email', 'line 2', 'city'],
    inputTypes: ['text', 'search'],
    transformation: 'identity',
    readBackNormalization: 'case_insensitive',
  },
  {
    sourcePath: 'applicant.address.line2',
    displayName: 'Applicant address line 2',
    description: 'Apartment, unit or suite of the applicant street address',
    dataType: 'text',
    risk: 'low',
    autocomplete: ['address-line2'],
    labels: ['address line 2', 'apt', 'apartment', 'unit', 'suite', 'apt/suite'],
    nameTokens: ['address2', 'addressline2', 'addr2', 'line2', 'apt', 'apartment', 'unit', 'suite'],
    avoid: [...ADDRESS_AVOID, 'line 1'],
    inputTypes: ['text', 'search'],
    transformation: 'identity',
    readBackNormalization: 'case_insensitive',
  },
  {
    sourcePath: 'applicant.address.city',
    displayName: 'Applicant city',
    description: 'City of the applicant mailing address',
    dataType: 'text',
    risk: 'low',
    autocomplete: ['address-level2'],
    labels: ['city', 'town'],
    nameTokens: ['city', 'town', 'locality'],
    avoid: ADDRESS_AVOID,
    inputTypes: ['text', 'search'],
    transformation: 'identity',
    readBackNormalization: 'case_insensitive',
  },
  {
    sourcePath: 'applicant.address.stateCode',
    displayName: 'Applicant state',
    description: 'Two-letter state code of the applicant mailing address',
    dataType: 'enum',
    risk: 'low',
    autocomplete: ['address-level1'],
    labels: ['state', 'province'],
    nameTokens: ['state', 'statecode', 'province', 'region'],
    avoid: ['previous', 'prior', 'license', 'united states'],
    inputTypes: ['text', 'search'],
    transformation: 'uppercase',
    readBackNormalization: 'case_insensitive',
  },

  /* ----------------------------------------------------------------------------------
   * Drivers and vehicles.
   *
   * These are repeated records, and the source path carries the index. The page cannot be
   * relied on to order them, so each position is recognized by its own wording instead:
   * the first record avoids "second" outright, and the second record requires it. That is
   * what keeps Driver 1's birthday out of Driver 2's box on a page that shows both.
   * ---------------------------------------------------------------------------------- */

  {
    sourcePath: 'drivers[0].dateOfBirth',
    displayName: 'First driver date of birth',
    description: 'Date of birth of the first listed driver',
    dataType: 'date',
    risk: 'medium',
    autocomplete: [],
    labels: ['driver date of birth', 'driver birth date', 'driver dob'],
    nameTokens: ['driverdateofbirth', 'driverdob', 'driverbirthdate'],
    avoid: ['second', 'spouse', 'co-applicant', 'coapplicant', 'excluded'],
    inputTypes: ['text', 'date', 'tel', 'number'],
    transformation: 'date_mm_dd_yyyy',
    readBackNormalization: 'date',
  },
  {
    sourcePath: 'drivers[1].dateOfBirth',
    displayName: 'Second driver date of birth',
    description: 'Date of birth of the second listed driver',
    dataType: 'date',
    risk: 'medium',
    autocomplete: [],
    labels: ['second driver date of birth', 'second driver birth date', 'driver 2 date of birth'],
    nameTokens: ['seconddriverdateofbirth', 'driver2dateofbirth'],
    avoid: ['excluded'],
    inputTypes: ['text', 'date', 'tel', 'number'],
    transformation: 'date_mm_dd_yyyy',
    readBackNormalization: 'date',
  },
  {
    sourcePath: 'drivers[0].firstName',
    displayName: 'First driver given name',
    description: 'Given name of the first listed driver',
    dataType: 'text',
    risk: 'low',
    autocomplete: [],
    labels: ['driver given name', 'driver first name', 'listed driver first name'],
    nameTokens: ['drivergivenname', 'driverfirstname'],
    avoid: ['second', 'spouse', 'excluded', 'last', 'surname'],
    inputTypes: ['text', 'search'],
    transformation: 'identity',
    readBackNormalization: 'text',
  },
  {
    sourcePath: 'drivers[1].firstName',
    displayName: 'Second driver given name',
    description: 'Given name of the second listed driver',
    dataType: 'text',
    risk: 'low',
    autocomplete: [],
    labels: ['second driver given name', 'second driver first name'],
    nameTokens: ['seconddrivergivenname', 'seconddriverfirstname'],
    avoid: ['excluded', 'last', 'surname'],
    inputTypes: ['text', 'search'],
    transformation: 'identity',
    readBackNormalization: 'text',
  },
  {
    sourcePath: 'vehicles[0].year',
    displayName: 'First vehicle year',
    description: 'Model year of the first listed vehicle',
    dataType: 'number',
    risk: 'low',
    autocomplete: [],
    labels: ['vehicle year', 'model year', 'auto year', 'year of vehicle'],
    nameTokens: ['vehicleyear', 'modelyear', 'autoyear'],
    // "Year built" and "Construction year" belong to the dwelling, never to a vehicle.
    avoid: ['second', 'built', 'construction', 'home', 'property', 'trailer'],
    inputTypes: ['text', 'tel', 'number', 'search'],
    transformation: 'identity',
    readBackNormalization: 'digits',
  },
  {
    sourcePath: 'vehicles[1].year',
    displayName: 'Second vehicle year',
    description: 'Model year of the second listed vehicle',
    dataType: 'number',
    risk: 'low',
    autocomplete: [],
    labels: ['second vehicle year', 'second model year', 'second auto year', 'vehicle 2 year'],
    nameTokens: ['secondvehicleyear', 'vehicle2year'],
    avoid: ['built', 'construction', 'home', 'property', 'trailer'],
    inputTypes: ['text', 'tel', 'number', 'search'],
    transformation: 'identity',
    readBackNormalization: 'digits',
  },
  {
    sourcePath: 'vehicles[0].make',
    displayName: 'First vehicle make',
    description: 'Manufacturer of the first listed vehicle',
    dataType: 'text',
    risk: 'low',
    autocomplete: [],
    labels: ['vehicle make', 'auto make', 'vehicle manufacturer', 'make of vehicle'],
    nameTokens: ['vehiclemake', 'automake', 'manufacturer'],
    avoid: ['second', 'model year', 'trailer'],
    inputTypes: ['text', 'search'],
    transformation: 'identity',
    readBackNormalization: 'case_insensitive',
  },
  {
    sourcePath: 'vehicles[1].make',
    displayName: 'Second vehicle make',
    description: 'Manufacturer of the second listed vehicle',
    dataType: 'text',
    risk: 'low',
    autocomplete: [],
    labels: ['second auto make', 'second vehicle make', 'vehicle 2 make'],
    nameTokens: ['secondautomake', 'secondvehiclemake'],
    avoid: ['model year', 'trailer'],
    inputTypes: ['text', 'search'],
    transformation: 'identity',
    readBackNormalization: 'case_insensitive',
  },

  /* ---- Property attributes, for the homeowners flow. ---- */

  {
    sourcePath: 'properties[0].yearBuilt',
    displayName: 'Property year built',
    description: 'Year the dwelling was originally constructed',
    dataType: 'number',
    risk: 'low',
    autocomplete: [],
    labels: [
      'year built',
      'year home was built',
      'year the home was built',
      'year was this home built',
      'year was your home built',
      'when was this home built',
      'when was your home built',
      'construction year',
      'year of construction',
    ],
    // Deliberately no bare 'year' token: on a bundled quote that matches the vehicle year.
    nameTokens: ['yearbuilt', 'builtyear', 'constructionyear', 'yearofconstruction'],
    avoid: ['roof', 'remodel', 'renovat', 'purchase', 'vehicle', 'auto', 'effective'],
    inputTypes: ['text', 'tel', 'number', 'search'],
    transformation: 'identity',
    readBackNormalization: 'digits',
  },
  {
    sourcePath: 'properties[0].squareFeet',
    displayName: 'Property square footage',
    description: 'Finished living area of the dwelling in square feet',
    dataType: 'number',
    risk: 'low',
    autocomplete: [],
    labels: [
      'square feet',
      'square footage',
      'sq ft',
      'sq. ft',
      'sqft',
      'living area',
      'finished square feet',
      'total square',
    ],
    nameTokens: [
      'squarefeet',
      'squarefootage',
      'sqft',
      'sqfootage',
      'livingarea',
      'finishedarea',
      'totalarea',
    ],
    // Lot size and garage size sit right beside living area and take the same units.
    avoid: ['lot', 'garage', 'basement', 'unfinished', 'deck', 'porch', 'acre'],
    inputTypes: ['text', 'tel', 'number', 'search'],
    transformation: 'identity',
    readBackNormalization: 'digits',
  },
  {
    sourcePath: 'properties[0].style',
    displayName: 'Property style',
    description: 'Architectural style of the dwelling',
    dataType: 'enum',
    risk: 'low',
    autocomplete: [],
    labels: [
      'style',
      'home style',
      'house style',
      'property style',
      'architectural style',
      'style of architecture',
      'style of home',
    ],
    nameTokens: ['style', 'homestyle', 'housestyle', 'propertystyle', 'architecturalstyle'],
    avoid: ['roof', 'foundation', 'siding', 'garage'],
    inputTypes: ['text', 'search'],
    transformation: 'identity',
    readBackNormalization: 'case_insensitive',
  },
  {
    sourcePath: 'properties[0].stories',
    displayName: 'Property stories',
    description: 'Number of above-grade stories in the dwelling',
    dataType: 'number',
    risk: 'low',
    autocomplete: [],
    labels: [
      'stories',
      'number of stories',
      'how many stories',
      'story',
      'levels',
      'number of levels',
    ],
    nameTokens: ['stories', 'numberofstories', 'numstories', 'storycount', 'levels'],
    avoid: ['garage', 'basement'],
    inputTypes: ['text', 'tel', 'number', 'search'],
    transformation: 'identity',
    readBackNormalization: 'case_insensitive',
  },
  {
    sourcePath: 'properties[0].numberOfFamilies',
    displayName: 'Property number of families',
    description: 'Number of family dwelling units in the building',
    dataType: 'number',
    risk: 'low',
    autocomplete: [],
    labels: [
      'families',
      'number of families',
      'how many families',
      'family units',
      'number of units',
    ],
    nameTokens: ['families', 'numberoffamilies', 'numfamilies', 'familyunits'],
    avoid: ['household', 'members', 'drivers', 'occupants'],
    inputTypes: ['text', 'tel', 'number', 'search'],
    transformation: 'identity',
    readBackNormalization: 'case_insensitive',
  },
];

export function findDefinition(sourcePath: string): FieldSignalDefinition | undefined {
  return fieldDictionary.find((definition) => definition.sourcePath === sourcePath);
}
