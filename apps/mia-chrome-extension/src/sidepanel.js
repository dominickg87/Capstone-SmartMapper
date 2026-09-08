const DEFAULT_BASE_URL = 'https://mia.agency';
const SMART_MAP_AUTH_STORAGE_KEY = 'miaSmartMapAuth';
const SMART_MAP_SEARCH_DEBOUNCE_MS = 250;

const personalForms = [
  { label: 'Home Quote', path: '/home' },
  { label: 'Auto Quote', path: '/auto' },
  { label: 'Life & Disability Quote', path: '/life-disability' },
  { label: 'Umbrella Quote', path: '/umbrella' },
  { label: 'Flood Quote', path: '/flood' },
  { label: 'Mobile Home Quote', path: '/mobile-home' },
  { label: 'Boat Quote', path: '/boat' },
  { label: 'Motorcycle & Toys Quote', path: '/toys' },
  { label: 'RV / Travel Trailer Quote', path: '/rv-tt' },
];

const commercialForms = [
  { label: 'General Liability Quote', path: '/commercial' },
  { label: 'Workers Compensation Quote', path: '/workers-comp' },
  { label: 'Commercial Property Quote', path: '/property' },
  { label: 'Bond Quote', path: '/bond' },
  { label: 'Commercial Auto Quote', path: '/commercial-auto' },
  { label: 'Inland Marine Quote', path: '/inland-marine' },
  { label: 'Professional Liability / E&O Quote', path: '/professional-liability' },
];

const addressDisplay = document.getElementById('addressDisplay');
const zillowButton = document.getElementById('zillowBtn');
const googleButton = document.getElementById('googleBtn');
const taxButton = document.getElementById('taxBtn');
const extensionVersion = document.getElementById('extensionVersion');
const personalSelect = document.getElementById('personalSelect');
const commercialSelect = document.getElementById('commercialSelect');
const personalTrigger = document.getElementById('personalTrigger');
const commercialTrigger = document.getElementById('commercialTrigger');
const personalMenu = document.getElementById('personalMenu');
const commercialMenu = document.getElementById('commercialMenu');
const baseUrlInput = document.getElementById('baseUrlInput');
const saveBaseUrlButton = document.getElementById('saveBaseUrl');
const settingsButton = document.getElementById('settingsBtn');
const settingsDialog = document.getElementById('settingsDialog');
const amsSubscriptionDialog = document.getElementById('amsSubscriptionDialog');
const amsSubscriptionMessage = document.getElementById('amsSubscriptionMessage');
const amsSubscriptionCloseButton = document.getElementById('amsSubscriptionCloseBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const closeSettingsBtn2 = document.getElementById('closeSettingsBtn2');
const mergePdfsButton = document.getElementById('mergePdfsBtn');
const smartMapButton = document.getElementById('smartMapBtn');
const amsSaveButton = document.getElementById('amsSaveBtn');
const homeButton = document.getElementById('homeBtn');
const smartMapScreen = document.getElementById('smartMapScreen');
const amsSaveScreen = document.getElementById('amsSaveScreen');
const quickToolsScreen = document.getElementById('quickToolsScreen');
const smartMapStatus = document.getElementById('smartMapStatus');
const smartMapConnectionStatus = document.getElementById('smartMapConnectionStatus');
const smartMapSignInButton = document.getElementById('smartMapSignInBtn');
const smartMapQuoteSearch = document.getElementById('smartMapQuoteSearch');
const smartMapQuoteResults = document.getElementById('smartMapQuoteResults');
const smartMapSelectedQuote = document.getElementById('smartMapSelectedQuote');
const smartMapMappingCard = document.getElementById('smartMapMappingCard');
const smartMapReadPageButton = document.getElementById('smartMapReadPageBtn');
const smartMapRunButton = document.getElementById('smartMapRunBtn');
const smartMapPageSummary = document.getElementById('smartMapPageSummary');
const smartMapFieldCount = document.getElementById('smartMapFieldCount');
const smartMapMappingState = document.getElementById('smartMapMappingState');
const smartMapMappingStateIcon = document.getElementById('smartMapMappingStateIcon');
const smartMapMappingStateText = document.getElementById('smartMapMappingStateText');
const smartMapFillSummary = document.getElementById('smartMapFillSummary');
const smartMapSaveTrainingButton = document.getElementById('smartMapSaveTrainingBtn');
const amsSaveConnectionStatus = document.getElementById('amsSaveConnectionStatus');
const amsSaveSignInButton = document.getElementById('amsSaveSignInBtn');
const amsClientSearchInput = document.getElementById('amsClientSearchInput');
const amsClientSearchButton = document.getElementById('amsClientSearchBtn');
const amsClientResults = document.getElementById('amsClientResults');
const amsSelectedClient = document.getElementById('amsSelectedClient');
const amsPoliciesCard = document.getElementById('amsPoliciesCard');
const amsPolicyResults = document.getElementById('amsPolicyResults');
const amsWhatCard = document.getElementById('amsWhatCard');
const amsSaveNoteCheckbox = document.getElementById('amsSaveNoteCheckbox');
const amsSaveDocumentsCheckbox = document.getElementById('amsSaveDocumentsCheckbox');
const amsNoteSection = document.getElementById('amsNoteSection');
const amsNoteTitleInput = document.getElementById('amsNoteTitleInput');
const amsNoteBodyInput = document.getElementById('amsNoteBodyInput');
const amsDocumentsSection = document.getElementById('amsDocumentsSection');
const amsUploadDropzone = document.getElementById('amsUploadDropzone');
const amsDocumentInput = document.getElementById('amsDocumentInput');
const amsDocumentList = document.getElementById('amsDocumentList');
const amsSendCard = document.getElementById('amsSendCard');
const amsSendButton = document.getElementById('amsSendBtn');
const amsSendStatus = document.getElementById('amsSendStatus');
const settingsTooltip = document.querySelector('[data-tooltip="settings"]');
const mergeTooltip = document.querySelector('[data-tooltip="merge"]');
const smartMapTooltip = document.querySelector('[data-tooltip="smartmap"]');
const smartMapSignInTooltip = document.querySelector('[data-tooltip="smartmap-login"]');
const smartMapSignInTooltipContent = smartMapSignInTooltip?.querySelector('.tooltip__content');
const amsSaveTooltip = document.querySelector('[data-tooltip="ams-save"]');
const amsSaveSignInTooltip = document.querySelector('[data-tooltip="ams-save-login"]');
const amsSaveSignInTooltipContent = amsSaveSignInTooltip?.querySelector('.tooltip__content');
const homeTooltip = document.querySelector('[data-tooltip="home"]');

let currentAddress = '';
let currentBaseUrl = DEFAULT_BASE_URL;
let smartMapConnected = false;
let smartMapAuth = null;
let selectedSmartMapQuote = null;
let lastSmartMapSnapshot = null;
let smartMapSearchTimer = null;
let smartMapSearchAbortController = null;
let smartMapSeenPageKeys = new Set();
let smartMapSeenFieldKeys = new Set();
let smartMapLatestReadState = 'idle';
let smartMapShouldReadBeforeRun = false;
let lastSmartMapMapping = null;
let lastSmartMapFillSummary = null;
let selectedAmsClient = null;
let amsPolicies = [];
let amsUploadedFiles = [];
let amsClientSearchTimer = null;
let amsCanUseIntegrations = true;
let amsStatusCheckInFlight = false;

const countyCache = new Map();
const AMS_INTEGRATIONS_UNAVAILABLE_MESSAGE =
  'Integrations are not available in your mia subscription. Please contact your administrator or log into your billing portal to upgrade your subscription.';
const AMS_DEFAULT_NOTE_TITLE = 'AMS Note.txt';

function normalizeBaseUrl(value) {
  let url = value.trim();
  if (!url) {
    return '';
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch (error) {
    console.error('MIA extension: invalid base URL provided', error);
    return '';
  }
}

function updateQuickActionState(disabled) {
  [zillowButton, googleButton, taxButton].forEach((button) => {
    button.disabled = disabled;
  });
}

function setAddressDisplay(address) {
  currentAddress = address ?? '';

  if (currentAddress) {
    addressDisplay.textContent = currentAddress;
    updateQuickActionState(false);
  } else {
    addressDisplay.textContent = 'Click the MIA icon in AMS360 or NowCerts to load the address.';
    updateQuickActionState(true);
  }
}

function buildAbsoluteUrl(path) {
  const base = currentBaseUrl || DEFAULT_BASE_URL;
  const trimmedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
}

function buildSmartMapHostPermissionPattern(url) {
  const parsed = new URL(url);

  if (parsed.protocol !== 'https:') {
    throw new Error('SmartMap can only read secure HTTPS carrier pages.');
  }

  return `${parsed.protocol}//${parsed.hostname}/*`;
}

async function ensureSmartMapPageAccess() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) {
    throw new Error('No active carrier page found.');
  }

  const permissionPattern = buildSmartMapHostPermissionPattern(tab.url);
  const hasPermission = await chrome.permissions.contains({
    origins: [permissionPattern],
  });

  if (hasPermission) {
    return;
  }

  const granted = await chrome.permissions.request({
    origins: [permissionPattern],
  });

  if (!granted) {
    const host = new URL(tab.url).host;
    throw new Error(`SmartMap needs permission to read ${host}.`);
  }
}

function normalizeSmartMapAuthPayload(payload) {
  const accessToken = payload?.accessToken || payload?.access_token;

  if (!accessToken) {
    return null;
  }

  const baseUrl =
    normalizeBaseUrl(payload?.baseUrl || payload?.base_url || currentBaseUrl) ||
    currentBaseUrl ||
    DEFAULT_BASE_URL;

  return {
    accessToken,
    tokenType: payload?.tokenType || payload?.token_type || 'Bearer',
    expiresAt: payload?.expiresAt || payload?.expires_at || null,
    user: payload?.user || null,
    tenant: payload?.tenant || null,
    baseUrl,
    connectedAt: payload?.connectedAt || new Date().toISOString(),
  };
}

function isSmartMapAuthExpired(auth) {
  if (!auth?.expiresAt) {
    return false;
  }

  const expiresAt = new Date(auth.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function clearSmartMapAuth() {
  smartMapAuth = null;
  smartMapConnected = false;
  amsCanUseIntegrations = true;
  selectedSmartMapQuote = null;
  await chrome.storage.local.remove(SMART_MAP_AUTH_STORAGE_KEY);
  resetSmartMapReadMemory();
  resetAmsSaveState();
  renderSmartMapSelectedQuote();
  updateSmartMapConnectionState();
  updateAmsConnectionState();
}

function buildSmartMapApiUrl(path) {
  const base = (smartMapAuth?.baseUrl || currentBaseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function smartMapApiFetch(path, options = {}) {
  if (!smartMapAuth?.accessToken) {
    throw new Error('Sign into MIA before using MIA-connected tools.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `${smartMapAuth.tokenType || 'Bearer'} ${smartMapAuth.accessToken}`);

  const response = await fetch(buildSmartMapApiUrl(path), {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    await clearSmartMapAuth();
    throw new Error('MIA sign-in expired. Sign into MIA again.');
  }

  if (!response.ok || data?.success === false) {
    const error = new Error(data?.message || `MIA request failed with status ${response.status}.`);
    error.status = response.status;
    error.code = data?.code || null;
    error.payload = data;
    throw error;
  }

  return data;
}

function populateSelect(selectElement, options) {
  while (selectElement.options.length > 1) {
    selectElement.remove(1);
  }

  options.forEach(({ label, path }) => {
    const option = document.createElement('option');
    option.value = path;
    option.textContent = label;
    selectElement.append(option);
  });
}

function renderExtensionVersion() {
  if (!extensionVersion) {
    return;
  }

  const version = chrome.runtime.getManifest?.().version || '';
  extensionVersion.textContent = version ? `Version ${version}` : '';
}

function iconSVGFor(path) {
  // Exact Lucide icon nodes (from lucide-react v0.475.0)
  const common = 'class="icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden';
  switch (path) {
    // Personal
    case '/home': // House
      return `<svg ${common}><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
    case '/auto': // Car
      return `<svg ${common}><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`;
    case '/life-disability': // HandHeart
      return `<svg ${common}><path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16"/><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 15 6 6"/><path d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z"/></svg>`;
    case '/umbrella': // Umbrella
      return `<svg ${common}><path d="M22 12a10.06 10.06 1 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0"/><path d="M12 2v1"/></svg>`;
    case '/flood': // Waves
      return `<svg ${common}><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`;
    case '/mobile-home': // Warehouse
      return `<svg ${common}><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/></svg>`;
    case '/boat': // Ship
      return `<svg ${common}><path d="M12 10.189V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`;
    case '/toys': // Bike
      return `<svg ${common}><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;
    case '/rv-tt': // Caravan
      return `<svg ${common}><path d="M18 19V9a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2h2"/><path d="M2 9h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2"/><path d="M22 17v1a1 1 0 0 1-1 1H10v-9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9"/><circle cx="8" cy="19" r="2"/></svg>`;

    // Commercial
    case '/commercial': // Hammer (GL)
      return `<svg ${common}><path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/></svg>`;
    case '/workers-comp': // HardHat
      return `<svg ${common}><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>`;
    case '/property': // Store
      return `<svg ${common}><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>`;
    case '/bond': // ScrollText
      return `<svg ${common}><path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/></svg>`;
    case '/commercial-auto': // Truck
      return `<svg ${common}><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;
    case '/inland-marine': // Caravan
      return `<svg ${common}><path d="M18 19V9a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2h2"/><path d="M2 9h3a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2"/><path d="M22 17v1a1 1 0 0 1-1 1H10v-9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9"/><circle cx="8" cy="19" r="2"/></svg>`;
    case '/professional-liability': // BriefcaseBusiness
      return `<svg ${common}><path d="M12 12h.01"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M22 13a18.15 18.15 0 0 1-20 0"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>`;

    default:
      return `<svg ${common}><circle cx="12" cy="12" r="2"/></svg>`;
  }
}

function populateMenu(menuElement, options) {
  if (!menuElement) return;
  menuElement.innerHTML = '';
  options.forEach(({ label, path }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dropdown__item';
    btn.setAttribute('role', 'menuitem');
    btn.dataset.path = path;
    btn.innerHTML = `${iconSVGFor(path)}<span>${label}</span>`;
    btn.addEventListener('click', () => {
      const url = buildAbsoluteUrl(path);
      openNewTab(url);
      closeMenus();
    });
    menuElement.appendChild(btn);
  });
}

function toggleMenu(trigger, menu) {
  if (!trigger || !menu) return;
  const isOpen = !menu.hasAttribute('hidden');
  closeMenus();
  if (!isOpen) {
    menu.removeAttribute('hidden');
    trigger.setAttribute('aria-expanded', 'true');
  }
}

function closeMenus() {
  [
    [personalTrigger, personalMenu],
    [commercialTrigger, commercialMenu],
  ].forEach(([trigger, menu]) => {
    if (menu && !menu.hasAttribute('hidden')) {
      menu.setAttribute('hidden', '');
    }
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

function openNewTab(url) {
  chrome.tabs.create({ url }).catch((error) => {
    console.error('MIA extension: failed to open tab', error);
  });
}

function smartMapStatusIconSvg(state) {
  const common =
    'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  if (state === 'yellow') {
    return `<svg ${common}><path d="M3 12a9 9 0 0 1 15.74-6.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-15.74 6.74L3 16"></path><path d="M3 21v-5h5"></path></svg>`;
  }

  if (state === 'red') {
    return `<svg ${common}><path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z"></path><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"></path><path d="m15 11-6 6"></path><path d="m9 11 6 6"></path></svg>`;
  }

  return `<svg ${common}><path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z"></path><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2M11 14h10"></path><path d="m17 10 4 4-4 4"></path></svg>`;
}

function setSmartMapIndicator(state, message) {
  smartMapLatestReadState = state;

  if (smartMapMappingState) {
    smartMapMappingState.classList.remove(
      'smartmap-map-state--green',
      'smartmap-map-state--yellow',
      'smartmap-map-state--red',
    );

    if (['green', 'yellow', 'red'].includes(state)) {
      smartMapMappingState.classList.add(`smartmap-map-state--${state}`);
    }
  }

  if (smartMapMappingStateIcon) {
    smartMapMappingStateIcon.innerHTML = ['green', 'yellow', 'red'].includes(state)
      ? smartMapStatusIconSvg(state)
      : '';
  }

  if (smartMapMappingStateText) {
    smartMapMappingStateText.textContent = message || 'Waiting for page read.';
  }
}

function renderSmartMapFillSummary(summary) {
  if (!smartMapFillSummary) {
    return;
  }

  if (!summary) {
    smartMapFillSummary.setAttribute('hidden', '');
    smartMapFillSummary.textContent = '';
    return;
  }

  const filled = Array.isArray(summary.filled) ? summary.filled.length : 0;
  const skipped = Array.isArray(summary.skipped) ? summary.skipped.length : 0;
  const lowConfidence = Array.isArray(summary.lowConfidence) ? summary.lowConfidence.length : 0;
  const sourceText =
    summary.source === 'template'
      ? ' Template match used.'
      : summary.source === 'ai'
        ? ' AI mapping used.'
        : '';
  const stagedText = summary.staged ? ' Staged fill used.' : '';
  const pausedText = summary.paused
    ? ` Paused${summary.remaining ? ` with ${summary.remaining} remaining` : ''}.`
    : '';
  const quietText = summary.changeEventsSuppressed ? ' Quiet fill mode used.' : '';
  const messageText = summary.message ? ` ${summary.message}` : '';

  smartMapFillSummary.removeAttribute('hidden');
  smartMapFillSummary.textContent = `Filled ${filled} field${filled === 1 ? '' : 's'}. Skipped ${skipped}. Low confidence ${lowConfidence}.${sourceText}${stagedText}${quietText}${pausedText}${messageText}`;
}

function setSmartMapTrainingActionVisible(isVisible) {
  if (!smartMapSaveTrainingButton) {
    return;
  }

  if (!isVisible) {
    smartMapSaveTrainingButton.setAttribute('hidden', '');
    smartMapSaveTrainingButton.disabled = true;
    return;
  }

  smartMapSaveTrainingButton.removeAttribute('hidden');
  smartMapSaveTrainingButton.disabled = false;
  const label = smartMapSaveTrainingButton.querySelector('span');
  if (label) {
    label.textContent = 'Save Training';
  }
}

function resetSmartMapTrainingState() {
  lastSmartMapMapping = null;
  lastSmartMapFillSummary = null;
  setSmartMapTrainingActionVisible(false);
}

function resetSmartMapReadMemory() {
  smartMapSeenPageKeys = new Set();
  smartMapSeenFieldKeys = new Set();
  lastSmartMapSnapshot = null;
  smartMapLatestReadState = 'idle';
  smartMapShouldReadBeforeRun = false;
  resetSmartMapTrainingState();
  setSmartMapRunButtonMode('smartmap');
  setSmartMapIndicator('idle', 'Waiting for page read.');
  smartMapPageSummary.innerHTML = '<strong>Current page:</strong> waiting to read carrier fields.';
  smartMapFieldCount.textContent = '0 fields detected';
  renderSmartMapFillSummary(null);
}

function normalizeSmartMapKeyPart(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function smartMapPageKey(snapshot) {
  let urlKey = snapshot?.href || snapshot?.host || '';

  try {
    const parsed = new URL(urlKey);
    urlKey = `${parsed.host}${parsed.pathname}`;
  } catch {
    urlKey = snapshot?.host || urlKey;
  }

  const headings = Array.isArray(snapshot?.headings) ? snapshot.headings.slice(0, 3).join('|') : '';

  return [urlKey, snapshot?.pageTitle, headings]
    .map(normalizeSmartMapKeyPart)
    .filter(Boolean)
    .join('|');
}

function smartMapFieldKey(pageKey, field) {
  return [
    pageKey,
    field?.htmlId,
    field?.name,
    field?.label,
    field?.section,
    field?.type,
    Array.isArray(field?.options)
      ? field.options
          .map((option) =>
            typeof option === 'string' ? option : `${option?.text || ''}:${option?.value || ''}`,
          )
          .join('|')
      : '',
  ]
    .map(normalizeSmartMapKeyPart)
    .filter(Boolean)
    .join('|');
}

function classifySmartMapSnapshot(snapshot) {
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : [];

  if (fields.length === 0) {
    return {
      state: 'red',
      message: 'No Fields Detected / Error',
    };
  }

  const pageKey = smartMapPageKey(snapshot);
  const isNewPage = pageKey !== '' && !smartMapSeenPageKeys.has(pageKey);
  const fieldKeys = fields.map((field) => smartMapFieldKey(pageKey, field)).filter(Boolean);
  const hasNewFields = fieldKeys.some((fieldKey) => !smartMapSeenFieldKeys.has(fieldKey));

  if (pageKey) {
    smartMapSeenPageKeys.add(pageKey);
  }

  fieldKeys.forEach((fieldKey) => smartMapSeenFieldKeys.add(fieldKey));

  return {
    state: isNewPage || hasNewFields ? 'yellow' : 'green',
    message: isNewPage || hasNewFields ? 'New Fields Available for Map' : 'No New Fields Detected',
  };
}

function showSmartMapScreen() {
  quickToolsScreen?.setAttribute('hidden', '');
  amsSaveScreen?.setAttribute('hidden', '');
  smartMapScreen?.removeAttribute('hidden');
  smartMapStatus.textContent = selectedSmartMapQuote ? 'Ready to map' : 'Select a quote';
  smartMapButton?.blur();
  updateSmartMapConnectionState();
  renderSmartMapSelectedQuote();
  updateSmartMapActionState();
}

function showQuickToolsScreen() {
  smartMapScreen?.setAttribute('hidden', '');
  amsSaveScreen?.setAttribute('hidden', '');
  quickToolsScreen?.removeAttribute('hidden');
  homeButton?.blur();
}

function quoteDisplayName(quote) {
  return (
    quote?.client_name ||
    quote?.named_insured ||
    quote?.dba ||
    [quote?.first_name, quote?.last_name].filter(Boolean).join(' ') ||
    'Unknown Client'
  );
}

function quoteMeta(quote) {
  return (
    [quote?.quote_number, quote?.form_type, quote?.status].filter(Boolean).join(' - ') || 'Quote'
  );
}

function setSmartMapResultsMessage(message) {
  smartMapQuoteResults.classList.add('is-message');
  smartMapQuoteResults.textContent = message;
}

function setAmsResultsMessage(message) {
  amsClientResults.classList.add('is-message');
  amsClientResults.textContent = message;
}

function setAmsPolicyMessage(message) {
  amsPolicyResults.classList.add('is-message');
  amsPolicyResults.textContent = message;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function isAmsIntegrationsUnavailableError(error) {
  return (
    error?.code === 'integrations_unavailable' ||
    error?.payload?.code === 'integrations_unavailable' ||
    error?.message === AMS_INTEGRATIONS_UNAVAILABLE_MESSAGE
  );
}

function showAmsSubscriptionPopup(message = AMS_INTEGRATIONS_UNAVAILABLE_MESSAGE) {
  if (amsSubscriptionMessage) {
    amsSubscriptionMessage.textContent = message || AMS_INTEGRATIONS_UNAVAILABLE_MESSAGE;
  }

  if (amsSubscriptionDialog?.showModal && !amsSubscriptionDialog.open) {
    amsSubscriptionDialog.showModal();
    return;
  }

  setAmsResultsMessage(message || AMS_INTEGRATIONS_UNAVAILABLE_MESSAGE);
}

function handleAmsIntegrationsUnavailable(message = AMS_INTEGRATIONS_UNAVAILABLE_MESSAGE) {
  amsCanUseIntegrations = false;
  setAmsResultsMessage(message || AMS_INTEGRATIONS_UNAVAILABLE_MESSAGE);
  updateAmsConnectionState();
  updateAmsSendState();
  showAmsSubscriptionPopup(message);
}

async function refreshAmsIntegrationStatus() {
  if (!smartMapConnected || amsStatusCheckInFlight) {
    return;
  }

  amsStatusCheckInFlight = true;
  setAmsResultsMessage('Checking MIA integrations access...');
  updateAmsConnectionState();

  try {
    const data = await smartMapApiFetch('/api/extension/ams/status');
    amsCanUseIntegrations = data?.can_use_integrations !== false;

    if (!amsCanUseIntegrations) {
      handleAmsIntegrationsUnavailable(data?.message || AMS_INTEGRATIONS_UNAVAILABLE_MESSAGE);
      return;
    }

    if (!selectedAmsClient && !amsClientSearchInput.value.trim()) {
      setAmsResultsMessage(
        data?.integration ? 'Search AMS clients by name.' : 'No active AMS integration found.',
      );
    }
  } catch (error) {
    if (isAmsIntegrationsUnavailableError(error)) {
      handleAmsIntegrationsUnavailable(error.message);
      return;
    }

    setAmsResultsMessage(error instanceof Error ? error.message : String(error));
  } finally {
    amsStatusCheckInFlight = false;
    updateAmsConnectionState();
    updateAmsSendState();
  }
}

function resetAmsSaveFormInputs() {
  window.clearTimeout(amsClientSearchTimer);
  amsClientSearchTimer = null;

  if (amsClientSearchInput) {
    amsClientSearchInput.value = '';
  }

  if (amsClientSearchButton) {
    amsClientSearchButton.textContent = 'Search';
  }

  if (amsSaveNoteCheckbox) {
    amsSaveNoteCheckbox.checked = false;
  }

  if (amsSaveDocumentsCheckbox) {
    amsSaveDocumentsCheckbox.checked = false;
  }

  if (amsNoteTitleInput) {
    amsNoteTitleInput.value = AMS_DEFAULT_NOTE_TITLE;
  }

  if (amsNoteBodyInput) {
    amsNoteBodyInput.value = '';
  }

  if (amsDocumentInput) {
    amsDocumentInput.value = '';
  }
}

function resetAmsSaveState({ clearInputs = false, resultsMessage = '' } = {}) {
  if (clearInputs) {
    resetAmsSaveFormInputs();
  }

  selectedAmsClient = null;
  amsPolicies = [];
  amsUploadedFiles = [];
  amsSelectedClient.textContent = 'No client selected.';
  amsPoliciesCard?.setAttribute('hidden', '');
  amsWhatCard?.setAttribute('hidden', '');
  amsSendCard?.setAttribute('hidden', '');
  setAmsResultsMessage(
    resultsMessage ||
      (smartMapConnected
        ? amsCanUseIntegrations
          ? 'Search AMS clients by name.'
          : AMS_INTEGRATIONS_UNAVAILABLE_MESSAGE
        : 'Sign into MIA to search AMS clients.'),
  );
  setAmsPolicyMessage('Select a client to load policies.');
  renderAmsUploadedFiles();
  updateAmsSaveSections();
  updateAmsSendState();
  setAmsSendStatus('idle');
}

function updateAmsConnectionState() {
  if (!amsSaveConnectionStatus) {
    return;
  }

  amsClientSearchInput.disabled =
    !smartMapConnected || !amsCanUseIntegrations || amsStatusCheckInFlight;
  amsClientSearchButton.disabled =
    !smartMapConnected || !amsCanUseIntegrations || amsStatusCheckInFlight;
  amsSaveConnectionStatus.classList.remove('signin-pill--in', 'signin-pill--out');

  if (smartMapConnected) {
    amsSaveConnectionStatus.textContent = 'Signed in';
    amsSaveConnectionStatus.classList.add('signin-pill--in');
    amsSaveSignInButton?.setAttribute('aria-label', 'Reconnect to MIA');
    if (amsSaveSignInTooltipContent) {
      amsSaveSignInTooltipContent.textContent = 'Reconnect to MIA';
    }

    if (!amsCanUseIntegrations) {
      setAmsResultsMessage(AMS_INTEGRATIONS_UNAVAILABLE_MESSAGE);
      return;
    }

    if (!selectedAmsClient && !amsClientSearchInput.value.trim()) {
      setAmsResultsMessage(
        amsStatusCheckInFlight
          ? 'Checking MIA integrations access...'
          : 'Search AMS clients by name.',
      );
    }

    return;
  }

  amsSaveConnectionStatus.textContent = 'Signed out';
  amsSaveConnectionStatus.classList.add('signin-pill--out');
  amsSaveSignInButton?.setAttribute('aria-label', 'Sign into MIA');
  if (amsSaveSignInTooltipContent) {
    amsSaveSignInTooltipContent.textContent = 'Sign into MIA';
  }
  setAmsResultsMessage('Sign into MIA to search AMS clients.');
}

function showAmsSaveScreen() {
  quickToolsScreen?.setAttribute('hidden', '');
  smartMapScreen?.setAttribute('hidden', '');
  amsSaveScreen?.removeAttribute('hidden');
  amsSaveButton?.blur();
  updateAmsConnectionState();
  updateAmsSendState();
  refreshAmsIntegrationStatus();
}

function handleAmsClientSearch() {
  window.clearTimeout(amsClientSearchTimer);
  const query = amsClientSearchInput.value.trim();

  if (!smartMapConnected) {
    setAmsResultsMessage('Sign into MIA to search AMS clients.');
    return;
  }

  if (!amsCanUseIntegrations) {
    showAmsSubscriptionPopup();
    return;
  }

  if (query.length < 2) {
    setAmsResultsMessage(
      query.length === 0 ? 'Search AMS clients by name.' : 'Enter at least 2 characters.',
    );
    return;
  }

  amsClientSearchTimer = window.setTimeout(() => {
    searchAmsClients(query);
  }, SMART_MAP_SEARCH_DEBOUNCE_MS);
}

async function searchAmsClients(query) {
  if (!amsCanUseIntegrations) {
    showAmsSubscriptionPopup();
    return;
  }

  amsClientSearchButton.disabled = true;
  amsClientSearchButton.textContent = 'Searching';
  setAmsResultsMessage('Searching AMS...');

  try {
    const data = await smartMapApiFetch(
      `/api/extension/ams/clients/search?query=${encodeURIComponent(query)}`,
    );
    renderAmsClients(Array.isArray(data.clients) ? data.clients : []);
  } catch (error) {
    if (isAmsIntegrationsUnavailableError(error)) {
      handleAmsIntegrationsUnavailable(error.message);
      return;
    }

    setAmsResultsMessage(error instanceof Error ? error.message : String(error));
  } finally {
    amsClientSearchButton.disabled =
      !smartMapConnected || !amsCanUseIntegrations || amsStatusCheckInFlight;
    amsClientSearchButton.textContent = 'Search';
  }
}

function renderAmsClients(clients) {
  selectedAmsClient = null;
  amsPolicies = [];
  amsClientResults.innerHTML = '';
  amsClientResults.classList.remove('is-message');
  amsSelectedClient.textContent = 'No client selected.';
  amsPoliciesCard?.setAttribute('hidden', '');
  amsWhatCard?.setAttribute('hidden', '');
  amsSendCard?.setAttribute('hidden', '');
  updateAmsSendState();

  if (clients.length === 0) {
    setAmsResultsMessage('No clients found.');
    return;
  }

  clients.forEach((client) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quote-result';

    const title = document.createElement('strong');
    title.textContent = `${client.displayName || 'Unknown Client'}${client.customerNumber ? ` - ${client.customerNumber}` : ''}`;

    const detail = document.createElement('span');
    detail.textContent = [client.email, client.phone, client.address].filter(Boolean).join(' | ');

    const reason = document.createElement('span');
    reason.textContent = client.matchReason || '';

    button.append(title, detail, reason);
    button.addEventListener('click', () => {
      selectAmsClient(client, button);
    });
    amsClientResults.appendChild(button);
  });
}

async function selectAmsClient(client, button) {
  selectedAmsClient = client;
  amsSelectedClient.textContent = `${client.displayName || 'Unknown Client'}${client.customerNumber ? ` - ${client.customerNumber}` : ''}`;
  amsClientResults
    .querySelectorAll('.quote-result')
    .forEach((item) => item.classList.remove('selected'));
  button?.classList.add('selected');
  amsPoliciesCard?.removeAttribute('hidden');
  setAmsPolicyMessage('Loading policies...');
  updateAmsSendState();

  await loadAmsPolicies(client.customerId);
}

async function loadAmsPolicies(customerId) {
  try {
    const data = await smartMapApiFetch('/api/extension/ams/policies/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_id: customerId,
      }),
    });

    amsPolicies = Array.isArray(data.policies) ? data.policies : [];
    renderAmsPolicies();
  } catch (error) {
    if (isAmsIntegrationsUnavailableError(error)) {
      handleAmsIntegrationsUnavailable(error.message);
      return;
    }

    amsPolicies = [];
    setAmsPolicyMessage(error instanceof Error ? error.message : String(error));
    updateAmsSendState();
  }
}

function formatAmsPolicyMeta(policy) {
  const dates = [policy.effectiveDate, policy.expirationDate].filter(Boolean).join(' - ');
  return [policy.lineOfBusiness, policy.companyName, dates].filter(Boolean).join(' | ');
}

function renderAmsPolicies() {
  amsPolicyResults.innerHTML = '';
  amsPolicyResults.classList.remove('is-message');

  if (!selectedAmsClient) {
    setAmsPolicyMessage('Select a client to load policies.');
    return;
  }

  if (amsPolicies.length === 0) {
    setAmsPolicyMessage('No matching policies found for this client.');
    updateAmsSendState();
    return;
  }

  amsPolicies.forEach((policy) => {
    const label = document.createElement('label');
    label.className = 'quote-result ams-checkbox';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.policyId = policy.policyId;
    checkbox.addEventListener('change', updateAmsSendState);

    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = policy.policyNumber || 'Policy';
    const meta = document.createElement('span');
    meta.textContent = formatAmsPolicyMeta(policy);
    text.append(title, meta);

    label.append(checkbox, text);
    amsPolicyResults.appendChild(label);
  });

  updateAmsSendState();
}

function getSelectedAmsPolicyIds() {
  return Array.from(amsPolicyResults.querySelectorAll('input[data-policy-id]:checked'))
    .map((input) => input.dataset.policyId || '')
    .filter(Boolean);
}

function updateAmsSaveSections() {
  const noteEnabled = Boolean(amsSaveNoteCheckbox?.checked);
  const documentsEnabled = Boolean(amsSaveDocumentsCheckbox?.checked);
  amsNoteSection?.toggleAttribute('hidden', !noteEnabled);
  amsDocumentsSection?.toggleAttribute('hidden', !documentsEnabled);
}

function createAmsUploadId() {
  return `ams-upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function addAmsUploadedFiles(files) {
  Array.from(files || [])
    .filter((file) => file?.name)
    .forEach((file) => {
      amsUploadedFiles.push({
        id: createAmsUploadId(),
        file,
        title: file.name,
      });
    });

  renderAmsUploadedFiles();
  updateAmsSendState();
}

function removeAmsUploadedFile(fileId) {
  amsUploadedFiles = amsUploadedFiles.filter((item) => item.id !== fileId);
  renderAmsUploadedFiles();
  updateAmsSendState();
}

function renderAmsUploadedFiles() {
  if (!amsDocumentList) {
    return;
  }

  amsDocumentList.innerHTML = '';

  if (amsUploadedFiles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'smartmap-summary';
    empty.textContent = 'No documents selected.';
    amsDocumentList.appendChild(empty);
    return;
  }

  amsUploadedFiles.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'ams-document-item';

    const top = document.createElement('div');
    top.className = 'ams-document-item__top';

    const details = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = item.file.name;
    const meta = document.createElement('span');
    meta.textContent = [formatBytes(item.file.size), item.file.type].filter(Boolean).join(' | ');
    details.append(name, meta);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'icon-button';
    removeButton.setAttribute('aria-label', `Remove ${item.file.name}`);
    removeButton.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
    removeButton.addEventListener('click', () => removeAmsUploadedFile(item.id));

    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Document title';
    const titleInput = document.createElement('input');
    titleInput.className = 'ams-title-input';
    titleInput.value = item.title;
    titleInput.addEventListener('input', () => {
      item.title = titleInput.value;
      updateAmsSendState();
    });

    top.append(details, removeButton);
    row.append(top, titleLabel, titleInput);
    amsDocumentList.appendChild(row);
  });
}

function setAmsSendStatus(state, message = '') {
  if (!amsSendStatus) {
    return;
  }

  amsSendStatus.classList.remove(
    'ams-send-status--success',
    'ams-send-status--error',
    'ams-send-status--loading',
  );

  if (state === 'idle') {
    amsSendStatus.setAttribute('hidden', '');
    amsSendStatus.replaceChildren();
    return;
  }

  amsSendStatus.removeAttribute('hidden');
  amsSendStatus.classList.add(`ams-send-status--${state}`);
  amsSendStatus.replaceChildren();

  if (state === 'success') {
    const icon = document.createElement('span');
    icon.className = 'ams-send-status__icon';
    icon.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

    const text = document.createElement('span');
    text.textContent = message;
    amsSendStatus.append(icon, text);
    return;
  }

  amsSendStatus.textContent = message;
}

function updateAmsSendState() {
  updateAmsSaveSections();

  const selectedPolicyIds = getSelectedAmsPolicyIds();
  const hasSelectedPolicies = selectedPolicyIds.length > 0;
  const noteReady = Boolean(amsSaveNoteCheckbox?.checked) && amsNoteBodyInput.value.trim() !== '';
  const docsReady =
    Boolean(amsSaveDocumentsCheckbox?.checked) &&
    amsUploadedFiles.length > 0 &&
    amsUploadedFiles.every((item) => item.title.trim() !== '');

  amsWhatCard?.toggleAttribute('hidden', !hasSelectedPolicies);
  amsSendCard?.toggleAttribute('hidden', !hasSelectedPolicies);

  if (amsSendButton) {
    amsSendButton.disabled =
      !smartMapConnected ||
      !amsCanUseIntegrations ||
      !selectedAmsClient ||
      !hasSelectedPolicies ||
      (!noteReady && !docsReady);
  }
}

async function sendToAms() {
  if (!selectedAmsClient) {
    setAmsSendStatus('error', 'Select a client first.');
    return;
  }

  const policyIds = getSelectedAmsPolicyIds();
  if (policyIds.length === 0) {
    setAmsSendStatus('error', 'Select at least one policy.');
    return;
  }

  if (!amsCanUseIntegrations) {
    showAmsSubscriptionPopup();
    return;
  }

  const formData = new FormData();
  formData.append('customer_id', selectedAmsClient.customerId);
  policyIds.forEach((policyId) => formData.append('policy_ids[]', policyId));
  formData.append('note_enabled', amsSaveNoteCheckbox.checked ? '1' : '0');
  formData.append('note_title', amsNoteTitleInput.value.trim() || 'AMS Note.txt');
  formData.append('note_body', amsNoteBodyInput.value.trim());
  formData.append('documents_enabled', amsSaveDocumentsCheckbox.checked ? '1' : '0');

  if (amsSaveDocumentsCheckbox.checked) {
    amsUploadedFiles.forEach((item) => {
      formData.append('documents[]', item.file, item.file.name);
      formData.append('document_titles[]', item.title.trim() || item.file.name);
    });
  }

  amsSendButton.disabled = true;
  setAmsSendStatus('loading', 'Sending to AMS360...');

  try {
    const data = await smartMapApiFetch('/api/extension/ams/send', {
      method: 'POST',
      body: formData,
    });

    resetAmsSaveState({
      clearInputs: true,
      resultsMessage: `${data.message || 'Sent to AMS360.'} Search AMS clients by name.`,
    });
    amsClientSearchInput?.focus();
  } catch (error) {
    if (isAmsIntegrationsUnavailableError(error)) {
      handleAmsIntegrationsUnavailable(error.message);
      return;
    }

    setAmsSendStatus('error', error instanceof Error ? error.message : String(error));
  } finally {
    updateAmsSendState();
  }
}

function setSmartMapRunButtonMode(mode) {
  const label = smartMapRunButton?.querySelector('span');
  if (!label) {
    return;
  }

  label.textContent = mode === 'continue' ? 'Continue Mapping' : 'SmartMap';
}

function updateSmartMapActionState(isBusy = false) {
  if (smartMapReadPageButton) {
    smartMapReadPageButton.disabled = isBusy || !selectedSmartMapQuote;
  }

  if (smartMapRunButton) {
    smartMapRunButton.disabled =
      isBusy ||
      !selectedSmartMapQuote ||
      !lastSmartMapSnapshot ||
      smartMapLatestReadState === 'red';
  }

  if (smartMapSaveTrainingButton && !smartMapSaveTrainingButton.hasAttribute('hidden')) {
    smartMapSaveTrainingButton.disabled =
      isBusy || !selectedSmartMapQuote || !lastSmartMapSnapshot || !lastSmartMapMapping;
  }
}

function renderSmartMapSelectedQuote() {
  if (!selectedSmartMapQuote) {
    smartMapSelectedQuote.textContent = 'No quote selected.';
    smartMapMappingCard?.setAttribute('hidden', '');
    updateSmartMapActionState();
    return;
  }

  smartMapSelectedQuote.textContent = `${quoteDisplayName(selectedSmartMapQuote)} - ${quoteMeta(selectedSmartMapQuote)}`;
  smartMapMappingCard?.removeAttribute('hidden');
  updateSmartMapActionState();
}

function updateSmartMapConnectionState() {
  smartMapQuoteSearch.disabled = !smartMapConnected;
  smartMapConnectionStatus.classList.remove('signin-pill--in', 'signin-pill--out');

  if (smartMapConnected) {
    smartMapConnectionStatus.textContent = 'Signed in';
    smartMapConnectionStatus.classList.add('signin-pill--in');
    smartMapSignInButton.setAttribute('aria-label', 'Reconnect to MIA');
    if (smartMapSignInTooltipContent) {
      smartMapSignInTooltipContent.textContent = 'Reconnect to MIA';
    }

    if (!smartMapQuoteSearch.value.trim() && !selectedSmartMapQuote) {
      setSmartMapResultsMessage('Search for a client or quote from your MIA dashboard.');
    }

    return;
  }

  smartMapConnectionStatus.textContent = 'Signed out';
  smartMapConnectionStatus.classList.add('signin-pill--out');
  smartMapSignInButton.setAttribute('aria-label', 'Sign into MIA');
  if (smartMapSignInTooltipContent) {
    smartMapSignInTooltipContent.textContent = 'Sign into MIA';
  }
  setSmartMapResultsMessage('Sign into MIA to search quotes.');
  renderSmartMapSelectedQuote();
}

function openMiaSignIn() {
  smartMapStatus.textContent = 'Waiting for MIA sign-in';
  openNewTab(buildAbsoluteUrl('/extension/connect'));
}

async function loadSmartMapAuth() {
  try {
    const stored = await chrome.storage.local.get({ [SMART_MAP_AUTH_STORAGE_KEY]: null });
    const auth = normalizeSmartMapAuthPayload(stored[SMART_MAP_AUTH_STORAGE_KEY]);

    if (!auth || isSmartMapAuthExpired(auth)) {
      if (auth) {
        await chrome.storage.local.remove(SMART_MAP_AUTH_STORAGE_KEY);
      }
      smartMapAuth = null;
      smartMapConnected = false;
      updateSmartMapConnectionState();
      updateAmsConnectionState();
      return;
    }

    smartMapAuth = auth;
    smartMapConnected = true;

    if (auth.baseUrl) {
      currentBaseUrl = auth.baseUrl;
      restoreBaseUrlInput();
    }

    updateSmartMapConnectionState();
    updateAmsConnectionState();
    validateSmartMapAuth();
  } catch (error) {
    console.warn('MIA extension: failed to load SmartMap auth', error);
    smartMapAuth = null;
    smartMapConnected = false;
    updateSmartMapConnectionState();
    updateAmsConnectionState();
  }
}

async function validateSmartMapAuth() {
  if (!smartMapAuth?.accessToken) {
    return;
  }

  try {
    const data = await smartMapApiFetch('/api/extension/me');
    smartMapAuth = {
      ...smartMapAuth,
      user: data.user || smartMapAuth.user,
      tenant: data.tenant || smartMapAuth.tenant,
    };
    smartMapConnected = true;
    await chrome.storage.local.set({ [SMART_MAP_AUTH_STORAGE_KEY]: smartMapAuth });
    updateSmartMapConnectionState();
    updateAmsConnectionState();
  } catch (error) {
    if (smartMapConnected) {
      smartMapConnectionStatus.textContent = 'Could not verify sign-in';
      setSmartMapResultsMessage(error instanceof Error ? error.message : String(error));
    }
  }
}

async function handleSmartMapAuthUpdated(payload) {
  const auth = normalizeSmartMapAuthPayload(payload);

  if (!auth) {
    return;
  }

  smartMapAuth = auth;
  smartMapConnected = true;
  amsCanUseIntegrations = true;

  if (auth.baseUrl) {
    currentBaseUrl = auth.baseUrl;
    restoreBaseUrlInput();
  }

  smartMapStatus.textContent = 'Ready to map';
  updateSmartMapConnectionState();
  updateAmsConnectionState();
  setSmartMapResultsMessage('Connected. Search for a client or quote.');
  await validateSmartMapAuth();
  if (amsSaveScreen && !amsSaveScreen.hasAttribute('hidden')) {
    refreshAmsIntegrationStatus();
  }
}

function handleSmartMapQuoteSearch() {
  const query = smartMapQuoteSearch.value.trim();

  window.clearTimeout(smartMapSearchTimer);

  if (!smartMapConnected) {
    setSmartMapResultsMessage(
      query.length > 0
        ? 'MIA sign-in is required before quote search can run.'
        : 'Sign into MIA to search quotes.',
    );
    return;
  }

  if (query.length < 2) {
    setSmartMapResultsMessage(
      query.length === 0
        ? 'Search for a client or quote from your MIA dashboard.'
        : 'Enter at least 2 characters.',
    );
    return;
  }

  smartMapSearchTimer = window.setTimeout(() => {
    searchSmartMapQuotes(query);
  }, SMART_MAP_SEARCH_DEBOUNCE_MS);
}

async function searchSmartMapQuotes(query) {
  smartMapSearchAbortController?.abort();
  smartMapSearchAbortController = new AbortController();
  setSmartMapResultsMessage('Searching MIA...');

  try {
    const data = await smartMapApiFetch(
      `/api/extension/quotes/search?query=${encodeURIComponent(query)}`,
      {
        signal: smartMapSearchAbortController.signal,
      },
    );

    renderSmartMapQuoteResults(Array.isArray(data.results) ? data.results : []);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return;
    }

    setSmartMapResultsMessage(error instanceof Error ? error.message : String(error));
  }
}

function renderSmartMapQuoteResults(results) {
  smartMapQuoteResults.innerHTML = '';
  smartMapQuoteResults.classList.remove('is-message');

  if (results.length === 0) {
    setSmartMapResultsMessage('No matching quotes found.');
    return;
  }

  results.forEach((quote) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quote-result';

    const title = document.createElement('strong');
    title.textContent = quoteDisplayName(quote);

    const detail = document.createElement('span');
    detail.textContent = quoteMeta(quote);

    button.append(title, detail);
    button.addEventListener('click', () => {
      selectSmartMapQuote(quote);
    });

    smartMapQuoteResults.appendChild(button);
  });
}

async function selectSmartMapQuote(quote) {
  if (!quote?.id) {
    return;
  }

  smartMapStatus.textContent = 'Loading quote';
  setSmartMapResultsMessage(`Loading ${quoteDisplayName(quote)}...`);

  try {
    const data = await smartMapApiFetch(`/api/extension/quotes/${encodeURIComponent(quote.id)}`);
    selectedSmartMapQuote = data.quote || quote;
    resetSmartMapReadMemory();
    renderSmartMapSelectedQuote();
    smartMapStatus.textContent = 'Ready to map';
    setSmartMapResultsMessage('Quote selected. Read Page when the carrier page is ready.');
  } catch (error) {
    smartMapStatus.textContent = 'Quote load failed';
    setSmartMapResultsMessage(error instanceof Error ? error.message : String(error));
  }
}

function setSmartMapBusy(isBusy, label = 'Reading page') {
  updateSmartMapActionState(isBusy);

  if (isBusy) {
    smartMapStatus.textContent = label;
  }
}

function renderSmartMapSnapshot(snapshot) {
  lastSmartMapSnapshot = snapshot;
  smartMapShouldReadBeforeRun = false;
  resetSmartMapTrainingState();
  setSmartMapRunButtonMode('smartmap');

  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : [];
  const pageTitle = snapshot?.pageTitle || 'Current carrier page';
  const host = snapshot?.host || 'active tab';
  const readState = classifySmartMapSnapshot(snapshot);

  smartMapPageSummary.innerHTML = `<strong>${pageTitle}</strong><br>${host}`;
  smartMapFieldCount.textContent = `${fields.length} field${fields.length === 1 ? '' : 's'} detected`;
  setSmartMapIndicator(readState.state, readState.message);
}

async function readSmartMapPage(actionLabel, requireQuote = true) {
  if (requireQuote && !selectedSmartMapQuote) {
    smartMapStatus.textContent = 'Select a quote first';
    renderSmartMapSelectedQuote();
    return false;
  }

  setSmartMapBusy(true, actionLabel);
  renderSmartMapFillSummary(null);

  try {
    await ensureSmartMapPageAccess();

    const response = await chrome.runtime.sendMessage({ type: 'MIA_SMART_MAP_ANALYZE' });

    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to read the current page.');
    }

    renderSmartMapSnapshot(response.snapshot);
    smartMapStatus.textContent = 'Page read complete';
    return true;
  } catch (error) {
    smartMapStatus.textContent = 'Page read failed';
    smartMapPageSummary.innerHTML = `<strong>Unable to read page.</strong><br>${error instanceof Error ? error.message : String(error)}`;
    smartMapFieldCount.textContent = '0 fields detected';
    setSmartMapIndicator('red', 'No Fields Detected / Error');
    return false;
  } finally {
    setSmartMapBusy(false);
  }
}

async function recordSmartMapFeedback(mapping, summary) {
  if (!selectedSmartMapQuote || !lastSmartMapSnapshot) {
    return;
  }

  await smartMapApiFetch('/api/extension/smart-map/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      quote_id: selectedSmartMapQuote.id,
      page: lastSmartMapSnapshot,
      event_type: summary?.paused ? 'paused_fill' : 'fill',
      source: mapping?.source || null,
      template_id: mapping?.template_id || null,
      summary: summary || null,
      payload: {
        assignment_count: Array.isArray(mapping?.assignments) ? mapping.assignments.length : 0,
        skipped_count: Array.isArray(mapping?.skipped) ? mapping.skipped.length : 0,
        warning_count: Array.isArray(mapping?.warnings) ? mapping.warnings.length : 0,
      },
    }),
  });
}

async function saveSmartMapTraining() {
  if (!selectedSmartMapQuote || !lastSmartMapSnapshot || !lastSmartMapMapping) {
    setSmartMapIndicator('yellow', 'Run SmartMap before saving training.');
    return;
  }

  const assignments = Array.isArray(lastSmartMapMapping.assignments)
    ? lastSmartMapMapping.assignments
    : [];
  if (assignments.length === 0) {
    setSmartMapIndicator('yellow', 'No mappings are available to save.');
    return;
  }

  const label = smartMapSaveTrainingButton?.querySelector('span');
  if (smartMapSaveTrainingButton) {
    smartMapSaveTrainingButton.disabled = true;
  }
  if (label) {
    label.textContent = 'Saving...';
  }

  try {
    const data = await smartMapApiFetch('/api/extension/smart-map/training', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quote_id: selectedSmartMapQuote.id,
        page: lastSmartMapSnapshot,
        mapping: lastSmartMapMapping,
      }),
    });

    const savedMappings = Number(data?.template?.saved_mappings || 0);
    if (savedMappings <= 0) {
      setSmartMapIndicator('yellow', 'No reusable mappings were saved.');
      setSmartMapTrainingActionVisible(true);
      return;
    }

    lastSmartMapMapping = {
      ...lastSmartMapMapping,
      source: 'template',
      template_id: data?.template?.id || lastSmartMapMapping.template_id || null,
    };
    setSmartMapTrainingActionVisible(false);
    setSmartMapIndicator(
      'green',
      `Training saved with ${savedMappings} reusable mapping${savedMappings === 1 ? '' : 's'}.`,
    );
  } catch (error) {
    setSmartMapIndicator('red', error instanceof Error ? error.message : String(error));
    setSmartMapTrainingActionVisible(true);
  }
}

async function runSmartMapFill() {
  if (!selectedSmartMapQuote) {
    smartMapStatus.textContent = 'Select a quote first';
    renderSmartMapSelectedQuote();
    return;
  }

  if (!lastSmartMapSnapshot) {
    setSmartMapIndicator('yellow', 'Read Page before running SmartMap.');
    return;
  }

  if (smartMapLatestReadState === 'red') {
    setSmartMapIndicator('red', 'No readable fields available for SmartMap.');
    return;
  }

  if (smartMapShouldReadBeforeRun) {
    const pageRead = await readSmartMapPage('Reading updated page', true);
    if (!pageRead || !lastSmartMapSnapshot) {
      setSmartMapIndicator('red', 'Could not read updated carrier page.');
      return;
    }
  }

  setSmartMapBusy(true, 'Running SmartMap');
  renderSmartMapFillSummary(null);
  resetSmartMapTrainingState();
  setSmartMapIndicator('yellow', 'Mapping MIA data to carrier fields.');

  try {
    const data = await smartMapApiFetch('/api/extension/smart-map/map', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quote_id: selectedSmartMapQuote.id,
        page: lastSmartMapSnapshot,
      }),
    });

    lastSmartMapMapping = data?.mapping || null;
    const assignments = Array.isArray(data?.mapping?.assignments) ? data.mapping.assignments : [];

    if (assignments.length === 0) {
      setSmartMapIndicator('red', 'No confident mappings returned.');
      renderSmartMapFillSummary({
        filled: [],
        skipped: data?.mapping?.skipped || [],
        lowConfidence: [],
      });
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'MIA_SMART_MAP_FILL',
      assignments,
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to fill carrier fields.');
    }

    lastSmartMapFillSummary = {
      ...(response.summary || {}),
      source: data?.mapping?.source || null,
    };
    renderSmartMapFillSummary(lastSmartMapFillSummary);
    recordSmartMapFeedback(data?.mapping || null, lastSmartMapFillSummary).catch((error) => {
      console.warn('MIA extension: unable to record SmartMap feedback', error);
    });

    if (response.summary?.paused) {
      smartMapShouldReadBeforeRun = true;
      setSmartMapRunButtonMode('continue');
      setSmartMapIndicator(
        'yellow',
        response.summary.message || 'Carrier page changed. Review, then continue mapping.',
      );
      return;
    }

    smartMapShouldReadBeforeRun = false;
    setSmartMapRunButtonMode('smartmap');
    setSmartMapTrainingActionVisible(data?.mapping?.source === 'ai');
    setSmartMapIndicator(
      'green',
      data?.mapping?.source === 'template'
        ? 'Saved template filled available fields. Review before continuing.'
        : 'SmartMap filled available fields. Review before continuing.',
    );
  } catch (error) {
    setSmartMapIndicator('red', error instanceof Error ? error.message : String(error));
  } finally {
    setSmartMapBusy(false);
  }
}

function parseZipFromAddress() {
  if (!currentAddress) {
    return null;
  }

  const zipMatch = currentAddress.match(/\b\d{5}(?:-\d{4})?\b(?!.*\b\d{5}(?:-\d{4})?\b)/);
  if (!zipMatch) {
    return null;
  }

  return zipMatch[0].slice(0, 5);
}

async function lookupCounty(zip) {
  if (countyCache.has(zip)) {
    return countyCache.get(zip);
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&country=USA&format=json`,
    );
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const parts = data[0].display_name?.split(',') ?? [];
      const countyPart = parts.find((part) => {
        const normalized = part.trim().toLowerCase();
        return normalized.includes('county') || normalized.includes('parish');
      });
      const county = countyPart ? countyPart.trim() : null;
      countyCache.set(zip, county);
      return county;
    }
  } catch (error) {
    console.warn('MIA extension: county lookup failed', error);
  }

  countyCache.set(zip, null);
  return null;
}

function handlePersonalSelection(event) {
  const { value } = event.target;
  if (!value) {
    return;
  }

  const url = buildAbsoluteUrl(value);
  openNewTab(url);
  event.target.value = '';
}

function handleCommercialSelection(event) {
  const { value } = event.target;
  if (!value) {
    return;
  }

  const url = buildAbsoluteUrl(value);
  openNewTab(url);
  event.target.value = '';
}

function restoreBaseUrlInput() {
  baseUrlInput.value = currentBaseUrl;
}

async function loadBaseUrl() {
  try {
    const { miaBaseUrl } = await chrome.storage.sync.get({ miaBaseUrl: DEFAULT_BASE_URL });
    currentBaseUrl = miaBaseUrl || DEFAULT_BASE_URL;
    restoreBaseUrlInput();
  } catch (error) {
    console.warn('MIA extension: failed to read base URL, using default', error);
    currentBaseUrl = DEFAULT_BASE_URL;
    restoreBaseUrlInput();
  }
}

async function saveBaseUrl() {
  const raw = baseUrlInput.value || '';
  let valueToNormalize = raw.trim();
  // If the user entered only a subdomain (no scheme and no dot), assume *.mia.agency
  if (
    valueToNormalize &&
    !/^https?:\/\//i.test(valueToNormalize) &&
    !valueToNormalize.includes('.')
  ) {
    valueToNormalize = `${valueToNormalize}.mia.agency`;
  }
  const normalized = normalizeBaseUrl(valueToNormalize);
  const nextValue = normalized || DEFAULT_BASE_URL;
  const shouldClearSmartMapAuth = smartMapAuth?.baseUrl && smartMapAuth.baseUrl !== nextValue;

  currentBaseUrl = nextValue;
  restoreBaseUrlInput();

  if (shouldClearSmartMapAuth) {
    await clearSmartMapAuth();
    smartMapStatus.textContent = 'Reconnect to MIA';
  }

  try {
    await chrome.storage.sync.set({ miaBaseUrl: nextValue });
    saveBaseUrlButton.textContent = 'Saved';
    // Close settings dialog if open
    if (settingsDialog && typeof settingsDialog.close === 'function') {
      try {
        settingsDialog.close();
      } catch {
        /* Dialog may already be closed. */
      }
    }
    setTimeout(() => {
      saveBaseUrlButton.textContent = 'Save';
    }, 1800);
  } catch (error) {
    console.error('MIA extension: unable to store base URL', error);
    saveBaseUrlButton.textContent = 'Retry';
    setTimeout(() => {
      saveBaseUrlButton.textContent = 'Save';
    }, 2000);
  }
}

function initializeSelects() {
  populateSelect(personalSelect, personalForms);
  populateSelect(commercialSelect, commercialForms);
  populateMenu(personalMenu, personalForms);
  populateMenu(commercialMenu, commercialForms);
}

function wireEvents() {
  personalSelect.addEventListener('change', handlePersonalSelection);
  commercialSelect.addEventListener('change', handleCommercialSelection);
  saveBaseUrlButton.addEventListener('click', saveBaseUrl);

  const hideTooltip = (wrapper) => {
    wrapper?.removeAttribute('data-active');
  };

  const attachTooltipHandlers = (wrapper, target) => {
    if (!wrapper || !target) {
      return;
    }
    const show = () => wrapper.setAttribute('data-active', 'true');
    const hide = () => wrapper.removeAttribute('data-active');
    target.addEventListener('mouseenter', show);
    target.addEventListener('focus', show);
    target.addEventListener('mouseleave', hide);
    target.addEventListener('blur', hide);
    target.addEventListener('click', hide);
  };

  attachTooltipHandlers(settingsTooltip, settingsButton);
  attachTooltipHandlers(mergeTooltip, mergePdfsButton);
  attachTooltipHandlers(smartMapTooltip, smartMapTooltip);
  attachTooltipHandlers(smartMapSignInTooltip, smartMapSignInButton);
  attachTooltipHandlers(amsSaveTooltip, amsSaveButton);
  attachTooltipHandlers(amsSaveSignInTooltip, amsSaveSignInButton);
  attachTooltipHandlers(homeTooltip, homeButton);

  if (settingsDialog) {
    settingsDialog.addEventListener('close', () => {
      hideTooltip(settingsTooltip);
      settingsButton?.blur();
    });
  }

  window.addEventListener('pdfMergeOverlayClosed', () => {
    hideTooltip(mergeTooltip);
    mergePdfsButton?.blur();
  });

  if (smartMapButton) {
    smartMapButton.addEventListener('click', () => {
      if (smartMapButton.disabled) {
        return;
      }

      hideTooltip(smartMapTooltip);
      showSmartMapScreen();
    });
  }

  if (amsSaveButton) {
    amsSaveButton.addEventListener('click', () => {
      hideTooltip(amsSaveTooltip);
      showAmsSaveScreen();
    });
  }

  if (homeButton) {
    homeButton.addEventListener('click', () => {
      hideTooltip(homeTooltip);
      showQuickToolsScreen();
    });
  }

  if (smartMapSignInButton) {
    smartMapSignInButton.addEventListener('click', openMiaSignIn);
  }

  if (amsSaveSignInButton) {
    amsSaveSignInButton.addEventListener('click', openMiaSignIn);
  }

  if (amsSubscriptionCloseButton && amsSubscriptionDialog) {
    amsSubscriptionCloseButton.addEventListener('click', () => {
      try {
        amsSubscriptionDialog.close();
      } catch {
        /* Dialog may already be closed. */
      }
    });
  }

  if (smartMapQuoteSearch) {
    smartMapQuoteSearch.addEventListener('input', handleSmartMapQuoteSearch);
  }

  if (smartMapReadPageButton) {
    smartMapReadPageButton.addEventListener('click', () => readSmartMapPage('Reading page', true));
  }

  if (smartMapRunButton) {
    smartMapRunButton.addEventListener('click', runSmartMapFill);
  }

  if (smartMapSaveTrainingButton) {
    smartMapSaveTrainingButton.addEventListener('click', saveSmartMapTraining);
  }

  if (amsClientSearchInput) {
    amsClientSearchInput.addEventListener('input', handleAmsClientSearch);
    amsClientSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchAmsClients(amsClientSearchInput.value.trim());
      }
    });
  }

  if (amsClientSearchButton) {
    amsClientSearchButton.addEventListener('click', () =>
      searchAmsClients(amsClientSearchInput.value.trim()),
    );
  }

  [amsSaveNoteCheckbox, amsSaveDocumentsCheckbox].forEach((checkbox) => {
    checkbox?.addEventListener('change', updateAmsSendState);
  });

  [amsNoteTitleInput, amsNoteBodyInput].forEach((input) => {
    input?.addEventListener('input', updateAmsSendState);
  });

  if (amsDocumentInput) {
    amsDocumentInput.addEventListener('change', (event) => {
      addAmsUploadedFiles(event.target.files);
      amsDocumentInput.value = '';
    });
  }

  if (amsUploadDropzone) {
    ['dragenter', 'dragover'].forEach((eventName) => {
      amsUploadDropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        amsUploadDropzone.classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach((eventName) => {
      amsUploadDropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        amsUploadDropzone.classList.remove('is-dragging');
      });
    });
    amsUploadDropzone.addEventListener('drop', (event) => {
      addAmsUploadedFiles(event.dataTransfer?.files || []);
    });
  }

  if (amsSendButton) {
    amsSendButton.addEventListener('click', sendToAms);
  }

  // Dropdown triggers
  if (personalTrigger && personalMenu) {
    personalTrigger.addEventListener('click', () => toggleMenu(personalTrigger, personalMenu));
  }
  if (commercialTrigger && commercialMenu) {
    commercialTrigger.addEventListener('click', () =>
      toggleMenu(commercialTrigger, commercialMenu),
    );
  }
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (
      personalMenu &&
      !personalMenu.hasAttribute('hidden') &&
      !personalMenu.contains(t) &&
      !personalTrigger.contains(t)
    ) {
      closeMenus();
    }
    if (
      commercialMenu &&
      !commercialMenu.hasAttribute('hidden') &&
      !commercialMenu.contains(t) &&
      !commercialTrigger.contains(t)
    ) {
      closeMenus();
    }
  });

  // Settings dialog controls
  if (settingsButton && settingsDialog) {
    settingsButton.addEventListener('click', () => {
      try {
        settingsDialog.showModal();
      } catch {
        /* Dialog may already be open. */
      }
      settingsButton.blur();
    });
  }
  if (mergePdfsButton) {
    let mergeOverlayReady = typeof window.openPdfMergeOverlay === 'function';
    const overlayWaiters = [];
    let overlayPrimed = false;

    const primeOverlay = () => {
      if (overlayPrimed) {
        return;
      }
      const ensureFn = window.ensurePdfMergeOverlay;
      if (typeof ensureFn === 'function') {
        ensureFn();
        overlayPrimed = true;
      }
    };

    const notifyOverlayReady = () => {
      mergeOverlayReady = true;
      mergePdfsButton.disabled = false;
      mergePdfsButton.removeAttribute('aria-busy');
      primeOverlay();
      while (overlayWaiters.length > 0) {
        const callback = overlayWaiters.shift();
        callback?.();
      }
    };

    const waitForOverlay = () => {
      if (mergeOverlayReady) return;
      if (typeof window.openPdfMergeOverlay === 'function') {
        notifyOverlayReady();
        return;
      }
      requestAnimationFrame(waitForOverlay);
    };

    if (mergeOverlayReady) {
      notifyOverlayReady();
    } else {
      waitForOverlay();
    }

    window.addEventListener(
      'pdfMergeOverlayReady',
      () => {
        if (!mergeOverlayReady && typeof window.openPdfMergeOverlay === 'function') {
          notifyOverlayReady();
        }
      },
      { once: true },
    );

    const openOverlay = () => {
      const { openPdfMergeOverlay } = window;
      if (typeof openPdfMergeOverlay === 'function') {
        openPdfMergeOverlay();
        mergePdfsButton.blur();
      }
    };

    mergePdfsButton.addEventListener('click', () => {
      if (mergeOverlayReady && typeof window.openPdfMergeOverlay === 'function') {
        openOverlay();
        return;
      }

      mergePdfsButton.disabled = true;
      mergePdfsButton.setAttribute('aria-busy', 'true');
      mergePdfsButton.blur();
      overlayWaiters.push(() => {
        openOverlay();
      });
      waitForOverlay();
    });
  }
  if (closeSettingsBtn && settingsDialog) {
    closeSettingsBtn.addEventListener('click', () => {
      try {
        settingsDialog.close();
      } catch {
        /* Dialog may already be closed. */
      }
    });
  }
  if (closeSettingsBtn2 && settingsDialog) {
    closeSettingsBtn2.addEventListener('click', () => {
      try {
        settingsDialog.close();
      } catch {
        /* Dialog may already be closed. */
      }
    });
  }

  zillowButton.addEventListener('click', () => {
    if (!currentAddress) {
      return;
    }
    const url = `https://www.zillow.com/homes/${encodeURIComponent(currentAddress)}`;
    openNewTab(url);
  });

  googleButton.addEventListener('click', () => {
    if (!currentAddress) {
      return;
    }
    const url = `https://www.google.com/search?q=${encodeURIComponent(currentAddress)}`;
    openNewTab(url);
  });

  taxButton.addEventListener('click', async () => {
    if (!currentAddress) {
      return;
    }

    const originalLabel = taxButton.textContent;
    taxButton.textContent = 'Preparing…';
    taxButton.disabled = true;

    try {
      const zip = parseZipFromAddress();
      let query = `${currentAddress} county tax assessor`;

      if (zip) {
        const county = await lookupCounty(zip);
        query = county ? `${county} Tax Assessor` : `${zip} property tax assessor`;
      }

      openNewTab(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    } finally {
      taxButton.textContent = originalLabel;
      updateQuickActionState(!currentAddress);
    }
  });
}

function handleIncomingMessage(message) {
  if (message?.type === 'MIA_ADDRESS_UPDATE') {
    setAddressDisplay(message.payload?.address ?? '');
  }

  if (message?.type === 'MIA_SMART_MAP_AUTH_UPDATED') {
    handleSmartMapAuthUpdated(message.payload);
  }
}

async function init() {
  renderExtensionVersion();
  initializeSelects();
  wireEvents();
  await loadBaseUrl();
  await loadSmartMapAuth();
  resetAmsSaveState();
  updateAmsConnectionState();

  const response = await chrome.runtime.sendMessage({ type: 'MIA_PANEL_READY' }).catch(() => null);
  if (response?.address) {
    setAddressDisplay(response.address);
  } else {
    const fallback = await chrome.runtime
      .sendMessage({ type: 'MIA_REQUEST_ADDRESS' })
      .catch(() => null);
    if (fallback?.address) {
      setAddressDisplay(fallback.address);
    } else {
      setAddressDisplay('');
    }
  }
}

chrome.runtime.onMessage.addListener(handleIncomingMessage);

init();
