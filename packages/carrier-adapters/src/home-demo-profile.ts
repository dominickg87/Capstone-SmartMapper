// Value-free structure from Dom's explicitly supplied mapping worksheet.
export interface HomeDemoField {
  number: number;
  id: string;
  name: string;
  label: string;
  type: string;
  visible: boolean;
  options: Array<{ label: string; disabled: boolean }>;
  sourcePath?: string;
}
export const homeDemoProfile = {
  revision: 'home-demo-1',
  worksheetHash: '7877d5b577120a457543e01221e87800973568fe0261e494b86fccbd71d430a4',
  origin: 'https://www.alliedtrustagents.com',
  pathname: '/Quote/Quote.aspx',
  fields: [
    {
      number: 1,
      id: '(none)',
      name: '(none)',
      label: 'Enter Value',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 2,
      id: 'ctl06_SourceFilterSearchPanel',
      name: 'ctl00$ctl06$SourceFilterSearchPanel',
      label: 'Source:',
      type: 'dropdown',
      visible: false,
      options: [
        {
          label: 'All',
          disabled: false,
        },
        {
          label: 'Policy',
          disabled: false,
        },
        {
          label: 'Quote',
          disabled: false,
        },
      ],
    },
    {
      number: 3,
      id: '(none)',
      name: '(none)',
      label: 'Clear',
      type: 'button',
      visible: false,
      options: [],
    },
    {
      number: 4,
      id: 'ctl06_StatusFilterSearchPanel',
      name: 'ctl00$ctl06$StatusFilterSearchPanel',
      label: 'Status:',
      type: 'dropdown',
      visible: false,
      options: [
        {
          label: 'Current Apps',
          disabled: false,
        },
        {
          label: 'Issued',
          disabled: false,
        },
        {
          label: 'Submitted',
          disabled: false,
        },
        {
          label: 'Bound',
          disabled: false,
        },
        {
          label: 'Declined',
          disabled: false,
        },
        {
          label: 'Pending Renewal',
          disabled: false,
        },
        {
          label: 'Pending Renewal Expired',
          disabled: false,
        },
        {
          label: 'Pending Non-Renewal',
          disabled: false,
        },
        {
          label: 'Non Renewed',
          disabled: false,
        },
        {
          label: 'Pending Cancel',
          disabled: false,
        },
        {
          label: 'Cancelled',
          disabled: false,
        },
        {
          label: 'Expired',
          disabled: false,
        },
        {
          label: 'Active',
          disabled: false,
        },
        {
          label: 'Converted',
          disabled: false,
        },
        {
          label: 'All',
          disabled: false,
        },
      ],
    },
    {
      number: 5,
      id: 'ctl06_LastNameSearchPanel',
      name: 'ctl00$ctl06$LastNameSearchPanel',
      label: 'Last Name:',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 6,
      id: 'ctl06_FirstNameSearchPanel',
      name: 'ctl00$ctl06$FirstNameSearchPanel',
      label: 'First Name:',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 7,
      id: 'ctl06_PropertySearchPanel',
      name: 'ctl00$ctl06$PropertySearchPanel',
      label: 'Property Address:',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 8,
      id: 'ctl06_PhoneSearchPanel',
      name: 'ctl00$ctl06$PhoneSearchPanel',
      label: 'Phone Number:',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 9,
      id: 'ctl06_ProductCodeSearchPanel',
      name: 'ctl00$ctl06$ProductCodeSearchPanel',
      label: 'Product Code:',
      type: 'dropdown',
      visible: false,
      options: [
        {
          label: 'All',
          disabled: false,
        },
        {
          label: 'HO3LA',
          disabled: false,
        },
        {
          label: 'HO3NC',
          disabled: false,
        },
        {
          label: 'HO3SC',
          disabled: false,
        },
        {
          label: 'HO3TX',
          disabled: false,
        },
        {
          label: 'HO6',
          disabled: false,
        },
        {
          label: 'DP3LA',
          disabled: false,
        },
        {
          label: 'DP3TX',
          disabled: false,
        },
        {
          label: 'PUP',
          disabled: false,
        },
        {
          label: 'PPATX',
          disabled: false,
        },
      ],
    },
    {
      number: 10,
      id: 'ctl06_StateDropDownList',
      name: 'ctl00$ctl06$StateDropDownList',
      label: 'State:',
      type: 'dropdown',
      visible: false,
      options: [
        {
          label: 'All',
          disabled: false,
        },
        {
          label: 'TX',
          disabled: false,
        },
        {
          label: 'SC',
          disabled: false,
        },
        {
          label: 'NC',
          disabled: false,
        },
        {
          label: 'LA',
          disabled: false,
        },
      ],
    },
    {
      number: 11,
      id: 'ctl06_btnMyToolsCustomerSearch',
      name: 'ctl00$ctl06$btnMyToolsCustomerSearch',
      label: 'ctl00$ctl06$btnMyToolsCustomerSearch',
      type: 'submit',
      visible: false,
      options: [],
    },
    {
      number: 12,
      id: 'ContentPlaceHolderHeader_TopNavOne1_txtId',
      name: 'ctl00$ContentPlaceHolderHeader$TopNavOne1$txtId',
      label: 'Policy/Quote ID',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 13,
      id: 'ContentPlaceHolderHeader_TopNavOne1_btnGoId',
      name: 'ctl00$ContentPlaceHolderHeader$TopNavOne1$btnGoId',
      label: 'ctl00$ContentPlaceHolderHeader$TopNavOne1$btnGoId',
      type: 'submit',
      visible: true,
      options: [],
    },
    {
      number: 14,
      id: '(none)',
      name: '(none)',
      label: 'Enter Value',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 15,
      id: 'ctl00_ContentPlaceHolderBody_ApplicantPropertyLoc1_EffectiveDate',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$EffectiveDate',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$EffectiveDate',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 16,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ddlState',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ddlState',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ddlState',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: true,
        },
        {
          label: 'LA',
          disabled: true,
        },
      ],
    },
    {
      number: 17,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ddlProduct',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ddlProduct',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ddlProduct',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'HO3LA',
          disabled: true,
        },
      ],
    },
    {
      number: 18,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_CompanionPolicyId',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$CompanionPolicyId',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$CompanionPolicyId',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 19,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtInsFirstName',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtInsFirstName',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtInsFirstName',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'applicant1.firstName',
    },
    {
      number: 20,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtMI',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtMI',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtMI',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 21,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtInsLastName',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtInsLastName',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtInsLastName',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'applicant1.lastName',
    },
    {
      number: 22,
      id: 'ctl00_ContentPlaceHolderBody_ApplicantPropertyLoc1_dtInsBirthDt',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$dtInsBirthDt',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$dtInsBirthDt',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'applicant1.dob',
    },
    {
      number: 23,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtSSN',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtSSN',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtSSN',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'applicant1.ssn',
    },
    {
      number: 24,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_InsHomePhone',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$InsHomePhone',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$InsHomePhone',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'applicant1.phone',
    },
    {
      number: 25,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtInsEmail',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtInsEmail',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtInsEmail',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'applicant1.email',
    },
    {
      number: 26,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_FirstName',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$FirstName',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$FirstName',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 27,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_MiddleInitial',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$MiddleInitial',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$MiddleInitial',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 28,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_LastName',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$LastName',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$LastName',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 29,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_BirthDate',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$BirthDate',
      label: 'mm/dd/yyyy',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 30,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_SocialSecurityNumberInput',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$SocialSecurityNumberInput',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$SocialSecurityNumberInput',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 31,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_Phone',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$Phone',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$Phone',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 32,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_Email',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$Email',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$Email',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 33,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_MaritalStatus',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$MaritalStatus',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$MaritalStatus',
      type: 'dropdown',
      visible: false,
      options: [],
    },
    {
      number: 34,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtPropertyAddress1',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtPropertyAddress1',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtPropertyAddress1',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'applicant1.physicalAddress',
    },
    {
      number: 35,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtAddress2',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtAddress2',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtAddress2',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 36,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtPropertyCity',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtPropertyCity',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtPropertyCity',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'applicant1.physicalCity',
    },
    {
      number: 37,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtState',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtState',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtState',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'applicant1.physicalState',
    },
    {
      number: 38,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtPropertyZip',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtPropertyZip',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtPropertyZip',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'applicant1.physicalZipCode',
    },
    {
      number: 39,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtZipPlus4',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtZipPlus4',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtZipPlus4',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 40,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_txtPropertyCounty',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtPropertyCounty',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$txtPropertyCounty',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 41,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ddlPropertyCountyCd',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ddlPropertyCountyCd',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ddlPropertyCountyCd',
      type: 'dropdown',
      visible: true,
      options: [],
    },
    {
      number: 42,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_btnGoogleMaps',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$btnGoogleMaps',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$btnGoogleMaps',
      type: 'submit',
      visible: true,
      options: [],
    },
    {
      number: 43,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_PropertyAddress1',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyAddress1',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyAddress1',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 44,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_PropertyAddress2',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyAddress2',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyAddress2',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 45,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_PropertyCity',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyCity',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyCity',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 46,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_PropertyState',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyState',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyState',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 47,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_PropertyZip',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyZip',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyZip',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 48,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_PropertyZip4',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyZip4',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyZip4',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 49,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_PropertyCounty',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyCounty',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyCounty',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 50,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_PropertyCountyCore',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyCountyCore',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$PropertyCountyCore',
      type: 'dropdown',
      visible: false,
      options: [],
    },
    {
      number: 51,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ddlIsTimeAtResidenceWithin',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ddlIsTimeAtResidenceWithin',
      label: 'Have you lived at this address for more than 5 years?',
      type: 'dropdown',
      visible: false,
      options: [],
    },
    {
      number: 52,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_SaveButton',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$SaveButton',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$SaveButton',
      type: 'submit',
      visible: false,
      options: [],
    },
    {
      number: 53,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_SimplifiedISOPdfButton',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$SimplifiedISOPdfButton',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$SimplifiedISOPdfButton',
      type: 'submit',
      visible: false,
      options: [],
    },
    {
      number: 54,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_SimplifiedISOXmlButton',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$SimplifiedISOXmlButton',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$SimplifiedISOXmlButton',
      type: 'submit',
      visible: false,
      options: [],
    },
    {
      number: 55,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_Button3',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$Button3',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$Button3',
      type: 'submit',
      visible: false,
      options: [],
    },
    {
      number: 56,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_IsMailingAddress',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$IsMailingAddress',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$IsMailingAddress',
      type: 'dropdown',
      visible: false,
      options: [],
    },
    {
      number: 57,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPhysicalAddress1',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalAddress1',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalAddress1',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 58,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPhysicalAddress2',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalAddress2',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalAddress2',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 59,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPhysicalCity',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalCity',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalCity',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 60,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPhysicalState',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalState',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalState',
      type: 'dropdown',
      visible: false,
      options: [],
    },
    {
      number: 61,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPhysicalZip',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalZip',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalZip',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 62,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPhysicalZip4',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalZip4',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPhysicalZip4',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 63,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_IsTimeAtResidenceWithin',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$IsTimeAtResidenceWithin',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$IsTimeAtResidenceWithin',
      type: 'dropdown',
      visible: false,
      options: [],
    },
    {
      number: 64,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPreviousResidenceAddress1',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceAddress1',
      label:
        'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceAddress1',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 65,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPreviousResidenceAddress2',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceAddress2',
      label:
        'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceAddress2',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 66,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPreviousResidenceCity',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceCity',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceCity',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 67,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPreviousResidenceState',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceState',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceState',
      type: 'dropdown',
      visible: false,
      options: [],
    },
    {
      number: 68,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPreviousResidenceZip',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceZip',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceZip',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 69,
      id: 'ContentPlaceHolderBody_ApplicantPropertyLoc1_ApplicantPreviousResidenceZip4',
      name: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceZip4',
      label: 'ctl00$ContentPlaceHolderBody$ApplicantPropertyLoc1$ApplicantPreviousResidenceZip4',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 70,
      id: 'ContentPlaceHolderBody_QuoteBody_PPCInside',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$PPCInside',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$PPCInside',
      type: 'dropdown',
      visible: false,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '1',
          disabled: false,
        },
        {
          label: '2',
          disabled: false,
        },
        {
          label: '3',
          disabled: false,
        },
        {
          label: '4',
          disabled: false,
        },
        {
          label: '5',
          disabled: false,
        },
        {
          label: '6',
          disabled: false,
        },
        {
          label: '7',
          disabled: false,
        },
        {
          label: '8',
          disabled: false,
        },
        {
          label: '9',
          disabled: false,
        },
        {
          label: '10',
          disabled: false,
        },
        {
          label: '10C',
          disabled: false,
        },
        {
          label: '10W',
          disabled: false,
        },
        {
          label: '1X',
          disabled: false,
        },
        {
          label: '1Y',
          disabled: false,
        },
        {
          label: '2X',
          disabled: false,
        },
        {
          label: '2Y',
          disabled: false,
        },
        {
          label: '3X',
          disabled: false,
        },
        {
          label: '3Y',
          disabled: false,
        },
        {
          label: '4X',
          disabled: false,
        },
        {
          label: '4Y',
          disabled: false,
        },
        {
          label: '5X',
          disabled: false,
        },
        {
          label: '5Y',
          disabled: false,
        },
        {
          label: '6X',
          disabled: false,
        },
        {
          label: '6Y',
          disabled: false,
        },
        {
          label: '7X',
          disabled: false,
        },
        {
          label: '7Y',
          disabled: false,
        },
        {
          label: '8A',
          disabled: false,
        },
        {
          label: '8B',
          disabled: false,
        },
        {
          label: '8X',
          disabled: false,
        },
        {
          label: '8Y',
          disabled: false,
        },
        {
          label: '9A',
          disabled: false,
        },
      ],
    },
    {
      number: 71,
      id: 'ContentPlaceHolderBody_QuoteBody_PPCOutside',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$PPCOutside',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$PPCOutside',
      type: 'dropdown',
      visible: false,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '1',
          disabled: false,
        },
        {
          label: '2',
          disabled: false,
        },
        {
          label: '3',
          disabled: false,
        },
        {
          label: '4',
          disabled: false,
        },
        {
          label: '5',
          disabled: false,
        },
        {
          label: '6',
          disabled: false,
        },
        {
          label: '7',
          disabled: false,
        },
        {
          label: '8',
          disabled: false,
        },
        {
          label: '9',
          disabled: false,
        },
        {
          label: '10',
          disabled: false,
        },
        {
          label: '10C',
          disabled: false,
        },
        {
          label: '10W',
          disabled: false,
        },
        {
          label: '1X',
          disabled: false,
        },
        {
          label: '1Y',
          disabled: false,
        },
        {
          label: '2X',
          disabled: false,
        },
        {
          label: '2Y',
          disabled: false,
        },
        {
          label: '3X',
          disabled: false,
        },
        {
          label: '3Y',
          disabled: false,
        },
        {
          label: '4X',
          disabled: false,
        },
        {
          label: '4Y',
          disabled: false,
        },
        {
          label: '5X',
          disabled: false,
        },
        {
          label: '5Y',
          disabled: false,
        },
        {
          label: '6X',
          disabled: false,
        },
        {
          label: '6Y',
          disabled: false,
        },
        {
          label: '7X',
          disabled: false,
        },
        {
          label: '7Y',
          disabled: false,
        },
        {
          label: '8A',
          disabled: false,
        },
        {
          label: '8B',
          disabled: false,
        },
        {
          label: '8X',
          disabled: false,
        },
        {
          label: '8Y',
          disabled: false,
        },
        {
          label: '9A',
          disabled: false,
        },
      ],
    },
    {
      number: 72,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlComparativeRaterCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlComparativeRaterCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlComparativeRaterCd',
      type: 'dropdown',
      visible: false,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'EZlynx',
          disabled: false,
        },
        {
          label: 'PL Rater',
          disabled: false,
        },
        {
          label: 'Applied Systems',
          disabled: false,
        },
      ],
    },
    {
      number: 73,
      id: 'ContentPlaceHolderBody_QuoteBody_btnMSBLookup',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$btnMSBLookup',
      label: 'MSB Replacement Cost Estimator',
      type: 'button',
      visible: true,
      options: [],
    },
    {
      number: 74,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_txtDwellingCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtDwellingCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtDwellingCvg',
      type: 'text',
      visible: true,
      options: [],
      sourcePath: 'coverageA_Dwelling',
    },
    {
      number: 75,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlConstructionTypeCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlConstructionTypeCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlConstructionTypeCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Frame',
          disabled: false,
        },
        {
          label: 'Masonry',
          disabled: false,
        },
        {
          label: 'Masonry Veneer',
          disabled: false,
        },
      ],
    },
    {
      number: 76,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlCoverageBLimitCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlCoverageBLimitCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlCoverageBLimitCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: '0%',
          disabled: false,
        },
        {
          label: '2%',
          disabled: false,
        },
        {
          label: '10%',
          disabled: false,
        },
        {
          label: '15%',
          disabled: false,
        },
        {
          label: '20%',
          disabled: false,
        },
        {
          label: '25%',
          disabled: false,
        },
        {
          label: '30%',
          disabled: false,
        },
        {
          label: '40%',
          disabled: false,
        },
        {
          label: '50%',
          disabled: false,
        },
      ],
    },
    {
      number: 77,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlFoundationType',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlFoundationType',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlFoundationType',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Slab on Ground',
          disabled: false,
        },
        {
          label: 'Piers or Pilings (Elevated)',
          disabled: false,
        },
        {
          label: 'Pier and Beam - Open (Crawl Space)',
          disabled: false,
        },
        {
          label: 'Pier and Beam - Enclosed (Crawl Space)',
          disabled: false,
        },
        {
          label: 'Basement',
          disabled: false,
        },
      ],
    },
    {
      number: 78,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlCoverageCLimitCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlCoverageCLimitCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlCoverageCLimitCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: '0%',
          disabled: false,
        },
        {
          label: '25%',
          disabled: false,
        },
        {
          label: '30%',
          disabled: false,
        },
        {
          label: '35%',
          disabled: false,
        },
        {
          label: '40%',
          disabled: false,
        },
        {
          label: '45%',
          disabled: false,
        },
        {
          label: '50%',
          disabled: false,
        },
        {
          label: '55%',
          disabled: false,
        },
        {
          label: '60%',
          disabled: false,
        },
        {
          label: '65%',
          disabled: false,
        },
        {
          label: '70%',
          disabled: false,
        },
        {
          label: '75%',
          disabled: false,
        },
      ],
    },
    {
      number: 79,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_txtTotalAreaSqFt',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtTotalAreaSqFt',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtTotalAreaSqFt',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 80,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlLossOfUseCvgCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlLossOfUseCvgCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlLossOfUseCvgCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: '10%',
          disabled: false,
        },
        {
          label: '15%',
          disabled: false,
        },
        {
          label: '20%',
          disabled: false,
        },
        {
          label: '25%',
          disabled: false,
        },
        {
          label: '30%',
          disabled: false,
        },
      ],
    },
    {
      number: 81,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlNbrFloorsCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlNbrFloorsCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlNbrFloorsCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '1',
          disabled: false,
        },
        {
          label: '1.5',
          disabled: false,
        },
        {
          label: '2',
          disabled: false,
        },
        {
          label: '2.5',
          disabled: false,
        },
        {
          label: '3',
          disabled: false,
        },
        {
          label: '3.5 +',
          disabled: false,
        },
      ],
    },
    {
      number: 82,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlLiabilityCvgCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlLiabilityCvgCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlLiabilityCvgCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '$100,000',
          disabled: false,
        },
        {
          label: '$300,000',
          disabled: false,
        },
        {
          label: '$500,000',
          disabled: false,
        },
      ],
    },
    {
      number: 83,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlSidingType',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlSidingType',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlSidingType',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Brick Veneer',
          disabled: false,
        },
        {
          label: 'Cement Fiber, Hardi-Board/Plank',
          disabled: false,
        },
        {
          label: 'Clapboard',
          disabled: false,
        },
        {
          label: 'Stone Veneer',
          disabled: false,
        },
        {
          label: 'Stucco Over Wood',
          disabled: false,
        },
        {
          label: 'Vinyl Over Wood',
          disabled: false,
        },
        {
          label: 'Wood',
          disabled: false,
        },
        {
          label: 'Aluminum Siding',
          disabled: false,
        },
        {
          label: 'Asbestos Siding',
          disabled: false,
        },
        {
          label: 'Concrete Block',
          disabled: false,
        },
        {
          label: 'EIFS or Dryvit',
          disabled: false,
        },
        {
          label: 'Logs, Solid',
          disabled: false,
        },
        {
          label: 'Logs, Veneer',
          disabled: false,
        },
        {
          label: 'Metal Siding',
          disabled: false,
        },
        {
          label: 'Solid Brick',
          disabled: false,
        },
        {
          label: 'Solid Stone',
          disabled: false,
        },
        {
          label: 'Wood/Shakes/Shingles',
          disabled: false,
        },
        {
          label: 'Other',
          disabled: false,
        },
      ],
    },
    {
      number: 84,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlMedicalCvgCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlMedicalCvgCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlMedicalCvgCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '$1,000',
          disabled: false,
        },
        {
          label: '$2,500',
          disabled: false,
        },
        {
          label: '$5,000',
          disabled: false,
        },
        {
          label: '$10,000',
          disabled: false,
        },
      ],
    },
    {
      number: 85,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlRoofType',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlRoofType',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlRoofType',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Architectural Shingle',
          disabled: false,
        },
        {
          label: 'Composite Shingle',
          disabled: false,
        },
        {
          label: 'Asbestos',
          disabled: false,
        },
        {
          label: 'Copper',
          disabled: false,
        },
        {
          label: 'Metal - Corrugated',
          disabled: false,
        },
        {
          label: 'Metal - Standing Seam',
          disabled: false,
        },
        {
          label: 'Metal - Other Than Standing Seam',
          disabled: false,
        },
        {
          label: 'Rolled Roofing',
          disabled: false,
        },
        {
          label: 'Rubber',
          disabled: false,
        },
        {
          label: 'Slate',
          disabled: false,
        },
        {
          label: 'Tar & Gravel',
          disabled: false,
        },
        {
          label: 'Tar Shingle',
          disabled: false,
        },
        {
          label: 'Tiles - Barrel',
          disabled: false,
        },
        {
          label: 'Tiles - Concrete',
          disabled: false,
        },
        {
          label: 'Tiles - Flat',
          disabled: false,
        },
        {
          label: 'Tiles - Other',
          disabled: false,
        },
        {
          label: 'Tin',
          disabled: false,
        },
        {
          label: 'Wood Shake/Shingle',
          disabled: false,
        },
        {
          label: 'Other',
          disabled: false,
        },
      ],
    },
    {
      number: 86,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlRoofShapeCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlRoofShapeCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlRoofShapeCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Gable',
          disabled: false,
        },
        {
          label: 'Hip - 90%',
          disabled: false,
        },
        {
          label: 'Partial Hip - 60%+',
          disabled: false,
        },
        {
          label: 'Flat - Poured Concrete',
          disabled: false,
        },
        {
          label: 'Flat - Other',
          disabled: false,
        },
        {
          label: 'Other',
          disabled: false,
        },
      ],
    },
    {
      number: 87,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlDeductibleAOPCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlDeductibleAOPCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlDeductibleAOPCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '$2,500',
          disabled: false,
        },
        {
          label: '0.5%',
          disabled: false,
        },
        {
          label: '1%',
          disabled: false,
        },
        {
          label: '2%',
          disabled: false,
        },
        {
          label: '3%',
          disabled: false,
        },
        {
          label: '5%',
          disabled: false,
        },
      ],
    },
    {
      number: 88,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlHasSecondaryRoof',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlHasSecondaryRoof',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlHasSecondaryRoof',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 89,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlDeductibleNamedStormCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlDeductibleNamedStormCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlDeductibleNamedStormCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '1%',
          disabled: false,
        },
        {
          label: '2%',
          disabled: false,
        },
        {
          label: '3%',
          disabled: false,
        },
        {
          label: '5%',
          disabled: false,
        },
      ],
    },
    {
      number: 90,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlSecondaryRoofMaterial',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlSecondaryRoofMaterial',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlSecondaryRoofMaterial',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: true,
        },
        {
          label: 'Architectural Shingle',
          disabled: true,
        },
        {
          label: 'Composite Shingle',
          disabled: true,
        },
        {
          label: 'Asbestos',
          disabled: true,
        },
        {
          label: 'Copper',
          disabled: true,
        },
        {
          label: 'Metal - Corrugated',
          disabled: true,
        },
        {
          label: 'Metal - Standing Seam',
          disabled: true,
        },
        {
          label: 'Metal - Other Than Standing Seam',
          disabled: true,
        },
        {
          label: 'Rolled Roofing',
          disabled: true,
        },
        {
          label: 'Rubber',
          disabled: true,
        },
        {
          label: 'Slate',
          disabled: true,
        },
        {
          label: 'Tar & Gravel',
          disabled: true,
        },
        {
          label: 'Tar Shingle',
          disabled: true,
        },
        {
          label: 'Tiles - Barrel',
          disabled: true,
        },
        {
          label: 'Tiles - Concrete',
          disabled: true,
        },
        {
          label: 'Tiles - Flat',
          disabled: true,
        },
        {
          label: 'Tiles - Other',
          disabled: true,
        },
        {
          label: 'Tin',
          disabled: true,
        },
        {
          label: 'Wood Shake/Shingle',
          disabled: true,
        },
        {
          label: 'Other',
          disabled: true,
        },
      ],
    },
    {
      number: 91,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlDeductibleOWHCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlDeductibleOWHCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlDeductibleOWHCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '1%',
          disabled: false,
        },
        {
          label: '2%',
          disabled: false,
        },
        {
          label: '3%',
          disabled: false,
        },
        {
          label: '5%',
          disabled: false,
        },
      ],
    },
    {
      number: 92,
      id: 'ContentPlaceHolderBody_QuoteBody_txtSecondaryRoofReplacementYear',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtSecondaryRoofReplacementYear',
      label: 'yyyy',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 93,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlPaymentPlan',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPaymentPlan',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPaymentPlan',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '1-Pay',
          disabled: false,
        },
        {
          label: '2-Pay',
          disabled: false,
        },
        {
          label: '4-Pay',
          disabled: false,
        },
        {
          label: '2-Pay (EFT)',
          disabled: false,
        },
        {
          label: '4-Pay (EFT)',
          disabled: false,
        },
        {
          label: '10-Pay (EFT)',
          disabled: false,
        },
      ],
    },
    {
      number: 94,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlSecondaryRoofShape',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlSecondaryRoofShape',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlSecondaryRoofShape',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: true,
        },
        {
          label: 'Gable',
          disabled: true,
        },
        {
          label: 'Hip - 90%',
          disabled: true,
        },
        {
          label: 'Partial Hip - 60%+',
          disabled: true,
        },
        {
          label: 'Flat - Poured Concrete',
          disabled: true,
        },
        {
          label: 'Flat - Other',
          disabled: true,
        },
        {
          label: 'Other',
          disabled: true,
        },
      ],
    },
    {
      number: 95,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlPayorCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPayorCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPayorCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Insured',
          disabled: false,
        },
        {
          label: 'Mortgagee 1st',
          disabled: false,
        },
        {
          label: 'Mortgagee 2nd',
          disabled: false,
        },
        {
          label: 'Additional Interest 1st',
          disabled: false,
        },
        {
          label: 'Additional Interest 2nd',
          disabled: false,
        },
      ],
    },
    {
      number: 96,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlNumberOfWaterHeaters',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlNumberOfWaterHeaters',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlNumberOfWaterHeaters',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: '1',
          disabled: false,
        },
        {
          label: '2',
          disabled: false,
        },
        {
          label: '3+',
          disabled: false,
        },
      ],
    },
    {
      number: 97,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlHouseHoldSizeCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlHouseHoldSizeCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlHouseHoldSizeCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '1',
          disabled: false,
        },
        {
          label: '2',
          disabled: false,
        },
        {
          label: '3',
          disabled: false,
        },
        {
          label: '4',
          disabled: false,
        },
        {
          label: '5',
          disabled: false,
        },
        {
          label: '6',
          disabled: false,
        },
        {
          label: '7',
          disabled: false,
        },
        {
          label: '8',
          disabled: false,
        },
        {
          label: '9',
          disabled: false,
        },
        {
          label: '10+',
          disabled: false,
        },
      ],
    },
    {
      number: 98,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_txtRenovationWaterHeaterYear',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtRenovationWaterHeaterYear',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtRenovationWaterHeaterYear',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 99,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlMarried',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlMarried',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlMarried',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Single',
          disabled: false,
        },
        {
          label: 'Married',
          disabled: false,
        },
      ],
    },
    {
      number: 100,
      id: 'ContentPlaceHolderBody_QuoteBody_txtRenovationSecondWaterHeaterYear',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtRenovationSecondWaterHeaterYear',
      label: 'yyyy',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 101,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlHasAssentedtoCreditScore',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlHasAssentedtoCreditScore',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlHasAssentedtoCreditScore',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 102,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlFirstWaterHeaterLocation',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlFirstWaterHeaterLocation',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlFirstWaterHeaterLocation',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Tankless Water Heater',
          disabled: false,
        },
        {
          label: 'Garage',
          disabled: false,
        },
        {
          label: 'Attic',
          disabled: false,
        },
        {
          label: 'Outside of Dwelling',
          disabled: false,
        },
        {
          label: 'Interior - First Floor',
          disabled: false,
        },
        {
          label: 'Interior - Above First Floor',
          disabled: false,
        },
      ],
    },
    {
      number: 103,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlCreditScore',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlCreditScore',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlCreditScore',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '876+',
          disabled: false,
        },
        {
          label: '826-875',
          disabled: false,
        },
        {
          label: '801-825',
          disabled: false,
        },
        {
          label: '776-800',
          disabled: false,
        },
        {
          label: '751-775',
          disabled: false,
        },
        {
          label: '726-750',
          disabled: false,
        },
        {
          label: '701-725',
          disabled: false,
        },
        {
          label: '676-700',
          disabled: false,
        },
        {
          label: '651-675',
          disabled: false,
        },
        {
          label: '626-650',
          disabled: false,
        },
        {
          label: '601-625',
          disabled: false,
        },
        {
          label: '576-600',
          disabled: false,
        },
        {
          label: '551-575',
          disabled: false,
        },
        {
          label: '1-550',
          disabled: false,
        },
        {
          label: 'No Hit / No Score',
          disabled: false,
        },
      ],
    },
    {
      number: 104,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlSecondWaterHeaterLocation',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlSecondWaterHeaterLocation',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlSecondWaterHeaterLocation',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: true,
        },
        {
          label: 'Tankless Water Heater',
          disabled: true,
        },
        {
          label: 'Garage',
          disabled: true,
        },
        {
          label: 'Attic',
          disabled: true,
        },
        {
          label: 'Outside of Dwelling',
          disabled: true,
        },
        {
          label: 'Interior - First Floor',
          disabled: true,
        },
        {
          label: 'Interior - Above First Floor',
          disabled: true,
        },
      ],
    },
    {
      number: 105,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlResidenceType',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlResidenceType',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlResidenceType',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Single Family',
          disabled: false,
        },
        {
          label: 'Townhouse Unit',
          disabled: false,
        },
      ],
    },
    {
      number: 106,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlExcludeWind',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlExcludeWind',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlExcludeWind',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 107,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlOccupancyCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlOccupancyCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlOccupancyCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Owner',
          disabled: false,
        },
        {
          label: 'Tenant',
          disabled: false,
        },
      ],
    },
    {
      number: 108,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_dtConstructionDt',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$dtConstructionDt',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$dtConstructionDt',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 109,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlUsageType',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlUsageType',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlUsageType',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Primary',
          disabled: false,
        },
        {
          label: 'Secondary',
          disabled: false,
        },
        {
          label: 'Seasonal',
          disabled: false,
        },
      ],
    },
    {
      number: 110,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_dtHouseClosingDate',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$dtHouseClosingDate',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$dtHouseClosingDate',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 111,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlPropertySecurityCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPropertySecurityCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPropertySecurityCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: true,
        },
        {
          label: 'None',
          disabled: true,
        },
        {
          label: 'Option 1',
          disabled: true,
        },
        {
          label: 'Option 2',
          disabled: true,
        },
      ],
    },
    {
      number: 112,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlIsHouseJustPurchased',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsHouseJustPurchased',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsHouseJustPurchased',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 113,
      id: 'ContentPlaceHolderBody_QuoteBody_btnCreditScore',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$btnCreditScore',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$btnCreditScore',
      type: 'button',
      visible: true,
      options: [],
    },
    {
      number: 114,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlIsBuiltByContractor',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsBuiltByContractor',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsBuiltByContractor',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 115,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_txtRenovRoofYear',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtRenovRoofYear',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtRenovRoofYear',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 116,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAffinityCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAffinityCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAffinityCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: 'Active Duty Military, National/Coast Guard, Reserves',
          disabled: false,
        },
        {
          label: 'Disabled American Veteran',
          disabled: false,
        },
        {
          label: 'Fallen Heroes Surviving Spouse',
          disabled: false,
        },
        {
          label: 'Louisiana Licensed Educator',
          disabled: false,
        },
        {
          label: 'Louisiana Fire Fighter',
          disabled: false,
        },
        {
          label: 'Louisiana or Federal Law Enforcement',
          disabled: false,
        },
        {
          label: 'Louisiana Licensed Paramedic/EMT',
          disabled: false,
        },
        {
          label: 'Louisiana Licensed Nurse',
          disabled: false,
        },
        {
          label: 'Louisiana Licensed Physician, Dentist, Surgeon',
          disabled: false,
        },
        {
          label: 'Louisiana Licensed Therapist',
          disabled: false,
        },
        {
          label: 'Louisiana Licensed Insurance Agent or Employee',
          disabled: false,
        },
      ],
    },
    {
      number: 117,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlOpeningProtectedCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlOpeningProtectedCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlOpeningProtectedCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: 'Level 1 - All openings protected',
          disabled: false,
        },
        {
          label: 'Level 2 - Only windows protected',
          disabled: false,
        },
      ],
    },
    {
      number: 118,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlIsBookTransfer',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsBookTransfer',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsBookTransfer',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 119,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlGatedCommunity',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlGatedCommunity',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlGatedCommunity',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 120,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlBurglarAlarmCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlBurglarAlarmCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlBurglarAlarmCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: 'Level 1 - Deadbolts',
          disabled: false,
        },
        {
          label: 'Level 2 - Local Alarm',
          disabled: false,
        },
        {
          label: 'Level 3 - Central Reporting System',
          disabled: false,
        },
        {
          label: 'Level 4 - Smart Home Security System',
          disabled: false,
        },
      ],
    },
    {
      number: 121,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyWoodBurningStove',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyWoodBurningStove',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyWoodBurningStove',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 122,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyFloodPolicy',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyFloodPolicy',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyFloodPolicy',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 123,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlWindResistantBuildingCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlWindResistantBuildingCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlWindResistantBuildingCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: 'IBHS Gold',
          disabled: false,
        },
        {
          label: 'IBHS Silver',
          disabled: false,
        },
        {
          label: 'IBHS Fortified Roof',
          disabled: false,
        },
        {
          label: '2006 LSUCC Compliant',
          disabled: false,
        },
        {
          label: '2023 LSUCC Compliant',
          disabled: false,
        },
      ],
    },
    {
      number: 124,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlIsCompanionPolicy',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsCompanionPolicy',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsCompanionPolicy',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 125,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_dtIBHSCertificateExpirationDate',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$dtIBHSCertificateExpirationDate',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$dtIBHSCertificateExpirationDate',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 126,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyCompanionAuto',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyCompanionAuto',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyCompanionAuto',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 127,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlFireAlarmCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlFireAlarmCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlFireAlarmCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: 'Level 1 - Smoke Detectors',
          disabled: false,
        },
        {
          label: 'Level 2 - Central Reporting Fire Alarm',
          disabled: false,
        },
        {
          label: 'Level 3 - Smart Home Prevention System',
          disabled: false,
        },
        {
          label: 'Level 4 - Automatic Sprinkler System',
          disabled: false,
        },
      ],
    },
    {
      number: 128,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlIsElectronicPolicy',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsElectronicPolicy',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsElectronicPolicy',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 129,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlPropertyConditionSurcharge',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPropertyConditionSurcharge',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPropertyConditionSurcharge',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 130,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlImpactResistantRoofCoveringCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlImpactResistantRoofCoveringCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlImpactResistantRoofCoveringCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: 'Class 1',
          disabled: false,
        },
        {
          label: 'Class 2',
          disabled: false,
        },
        {
          label: 'Class 3',
          disabled: false,
        },
        {
          label: 'Class 4',
          disabled: false,
        },
      ],
    },
    {
      number: 131,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlRoofDeckAttachment',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlRoofDeckAttachment',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlRoofDeckAttachment',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '6d nails at 12"/6"',
          disabled: false,
        },
        {
          label: '8d nails at 12"/6"',
          disabled: false,
        },
        {
          label: '8d nails at 6"/6"',
          disabled: false,
        },
      ],
    },
    {
      number: 132,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlRoofToWallConnection',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlRoofToWallConnection',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlRoofToWallConnection',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'Hurricane Straps',
          disabled: false,
        },
        {
          label: 'Other (Clips)',
          disabled: false,
        },
      ],
    },
    {
      number: 133,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlSecondaryWaterResistance',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlSecondaryWaterResistance',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlSecondaryWaterResistance',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 134,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_PlumbingDate',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$PlumbingDate',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$PlumbingDate',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 135,
      id: 'ContentPlaceHolderBody_QuoteBody_IsPlumbingCompletelyReplaced',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$IsPlumbingCompletelyReplaced',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$IsPlumbingCompletelyReplaced',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: true,
        },
        {
          label: 'Yes',
          disabled: true,
        },
      ],
    },
    {
      number: 136,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_HeatingDate',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$HeatingDate',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$HeatingDate',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 137,
      id: 'ContentPlaceHolderBody_QuoteBody_IsHeatingCompletellyReplaced',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$IsHeatingCompletellyReplaced',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$IsHeatingCompletellyReplaced',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: true,
        },
        {
          label: 'Yes',
          disabled: true,
        },
      ],
    },
    {
      number: 138,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_WiringDate',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$WiringDate',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$WiringDate',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 139,
      id: 'ContentPlaceHolderBody_QuoteBody_IsWiringCompletellyReplaced',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$IsWiringCompletellyReplaced',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$IsWiringCompletellyReplaced',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: true,
        },
        {
          label: 'Yes',
          disabled: true,
        },
      ],
    },
    {
      number: 140,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlPackageCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPackageCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPackageCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: 'Priority',
          disabled: false,
        },
        {
          label: 'Advanced',
          disabled: false,
        },
      ],
    },
    {
      number: 141,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlIncidentalOccupancyCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIncidentalOccupancyCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIncidentalOccupancyCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'None',
          disabled: false,
        },
        {
          label: 'Main Dwelling',
          disabled: false,
        },
        {
          label: 'Other Structures',
          disabled: false,
        },
      ],
    },
    {
      number: 142,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyPersonalPropertyReplacementCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyPersonalPropertyReplacementCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyPersonalPropertyReplacementCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 143,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyRefrigeratedCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyRefrigeratedCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyRefrigeratedCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 144,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAdditionalCvgACd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAdditionalCvgACd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAdditionalCvgACd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: '25%',
          disabled: false,
        },
      ],
    },
    {
      number: 145,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlComputerCvgCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlComputerCvgCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlComputerCvgCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: '$1,000',
          disabled: false,
        },
        {
          label: '$2,000',
          disabled: false,
        },
        {
          label: '$3,000',
          disabled: false,
        },
        {
          label: '$4,000',
          disabled: false,
        },
        {
          label: '$5,000',
          disabled: false,
        },
        {
          label: '$6,000',
          disabled: false,
        },
        {
          label: '$7,000',
          disabled: false,
        },
        {
          label: '$8,000',
          disabled: false,
        },
        {
          label: '$9,000',
          disabled: false,
        },
        {
          label: '$10,000',
          disabled: false,
        },
        {
          label: '$11,000',
          disabled: false,
        },
        {
          label: '$12,000',
          disabled: false,
        },
        {
          label: '$13,000',
          disabled: false,
        },
        {
          label: '$14,000',
          disabled: false,
        },
        {
          label: '$15,000',
          disabled: false,
        },
        {
          label: '$16,000',
          disabled: false,
        },
        {
          label: '$17,000',
          disabled: false,
        },
        {
          label: '$18,000',
          disabled: false,
        },
        {
          label: '$19,000',
          disabled: false,
        },
        {
          label: '$20,000',
          disabled: false,
        },
      ],
    },
    {
      number: 146,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyBreakdownCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyBreakdownCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyBreakdownCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 147,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnySpecialPersonalPropertyCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnySpecialPersonalPropertyCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnySpecialPersonalPropertyCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 148,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyIdentityFraudCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyIdentityFraudCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyIdentityFraudCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 149,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlServiceLineCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlServiceLineCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlServiceLineCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 150,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyWaterCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyWaterCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyWaterCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 151,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlWaterBackupCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlWaterBackupCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlWaterBackupCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: '$5,000',
          disabled: false,
        },
        {
          label: '$10,000',
          disabled: false,
        },
        {
          label: '$15,000',
          disabled: false,
        },
        {
          label: '$20,000',
          disabled: false,
        },
        {
          label: '$25,000',
          disabled: false,
        },
      ],
    },
    {
      number: 152,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyACVRoofLossesCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyACVRoofLossesCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyACVRoofLossesCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 153,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyEnhancedRoofReplacementCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyEnhancedRoofReplacementCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyEnhancedRoofReplacementCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: true,
        },
        {
          label: 'Yes',
          disabled: true,
        },
      ],
    },
    {
      number: 154,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_txtFirearmsCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtFirearmsCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtFirearmsCvg',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 155,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlBusinessPropertyLimitCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlBusinessPropertyLimitCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlBusinessPropertyLimitCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: '$2,500',
          disabled: false,
        },
        {
          label: '$5,000',
          disabled: false,
        },
        {
          label: '$7,500',
          disabled: false,
        },
        {
          label: '$10,000',
          disabled: false,
        },
      ],
    },
    {
      number: 156,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_txtJewelryCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtJewelryCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtJewelryCvg',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 157,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlIncreasedCvgC',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIncreasedCvgC',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIncreasedCvgC',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: '$1,000',
          disabled: false,
        },
        {
          label: '$2,000',
          disabled: false,
        },
        {
          label: '$3,000',
          disabled: false,
        },
        {
          label: '$4,000',
          disabled: false,
        },
        {
          label: '$5,000',
          disabled: false,
        },
        {
          label: '$6,000',
          disabled: false,
        },
        {
          label: '$7,000',
          disabled: false,
        },
        {
          label: '$8,000',
          disabled: false,
        },
        {
          label: '$9,000',
          disabled: false,
        },
        {
          label: '$10,000',
          disabled: false,
        },
        {
          label: '$11,000',
          disabled: false,
        },
        {
          label: '$12,000',
          disabled: false,
        },
        {
          label: '$13,000',
          disabled: false,
        },
        {
          label: '$14,000',
          disabled: false,
        },
        {
          label: '$15,000',
          disabled: false,
        },
        {
          label: '$16,000',
          disabled: false,
        },
        {
          label: '$17,000',
          disabled: false,
        },
        {
          label: '$18,000',
          disabled: false,
        },
        {
          label: '$19,000',
          disabled: false,
        },
        {
          label: '$20,000',
          disabled: false,
        },
      ],
    },
    {
      number: 158,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_txtSilverGoldPewterwareCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtSilverGoldPewterwareCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtSilverGoldPewterwareCvg',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 159,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyLockReplacementCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyLockReplacementCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyLockReplacementCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 160,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlLossAssessmentCvgCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlLossAssessmentCvgCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlLossAssessmentCvgCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: '1,000',
          disabled: false,
        },
        {
          label: '5,000',
          disabled: false,
        },
        {
          label: '10,000',
          disabled: false,
        },
      ],
    },
    {
      number: 161,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyNonStructuralHailLossCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyNonStructuralHailLossCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyNonStructuralHailLossCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 162,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnimalLiabilityCvgCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnimalLiabilityCvgCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnimalLiabilityCvgCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: '$25,000',
          disabled: false,
        },
        {
          label: '$50,000',
          disabled: false,
        },
      ],
    },
    {
      number: 163,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlLawCvgCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlLawCvgCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlLawCvgCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: '10% of A',
          disabled: false,
        },
        {
          label: '25% of A',
          disabled: false,
        },
        {
          label: '50% of A',
          disabled: false,
        },
      ],
    },
    {
      number: 164,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlOtherHouseholdMembersCvgCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlOtherHouseholdMembersCvgCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlOtherHouseholdMembersCvgCd',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'None',
          disabled: false,
        },
        {
          label: 'One',
          disabled: false,
        },
        {
          label: 'Two',
          disabled: false,
        },
        {
          label: 'Three',
          disabled: false,
        },
        {
          label: 'Four',
          disabled: false,
        },
      ],
    },
    {
      number: 165,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_txtOtherStructureRentedCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtOtherStructureRentedCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtOtherStructureRentedCvg',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 166,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlAnyPersonalInjuryCvg',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyPersonalInjuryCvg',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlAnyPersonalInjuryCvg',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 167,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlIsOwnedByTrust',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsOwnedByTrust',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlIsOwnedByTrust',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 168,
      id: 'ContentPlaceHolderBody_QuoteBody_txtCoastDistanceCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtCoastDistanceCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtCoastDistanceCd',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 169,
      id: 'ContentPlaceHolderBody_QuoteBody_txtFireStationName',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtFireStationName',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtFireStationName',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 170,
      id: 'ContentPlaceHolderBody_QuoteBody_txtHailLocationScoreCd',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtHailLocationScoreCd',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtHailLocationScoreCd',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 171,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlFireHydrantWithin1000Feet',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlFireHydrantWithin1000Feet',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlFireHydrantWithin1000Feet',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 172,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlWindPoolEligible',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlWindPoolEligible',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlWindPoolEligible',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 173,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlFireStationWithin5Miles',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlFireStationWithin5Miles',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlFireStationWithin5Miles',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: 'No',
          disabled: false,
        },
        {
          label: 'Yes',
          disabled: false,
        },
      ],
    },
    {
      number: 174,
      id: 'ContentPlaceHolderBody_QuoteBody_txtLatitude',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtLatitude',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtLatitude',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 175,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlPPC',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPPC',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPPC',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '1',
          disabled: false,
        },
        {
          label: '2',
          disabled: false,
        },
        {
          label: '3',
          disabled: false,
        },
        {
          label: '4',
          disabled: false,
        },
        {
          label: '5',
          disabled: false,
        },
        {
          label: '6',
          disabled: false,
        },
        {
          label: '7',
          disabled: false,
        },
        {
          label: '8',
          disabled: false,
        },
        {
          label: '9',
          disabled: false,
        },
        {
          label: '10',
          disabled: false,
        },
        {
          label: '10C',
          disabled: false,
        },
        {
          label: '10W',
          disabled: false,
        },
        {
          label: '1X',
          disabled: false,
        },
        {
          label: '1Y',
          disabled: false,
        },
        {
          label: '2X',
          disabled: false,
        },
        {
          label: '2Y',
          disabled: false,
        },
        {
          label: '3X',
          disabled: false,
        },
        {
          label: '3Y',
          disabled: false,
        },
        {
          label: '4X',
          disabled: false,
        },
        {
          label: '4Y',
          disabled: false,
        },
        {
          label: '5X',
          disabled: false,
        },
        {
          label: '5Y',
          disabled: false,
        },
        {
          label: '6X',
          disabled: false,
        },
        {
          label: '6Y',
          disabled: false,
        },
        {
          label: '7X',
          disabled: false,
        },
        {
          label: '7Y',
          disabled: false,
        },
        {
          label: '8A',
          disabled: false,
        },
        {
          label: '8B',
          disabled: false,
        },
        {
          label: '8X',
          disabled: false,
        },
        {
          label: '8Y',
          disabled: false,
        },
        {
          label: '9A',
          disabled: false,
        },
      ],
    },
    {
      number: 176,
      id: 'ContentPlaceHolderBody_QuoteBody_txtLongitude',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtLongitude',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtLongitude',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 177,
      id: 'ContentPlaceHolderBody_QuoteBody_SubscriptionDistrict',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$SubscriptionDistrict',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$SubscriptionDistrict',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'S',
          disabled: false,
        },
        {
          label: 'T',
          disabled: false,
        },
      ],
    },
    {
      number: 178,
      id: 'ContentPlaceHolderBody_QuoteBody_FireCommunityDistrict',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$FireCommunityDistrict',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$FireCommunityDistrict',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 179,
      id: 'btnOrderFireDepartment',
      name: '(none)',
      label: 'Get Fire Department',
      type: 'button',
      visible: true,
      options: [],
    },
    {
      number: 180,
      id: 'ContentPlaceHolderBody_QuoteBody_txtPreviousPropertyAddress1',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtPreviousPropertyAddress1',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtPreviousPropertyAddress1',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 181,
      id: 'ContentPlaceHolderBody_QuoteBody_txtPreviousPropertyAddress2',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtPreviousPropertyAddress2',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtPreviousPropertyAddress2',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 182,
      id: 'ContentPlaceHolderBody_QuoteBody_txtPreviousPropertyCity',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtPreviousPropertyCity',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtPreviousPropertyCity',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 183,
      id: 'ContentPlaceHolderBody_QuoteBody_ddlPreviousPropertyState',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPreviousPropertyState',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$ddlPreviousPropertyState',
      type: 'dropdown',
      visible: true,
      options: [
        {
          label: 'Option 1',
          disabled: false,
        },
        {
          label: '99',
          disabled: false,
        },
        {
          label: 'AA',
          disabled: false,
        },
        {
          label: 'AE',
          disabled: false,
        },
        {
          label: 'AK',
          disabled: false,
        },
        {
          label: 'AL',
          disabled: false,
        },
        {
          label: 'AP',
          disabled: false,
        },
        {
          label: 'AR',
          disabled: false,
        },
        {
          label: 'AS',
          disabled: false,
        },
        {
          label: 'AZ',
          disabled: false,
        },
        {
          label: 'CA',
          disabled: false,
        },
        {
          label: 'CO',
          disabled: false,
        },
        {
          label: 'CT',
          disabled: false,
        },
        {
          label: 'DC',
          disabled: false,
        },
        {
          label: 'DE',
          disabled: false,
        },
        {
          label: 'FL',
          disabled: false,
        },
        {
          label: 'FM',
          disabled: false,
        },
        {
          label: 'GA',
          disabled: false,
        },
        {
          label: 'GU',
          disabled: false,
        },
        {
          label: 'HI',
          disabled: false,
        },
        {
          label: 'IA',
          disabled: false,
        },
        {
          label: 'ID',
          disabled: false,
        },
        {
          label: 'IL',
          disabled: false,
        },
        {
          label: 'IN',
          disabled: false,
        },
        {
          label: 'KS',
          disabled: false,
        },
        {
          label: 'KY',
          disabled: false,
        },
        {
          label: 'LA',
          disabled: false,
        },
        {
          label: 'MA',
          disabled: false,
        },
        {
          label: 'MD',
          disabled: false,
        },
        {
          label: 'ME',
          disabled: false,
        },
        {
          label: 'MH',
          disabled: false,
        },
        {
          label: 'MI',
          disabled: false,
        },
        {
          label: 'MN',
          disabled: false,
        },
        {
          label: 'MO',
          disabled: false,
        },
        {
          label: 'MP',
          disabled: false,
        },
        {
          label: 'MS',
          disabled: false,
        },
        {
          label: 'MT',
          disabled: false,
        },
        {
          label: 'NC',
          disabled: false,
        },
        {
          label: 'ND',
          disabled: false,
        },
        {
          label: 'NE',
          disabled: false,
        },
        {
          label: 'NH',
          disabled: false,
        },
        {
          label: 'NJ',
          disabled: false,
        },
        {
          label: 'NM',
          disabled: false,
        },
        {
          label: 'NV',
          disabled: false,
        },
        {
          label: 'NY',
          disabled: false,
        },
        {
          label: 'OH',
          disabled: false,
        },
        {
          label: 'OK',
          disabled: false,
        },
        {
          label: 'OR',
          disabled: false,
        },
        {
          label: 'PA',
          disabled: false,
        },
        {
          label: 'PR',
          disabled: false,
        },
        {
          label: 'PW',
          disabled: false,
        },
        {
          label: 'RI',
          disabled: false,
        },
        {
          label: 'SC',
          disabled: false,
        },
        {
          label: 'SD',
          disabled: false,
        },
        {
          label: 'TN',
          disabled: false,
        },
        {
          label: 'TX',
          disabled: false,
        },
        {
          label: 'UM',
          disabled: false,
        },
        {
          label: 'UT',
          disabled: false,
        },
        {
          label: 'VA',
          disabled: false,
        },
        {
          label: 'VI',
          disabled: false,
        },
        {
          label: 'VT',
          disabled: false,
        },
        {
          label: 'WA',
          disabled: false,
        },
        {
          label: 'WI',
          disabled: false,
        },
        {
          label: 'WV',
          disabled: false,
        },
        {
          label: 'WY',
          disabled: false,
        },
      ],
    },
    {
      number: 184,
      id: 'ContentPlaceHolderBody_QuoteBody_txtPreviousPropertyZip',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtPreviousPropertyZip',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtPreviousPropertyZip',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 185,
      id: 'ContentPlaceHolderBody_QuoteBody_txtPreviousPropertyZipPlus4',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtPreviousPropertyZipPlus4',
      label: 'ctl00$ContentPlaceHolderBody$QuoteBody$txtPreviousPropertyZipPlus4',
      type: 'text',
      visible: true,
      options: [],
    },
    {
      number: 186,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_RadGridLossHistory_ctl00_ctl02_ctl00_AddNewRecordButton',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$RadGridLossHistory$ctl00$ctl02$ctl00$AddNewRecordButton',
      label: 'Add new record',
      type: 'button',
      visible: true,
      options: [],
    },
    {
      number: 187,
      id: 'ctl00_ContentPlaceHolderBody_QuoteBody_RadGridScheduled_ctl00_ctl02_ctl00_AddNewRecordButton',
      name: 'ctl00$ContentPlaceHolderBody$QuoteBody$RadGridScheduled$ctl00$ctl02$ctl00$AddNewRecordButton',
      label: 'Add new record',
      type: 'button',
      visible: true,
      options: [],
    },
    {
      number: 188,
      id: 'ContentPlaceHolderBody_QuoteFooter1_ServerButton',
      name: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$ServerButton',
      label: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$ServerButton',
      type: 'submit',
      visible: true,
      options: [],
    },
    {
      number: 189,
      id: 'ContentPlaceHolderBody_QuoteFooter1_GoToUmbrellaQuoteButton',
      name: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$GoToUmbrellaQuoteButton',
      label: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$GoToUmbrellaQuoteButton',
      type: 'button',
      visible: true,
      options: [],
    },
    {
      number: 190,
      id: 'ContentPlaceHolderBody_QuoteFooter1_GoToAonFloodQuoteButton',
      name: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$GoToAonFloodQuoteButton',
      label: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$GoToAonFloodQuoteButton',
      type: 'button',
      visible: true,
      options: [],
    },
    {
      number: 191,
      id: 'ContentPlaceHolderBody_QuoteFooter1_GoToNfsFloodQuoteButton',
      name: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$GoToNfsFloodQuoteButton',
      label: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$GoToNfsFloodQuoteButton',
      type: 'button',
      visible: true,
      options: [],
    },
    {
      number: 192,
      id: 'ContentPlaceHolderBody_QuoteFooter1_btnNewQuote',
      name: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$btnNewQuote',
      label: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$btnNewQuote',
      type: 'submit',
      visible: true,
      options: [],
    },
    {
      number: 193,
      id: 'ContentPlaceHolderBody_QuoteFooter1_btnClone',
      name: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$btnClone',
      label: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$btnClone',
      type: 'submit',
      visible: true,
      options: [],
    },
    {
      number: 194,
      id: 'ContentPlaceHolderBody_QuoteFooter1_btnCreateApp',
      name: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$btnCreateApp',
      label: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$btnCreateApp',
      type: 'button',
      visible: false,
      options: [],
    },
    {
      number: 195,
      id: 'ContentPlaceHolderBody_QuoteFooter1_btnValidate',
      name: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$btnValidate',
      label: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$btnValidate',
      type: 'button',
      visible: true,
      options: [],
    },
    {
      number: 196,
      id: '(none)',
      name: '(none)',
      label: 'Enter Value',
      type: 'text',
      visible: false,
      options: [],
    },
    {
      number: 197,
      id: 'ctl00_ContentPlaceHolderBody_QuoteFooter1_Approval',
      name: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$Approval',
      label: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$Approval',
      type: 'textarea',
      visible: false,
      options: [],
    },
    {
      number: 198,
      id: 'ContentPlaceHolderBody_QuoteFooter1_btnApprove',
      name: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$btnApprove',
      label: 'ctl00$ContentPlaceHolderBody$QuoteFooter1$btnApprove',
      type: 'submit',
      visible: false,
      options: [],
    },
  ] satisfies HomeDemoField[],
};
