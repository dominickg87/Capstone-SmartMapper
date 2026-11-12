// Value-free snapshot regenerated from the local M.I.A. Home form; see ADR 0024.
export interface HomeownersField {
  sourcePath: string;
  question: string;
  section: string;
  dataType: string;
  options: Array<{ label: string; value: string | number | boolean }>;
}
export const homeownersCatalogSource = {
  revision: 'cd5499c43ee863f464972e64e8b902ff76bbad0d',
  definitionCount: 120,
  sourceDigests: {
    'resources/js/components/forms/home-insurance-form.tsx':
      '76d1c731fd904348c9963b07050c121693851082a1df2919763b6c994188883d',
    'resources/js/components/forms/form-schemas.ts':
      '2954d58cc4ddd4283aa899b3f3a5f3e1e05106e9309301a3e6cbbf7bf79879fa',
  },
};
export const homeownersFields: HomeownersField[] = [
  {
    sourcePath: 'applicant1.firstName',
    question: 'First Name',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.firstName',
    question: 'First Name',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.lastName',
    question: 'Last Name',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.lastName',
    question: 'Last Name',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.dob',
    question: 'Date of Birth',
    section: 'Applicant 1',
    dataType: 'date',
    options: [],
  },
  {
    sourcePath: 'applicant2.dob',
    question: 'Date of Birth',
    section: 'Applicant 2',
    dataType: 'date',
    options: [],
  },
  {
    sourcePath: 'applicant1.ssn',
    question: 'Social Security Number',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.ssn',
    question: 'Social Security Number',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.email',
    question: 'Email Address',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.email',
    question: 'Email Address',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.phone',
    question: 'Phone Number',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.phone',
    question: 'Phone Number',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.maritalStatus',
    question: 'Marital Status',
    section: 'Applicant 1',
    dataType: 'enum',
    options: [
      {
        value: 'Single',
        label: 'Single',
      },
      {
        value: 'Married',
        label: 'Married',
      },
      {
        value: 'Divorced',
        label: 'Divorced',
      },
      {
        value: 'Separated',
        label: 'Separated',
      },
      {
        value: 'Widowed',
        label: 'Widowed',
      },
    ],
  },
  {
    sourcePath: 'applicant2.maritalStatus',
    question: 'Marital Status',
    section: 'Applicant 2',
    dataType: 'enum',
    options: [
      {
        value: 'Single',
        label: 'Single',
      },
      {
        value: 'Married',
        label: 'Married',
      },
      {
        value: 'Divorced',
        label: 'Divorced',
      },
      {
        value: 'Separated',
        label: 'Separated',
      },
      {
        value: 'Widowed',
        label: 'Widowed',
      },
    ],
  },
  {
    sourcePath: 'applicant1.occupation',
    question: 'Occupation',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.occupation',
    question: 'Occupation',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.dlNumber',
    question: "Driver's State - License Number",
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.dlNumber',
    question: "Driver's State - License Number",
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.educationLevel',
    question: 'Highest Level of Education',
    section: 'Applicant 1',
    dataType: 'enum',
    options: [
      {
        value: 'High School',
        label: 'High School',
      },
      {
        value: 'Some College or Trade School',
        label: 'Some College or Trade School',
      },
      {
        value: 'Bachelors',
        label: 'Bachelors',
      },
      {
        value: 'Masters or Higher',
        label: 'Masters or Higher',
      },
    ],
  },
  {
    sourcePath: 'applicant2.educationLevel',
    question: 'Highest Level of Education',
    section: 'Applicant 2',
    dataType: 'enum',
    options: [
      {
        value: 'High School',
        label: 'High School',
      },
      {
        value: 'Some College or Trade School',
        label: 'Some College or Trade School',
      },
      {
        value: 'Bachelors',
        label: 'Bachelors',
      },
      {
        value: 'Masters or Higher',
        label: 'Masters or Higher',
      },
    ],
  },
  {
    sourcePath: 'isPropertyInEntityName',
    question: 'Is the property in the name of an Estate, Trust, LLC, etc.?',
    section: 'Home Insurance',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'propertyEntityName',
    question: 'Type of Ownership - Name of Entity',
    section: 'Home Insurance',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'hasSecondApplicant',
    question: 'Is there a second applicant on the policy?',
    section: 'Home Insurance',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'applicant1.physicalAddress',
    question: 'Physical Address',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.physicalAddress',
    question: 'Physical Address',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.physicalCity',
    question: 'City',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.physicalCity',
    question: 'City',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.physicalState',
    question: 'State',
    section: 'Applicant 1',
    dataType: 'enum',
    options: [],
  },
  {
    sourcePath: 'applicant2.physicalState',
    question: 'State',
    section: 'Applicant 2',
    dataType: 'enum',
    options: [],
  },
  {
    sourcePath: 'applicant1.physicalZipCode',
    question: 'Zip Code',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.physicalZipCode',
    question: 'Zip Code',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.livedAtAddressLessThan3Years',
    question: 'Has client lived at this address for less than 3 years?',
    section: 'Applicant 1',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'applicant2.livedAtAddressLessThan3Years',
    question: 'Has client lived at this address for less than 3 years?',
    section: 'Applicant 2',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'applicant1.priorAddress',
    question: 'Prior Address',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.priorAddress',
    question: 'Prior Address',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.priorCity',
    question: 'City',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.priorCity',
    question: 'City',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.priorState',
    question: 'State',
    section: 'Applicant 1',
    dataType: 'enum',
    options: [],
  },
  {
    sourcePath: 'applicant2.priorState',
    question: 'State',
    section: 'Applicant 2',
    dataType: 'enum',
    options: [],
  },
  {
    sourcePath: 'applicant1.priorZipCode',
    question: 'Zip Code',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.priorZipCode',
    question: 'Zip Code',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.mailingAddressSameAsPhysical',
    question: 'Mailing address is the same as physical address',
    section: 'Applicant 1',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'applicant2.mailingAddressSameAsPhysical',
    question: 'Mailing address is the same as physical address',
    section: 'Applicant 2',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'applicant1.mailingAddress',
    question: 'Mailing Address',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.mailingAddress',
    question: 'Mailing Address',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.mailingCity',
    question: 'City',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.mailingCity',
    question: 'City',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant1.mailingState',
    question: 'State',
    section: 'Applicant 1',
    dataType: 'enum',
    options: [],
  },
  {
    sourcePath: 'applicant2.mailingState',
    question: 'State',
    section: 'Applicant 2',
    dataType: 'enum',
    options: [],
  },
  {
    sourcePath: 'applicant1.mailingZipCode',
    question: 'Zip Code',
    section: 'Applicant 1',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'applicant2.mailingZipCode',
    question: 'Zip Code',
    section: 'Applicant 2',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'quoteNeededBy',
    question: 'Quote Needed By?',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'insuredLocationSameAsApplicant',
    question: 'Insured location is same as applicant address',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'address',
    question: 'Street Address',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'city',
    question: 'City',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'state',
    question: 'State',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [],
  },
  {
    sourcePath: 'zipCode',
    question: 'ZIP Code',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'currentHomeInsuranceCarrier',
    question: 'Current Home Insurance Carrier',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'currentHomePolicyExpirationDate',
    question: 'Current Policy Expiration Date',
    section: 'Home Quote Form',
    dataType: 'date',
    options: [],
  },
  {
    sourcePath: 'currentInsurancePremium',
    question: 'Current Annual Premium',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'propertyStatus',
    question: 'Property Status',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'New Purchase',
        label: 'New Purchase',
      },
      {
        value: 'New Purchase - Bond for Deed',
        label: 'New Purchase - Bond for Deed',
      },
      {
        value: 'Owner Occupied (Primary)',
        label: 'Owner Occupied (Primary)',
      },
      {
        value: 'Seasonal/Secondary',
        label: 'Seasonal/Secondary',
      },
      {
        value: 'Tenant Occupied',
        label: 'Tenant Occupied',
      },
      {
        value: 'Vacant',
        label: 'Vacant',
      },
      {
        value: 'Vacant Renovation',
        label: 'Vacant Renovation',
      },
      {
        value: 'Vacant For Sale',
        label: 'Vacant For Sale',
      },
      {
        value: 'Builders Risk',
        label: 'Builders Risk',
      },
    ],
  },
  {
    sourcePath: 'purchaseDate',
    question: 'When did you purchase the Property?',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'purchasePrice',
    question: 'Purchase Price',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'numberOfResidents',
    question: 'Number of Residents',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'homeClaimsLast5Years',
    question: 'Any Claims in the Last 5 Years',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'existingDamageOnHome',
    question: 'Any Existing Damage to Your Home',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'homeInsurancePayor',
    question: 'Who Pays For The Home Insurance',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [],
  },
  {
    sourcePath: 'loanNumber',
    question: 'Lender &amp; Loan Number',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'floodZone',
    question: 'Flood Zone',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'Zone A',
        label: 'Zone A',
      },
      {
        value: 'Zone AE',
        label: 'Zone AE',
      },
      {
        value: 'Zone B',
        label: 'Zone B',
      },
      {
        value: 'Zone C',
        label: 'Zone C',
      },
      {
        value: 'Zone D',
        label: 'Zone D',
      },
      {
        value: 'Zone V',
        label: 'Zone V',
      },
      {
        value: 'Zone VE',
        label: 'Zone VE',
      },
      {
        value: 'Zone X',
        label: 'Zone X',
      },
    ],
  },
  {
    sourcePath: 'quoteFloodInAdditionToHome',
    question: 'Quote Flood In Addition To Home?',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'yearBuilt',
    question: 'Year Built',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'acreage',
    question: 'Acreage',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'numberOfBedrooms',
    question: 'Number of Bedrooms',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'numberOfBathrooms',
    question: 'Number of Bathrooms',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'bathroomConstructionGrade',
    question: 'Bathroom Grade',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'Economy / Basic',
        label: 'Economy / Basic',
      },
      {
        value: "Builder's Grade / Standard",
        label: "Builder's Grade / Standard",
      },
      {
        value: 'Semi-Custom / Good',
        label: 'Semi-Custom / Good',
      },
      {
        value: 'Custom',
        label: 'Custom',
      },
      {
        value: 'Designer / Luxury',
        label: 'Designer / Luxury',
      },
    ],
  },
  {
    sourcePath: 'kitchenConstructionGrade',
    question: 'Kitchen Grade',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'Economy / Basic',
        label: 'Economy / Basic',
      },
      {
        value: "Builder's Grade / Standard",
        label: "Builder's Grade / Standard",
      },
      {
        value: 'Semi-Custom / Good',
        label: 'Semi-Custom / Good',
      },
      {
        value: 'Custom',
        label: 'Custom',
      },
      {
        value: 'Designer / Luxury',
        label: 'Designer / Luxury',
      },
    ],
  },
  {
    sourcePath: 'squareFootage',
    question: 'Living Square Feet',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'numberOfStories',
    question: 'Number of Stories',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'isVisibleToNeighbors',
    question: 'Visible to Neighbors?',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [
      {
        value: 'Yes',
        label: 'Yes',
      },
      {
        value: 'No',
        label: 'No',
      },
    ],
  },
  {
    sourcePath: 'protectionClass',
    question: 'Protection Class',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'propertyType',
    question: 'Property Type',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'single_family',
        label: 'Single Family',
      },
      {
        value: 'condo',
        label: 'Condo',
      },
      {
        value: 'townhouse',
        label: 'Townhouse',
      },
      {
        value: 'multi_family',
        label: 'Multi Family',
      },
    ],
  },
  {
    sourcePath: 'constructionType',
    question: 'Construction Type',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'frame',
        label: 'Frame',
      },
      {
        value: 'masonry',
        label: 'Masonry',
      },
      {
        value: 'masonry_veneer',
        label: 'Masonry Veneer',
      },
      {
        value: 'metal',
        label: 'Metal',
      },
      {
        value: 'log_cabin',
        label: 'Log Cabin',
      },
      {
        value: 'other',
        label: 'Other',
      },
    ],
  },
  {
    sourcePath: 'frameExteriorMaterials',
    question: 'Frame Exterior Materials',
    section: 'Home Quote Form',
    dataType: 'multiselect',
    options: [
      {
        value: 'Adobe / rammed earth',
        label: 'Adobe / rammed earth',
      },
      {
        value: 'Aluminum siding',
        label: 'Aluminum siding',
      },
      {
        value: 'Board-and-batten (wood or fiber cement)',
        label: 'Board-and-batten (wood or fiber cement)',
      },
      {
        value: 'Brick veneer',
        label: 'Brick veneer',
      },
      {
        value: 'Concrete block (CMU)',
        label: 'Concrete block (CMU)',
      },
      {
        value: 'Engineered wood siding (LP SmartSide, etc.)',
        label: 'Engineered wood siding (LP SmartSide, etc.)',
      },
      {
        value: 'Exterior insulation + finish (EIFS)',
        label: 'Exterior insulation + finish (EIFS)',
      },
      {
        value: 'Fiber cement siding (Hardie board)',
        label: 'Fiber cement siding (Hardie board)',
      },
      {
        value: 'Glass / curtain wall (modern)',
        label: 'Glass / curtain wall (modern)',
      },
      {
        value: 'Log / timber exterior',
        label: 'Log / timber exterior',
      },
      {
        value: 'Metal panels (standing seam / corrugated)',
        label: 'Metal panels (standing seam / corrugated)',
      },
      {
        value: 'Mixed materials (e.g., brick + siding, stone + fiber cement)',
        label: 'Mixed materials (e.g., brick + siding, stone + fiber cement)',
      },
      {
        value: 'Natural stone (masonry)',
        label: 'Natural stone (masonry)',
      },
      {
        value: 'Plywood/composite panel siding',
        label: 'Plywood/composite panel siding',
      },
      {
        value: 'Poured concrete walls',
        label: 'Poured concrete walls',
      },
      {
        value: 'Solid brick (masonry)',
        label: 'Solid brick (masonry)',
      },
      {
        value: 'Steel siding',
        label: 'Steel siding',
      },
      {
        value: 'Stone veneer',
        label: 'Stone veneer',
      },
      {
        value: 'Stucco (traditional / EIFS)',
        label: 'Stucco (traditional / EIFS)',
      },
      {
        value: 'Synthetic stucco (EIFS)',
        label: 'Synthetic stucco (EIFS)',
      },
      {
        value: 'Vertical siding (T1-11 / panel siding)',
        label: 'Vertical siding (T1-11 / panel siding)',
      },
      {
        value: 'Vinyl siding',
        label: 'Vinyl siding',
      },
      {
        value: 'Wood lap siding (clapboard)',
        label: 'Wood lap siding (clapboard)',
      },
      {
        value: 'Wood shingles / shakes (cedar)',
        label: 'Wood shingles / shakes (cedar)',
      },
    ],
  },
  {
    sourcePath: 'constructionTypeOtherDescription',
    question: 'Construction Type – Other',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'roofType',
    question: 'Roof Type',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'architectural_shingle',
        label: 'Architectural Shingle',
      },
      {
        value: 'three_tab_shingle',
        label: 'Three Tab Shingle',
      },
      {
        value: 'tile',
        label: 'Tile',
      },
      {
        value: 'metal',
        label: 'Metal',
      },
      {
        value: 'wood',
        label: 'Wood',
      },
      {
        value: 'other',
        label: 'Other',
      },
    ],
  },
  {
    sourcePath: 'roofTypeOtherDescription',
    question: 'Roof Type – Other',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'roofShape',
    question: 'Roof Shape',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'Gabled',
        label: 'Gabled',
      },
      {
        value: 'Full Hipped',
        label: 'Full Hipped',
      },
      {
        value: 'Partial Hipped',
        label: 'Partial Hipped',
      },
      {
        value: 'Flat',
        label: 'Flat',
      },
      {
        value: 'Other',
        label: 'Other',
      },
    ],
  },
  {
    sourcePath: 'roofShapeOtherDescription',
    question: 'Roof Shape – Other',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'fortifiedRoofCertificate',
    question: 'Fortified Roof Certificate',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'No',
        label: 'No',
      },
      {
        value: 'Bronze',
        label: 'Bronze',
      },
      {
        value: 'Silver',
        label: 'Silver',
      },
      {
        value: 'Gold',
        label: 'Gold',
      },
    ],
  },
  {
    sourcePath: 'hasSolarPanels',
    question: 'Has Solar Panels?',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [
      {
        value: 'Yes',
        label: 'Yes',
      },
      {
        value: 'No',
        label: 'No',
      },
    ],
  },
  {
    sourcePath: 'hasSkylights',
    question: 'Has Skylights?',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [
      {
        value: 'Yes',
        label: 'Yes',
      },
      {
        value: 'No',
        label: 'No',
      },
    ],
  },
  {
    sourcePath: 'foundationType',
    question: 'Foundation Type',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'Slab',
        label: 'Slab',
      },
      {
        value: 'Slab With Basement',
        label: 'Slab With Basement',
      },
      {
        value: 'Raised',
        label: 'Raised',
      },
    ],
  },
  {
    sourcePath: 'homeRaisedHeightFt',
    question: 'How High (feet)',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'foundationOpenOrClosed',
    question: 'Open or Closed',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'Open',
        label: 'Open',
      },
      {
        value: 'Closed',
        label: 'Closed',
      },
    ],
  },
  {
    sourcePath: 'hasHandrailsOnStepsPorch',
    question: 'Handrails / Railings',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'Present',
        label: 'Present',
      },
      {
        value: 'Not Present',
        label: 'Not Present',
      },
    ],
  },
  {
    sourcePath: 'garageType',
    question: 'Garage Type',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: '1 Car Attached',
        label: '1 Car Attached',
      },
      {
        value: '2 Car Attached',
        label: '2 Car Attached',
      },
      {
        value: 'Multi Car Attached',
        label: 'Multi Car Attached',
      },
      {
        value: '1 Car Carport',
        label: '1 Car Carport',
      },
      {
        value: '2 Car Carport',
        label: '2 Car Carport',
      },
      {
        value: 'Detached Garage',
        label: 'Detached Garage',
      },
      {
        value: 'None',
        label: 'None',
      },
    ],
  },
  {
    sourcePath: 'otherStructuresDescription',
    question: 'Describe any "Other Structures"',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'renovationBuildersRiskEstimatedStartDate',
    question: 'Estimated start date?',
    section: 'Home Quote Form',
    dataType: 'date',
    options: [],
  },
  {
    sourcePath: 'renovationBuildersRiskProjectDuration',
    question: 'How long will the project last?',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'renovationBuildersRiskTotalAnticipatedCost',
    question: 'Total anticipated cost of renovations/construction?',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'renovationBuildersRiskOccupancyAfterRenovation',
    question: 'What will the occupancy be after renovation?',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'renovationBuildersRiskWorkDescription',
    question: 'For renovations, describe the work being done.',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'renovationBuildersRiskOccupiedDuringRenovation',
    question: 'Will the home be occupied during renovations?',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'renovationBuildersRiskWorkPerformedBy',
    question: 'Who is doing the work?',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'Licensed Contractor',
        label: 'Licensed Contractor',
      },
      {
        value: 'Handyman',
        label: 'Handyman',
      },
      {
        value: 'Insured',
        label: 'Insured',
      },
      {
        value: 'Other',
        label: 'Other',
      },
    ],
  },
  {
    sourcePath: 'renovationBuildersRiskLicensedContractorDetails',
    question: 'Licensed Contractor - Name and License Number',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'renovationBuildersRiskHandymanDetails',
    question: 'Handyman - Name or business name',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'renovationBuildersRiskInsuredYearsExperience',
    question: 'Insured - Years of experience',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'renovationBuildersRiskOtherExplanation',
    question: 'Other explanation',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'yearOfLastRoofUpdate',
    question: 'Roof',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'electricalLastUpdateYear',
    question: 'Electrical',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'plumbingLastUpdateYear',
    question: 'Plumbing',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'hvacLastUpdateYear',
    question: 'HVAC',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'h2oHeaterLastUpdateYear',
    question: 'H2O Heater',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'airConditioningTypes',
    question: 'Air Conditioning Types',
    section: 'Home Quote Form',
    dataType: 'multiselect',
    options: [
      {
        value: 'None',
        label: 'None',
      },
      {
        value: 'Central HVAC Electric',
        label: 'Central HVAC Electric',
      },
      {
        value: 'Central HVAC Gas',
        label: 'Central HVAC Gas',
      },
      {
        value: 'Mini-Splits',
        label: 'Mini-Splits',
      },
      {
        value: 'Window Units',
        label: 'Window Units',
      },
    ],
  },
  {
    sourcePath: 'heatTypes',
    question: 'Heat Types',
    section: 'Home Quote Form',
    dataType: 'multiselect',
    options: [
      {
        value: 'None',
        label: 'None',
      },
      {
        value: 'Forced Air Electric',
        label: 'Forced Air Electric',
      },
      {
        value: 'Forced Air Gas',
        label: 'Forced Air Gas',
      },
      {
        value: 'Radiant Heating',
        label: 'Radiant Heating',
      },
      {
        value: 'Wood Burning Fireplace',
        label: 'Wood Burning Fireplace',
      },
      {
        value: 'Gas Fireplace',
        label: 'Gas Fireplace',
      },
      {
        value: 'Wood Stove',
        label: 'Wood Stove',
      },
    ],
  },
  {
    sourcePath: 'hotWaterHeaterType',
    question: 'H2O Heater Type & Location',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'alarmSystem',
    question: 'Alarm System',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'No',
        label: 'No',
      },
      {
        value: 'Yes - Local',
        label: 'Yes - Local',
      },
      {
        value: 'Yes - Monitored Burglary',
        label: 'Yes - Monitored Burglary',
      },
      {
        value: 'Yes - Monitored Burglary & Fire',
        label: 'Yes - Monitored Burglary & Fire',
      },
    ],
  },
  {
    sourcePath: 'hasSmokeDetectors',
    question: 'Has Smoke Detectors',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'hasFireExtinguisher',
    question: 'Has Fire Extinguisher',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'hasDeadbolts',
    question: 'Has Deadbolts',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'hasBurglarBars',
    question: 'Has Burglar Bars',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'hasBackupGenerator',
    question: 'Has Backup Generator',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'hasAutoWaterShutoff',
    question: 'Has Auto Water Shutoff Valve',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'belongsToHoaCoa',
    question: 'Has HOA or COA',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'hoaCoaSecurityFeatures',
    question: 'HOA/COA Security Features',
    section: 'Home Quote Form',
    dataType: 'multiselect',
    options: [
      {
        value: '24 Hour Security Guard',
        label: '24 Hour Security Guard',
      },
      {
        value: 'One Way In/Out',
        label: 'One Way In/Out',
      },
      {
        value: 'Gated Access',
        label: 'Gated Access',
      },
    ],
  },
  {
    sourcePath: 'hasPool',
    question: 'Has Pool or Pond',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'poolFeatures',
    question: 'Pool Features',
    section: 'Home Quote Form',
    dataType: 'multiselect',
    options: [
      {
        value: 'Above Ground',
        label: 'Above Ground',
      },
      {
        value: 'In Ground',
        label: 'In Ground',
      },
      {
        value: 'Diving Board',
        label: 'Diving Board',
      },
      {
        value: 'Slide',
        label: 'Slide',
      },
      {
        value: "Fenced in with a 4' self locking gate",
        label: "Fenced (4' self-locking gate)",
      },
    ],
  },
  {
    sourcePath: 'hasTrampoline',
    question: 'Has Trampoline',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'trampolineFeatures',
    question: 'Trampoline Features',
    section: 'Home Quote Form',
    dataType: 'multiselect',
    options: [
      {
        value: 'Protective Net',
        label: 'Protective Net',
      },
      {
        value: 'Willing to remove for more quotes',
        label: 'Willing to remove for more quotes',
      },
    ],
  },
  {
    sourcePath: 'hasPets',
    question: 'Has Pets',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'petsDescription',
    question: 'Describe Pets - Type, Breed, History of Biting',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'hasFarming',
    question: 'Farming/Farm Animals On Property',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'farmingLivestockDescription',
    question: 'Describe Farming / Livestock',
    section: 'Home Quote Form',
    dataType: 'text',
    options: [],
  },
  {
    sourcePath: 'hasFuelTanks',
    question: 'Fuel tanks on premises (propane, natural gas, etc.)',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'fuelTankAboveGround',
    question: 'Above Ground',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'fuelTankBelowGround',
    question: 'Below Ground',
    section: 'Home Quote Form',
    dataType: 'boolean',
    options: [],
  },
  {
    sourcePath: 'coverageA_Dwelling',
    question: 'Coverage A - Dwelling',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'coverageD_LossOfUse',
    question: 'Coverage D - Loss of Use',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'coverageB_OtherStructures',
    question: 'Coverage B - Other Structures',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'coverageE_Liability',
    question: 'Coverage E - Liability',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: '$100,000',
        label: '$100,000',
      },
      {
        value: '$300,000',
        label: '$300,000',
      },
      {
        value: '$500,000',
        label: '$500,000',
      },
      {
        value: '$1,000,000',
        label: '$1,000,000',
      },
    ],
  },
  {
    sourcePath: 'coverageC_PersonalProperty',
    question: 'Coverage C - Personal Property',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [],
  },
  {
    sourcePath: 'coverageF_MedicalPayments',
    question: 'Coverage F - Medical Payments',
    section: 'Home Quote Form',
    dataType: 'enum',
    options: [
      {
        value: 'None',
        label: 'None',
      },
      {
        value: '$1,000',
        label: '$1,000',
      },
      {
        value: '$2,000',
        label: '$2,000',
      },
      {
        value: '$5,000',
        label: '$5,000',
      },
      {
        value: '$10,000',
        label: '$10,000',
      },
      {
        value: '$25,000',
        label: '$25,000',
      },
      {
        value: '$50,000',
        label: '$50,000',
      },
    ],
  },
  {
    sourcePath: 'allOtherPerilsDeductible',
    question: 'All Other Perils Deductible',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [
      {
        value: '1000',
        label: '$1,000',
      },
      {
        value: '1500',
        label: '$1,500',
      },
      {
        value: '2000',
        label: '$2,000',
      },
      {
        value: '2500',
        label: '$2,500',
      },
      {
        value: '5000',
        label: '$5,000',
      },
      {
        value: '1%',
        label: '1%',
      },
      {
        value: '2%',
        label: '2%',
      },
      {
        value: '3%',
        label: '3%',
      },
      {
        value: '4%',
        label: '4%',
      },
      {
        value: '5%',
        label: '5%',
      },
    ],
  },
  {
    sourcePath: 'windHailNamedStormDeductible',
    question: 'Wind or Named Storm Deductible',
    section: 'Home Quote Form',
    dataType: 'number',
    options: [
      {
        value: '1000',
        label: '$1,000',
      },
      {
        value: '1500',
        label: '$1,500',
      },
      {
        value: '2000',
        label: '$2,000',
      },
      {
        value: '2500',
        label: '$2,500',
      },
      {
        value: '5000',
        label: '$5,000',
      },
      {
        value: '1%',
        label: '1%',
      },
      {
        value: '2%',
        label: '2%',
      },
      {
        value: '3%',
        label: '3%',
      },
      {
        value: '4%',
        label: '4%',
      },
      {
        value: '5%',
        label: '5%',
      },
    ],
  },
];
