let lastAddress = '';
let lastSmartMapReadTab = null;
const preparedTabs = new Set();
const SMART_MAP_AUTH_STORAGE_KEY = 'miaSmartMapAuth';
const smartMapAuthTabsPendingClose = new Set();

function normalizeSmartMapAuthPayload(payload) {
  const accessToken = payload?.accessToken || payload?.access_token;

  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    tokenType: payload?.tokenType || payload?.token_type || 'Bearer',
    expiresAt: payload?.expiresAt || payload?.expires_at || null,
    user: payload?.user || null,
    tenant: payload?.tenant || null,
    baseUrl: payload?.baseUrl || payload?.base_url || null,
    connectedAt: new Date().toISOString(),
  };
}

async function storeSmartMapAuth(payload) {
  const auth = normalizeSmartMapAuthPayload(payload);

  if (!auth) {
    throw new Error('Missing MIA extension token.');
  }

  await chrome.storage.local.set({ [SMART_MAP_AUTH_STORAGE_KEY]: auth });

  if (auth.baseUrl) {
    await chrome.storage.sync.set({ miaBaseUrl: auth.baseUrl });
  }

  chrome.runtime
    .sendMessage({
      type: 'MIA_SMART_MAP_AUTH_UPDATED',
      payload: auth,
    })
    .catch(() => {
      /* Side panel might not be open yet */
    });

  return auth;
}

function closeSmartMapAuthTab(tabId) {
  if (!isValidTabId(tabId) || smartMapAuthTabsPendingClose.has(tabId)) {
    return;
  }

  smartMapAuthTabsPendingClose.add(tabId);
  setTimeout(() => {
    chrome.tabs
      .remove(tabId)
      .catch((error) => {
        console.warn('Failed to close SmartMap auth tab', error);
      })
      .finally(() => {
        smartMapAuthTabsPendingClose.delete(tabId);
      });
  }, 3000);
}

function collectSmartMapSnapshot() {
  const MAX_FIELDS = 120;

  const normalizeText = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  const truncateText = (value, max = 180) => {
    const text = normalizeText(value);
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
  };
  const cssEscape = (value) => {
    if (window.CSS?.escape) {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, '\\$&');
  };
  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const labelledByText = (element) => {
    const ids = normalizeText(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean);
    return ids
      .map((id) => document.getElementById(id)?.innerText || '')
      .map(normalizeText)
      .filter(Boolean)
      .join(' ');
  };
  const explicitLabelText = (element) => {
    const id = element.getAttribute('id');
    if (!id) {
      return '';
    }

    const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
    return normalizeText(label?.innerText || label?.textContent || '');
  };
  const wrappingLabelText = (element) => {
    const label = element.closest('label');
    return normalizeText(label?.innerText || label?.textContent || '');
  };
  const fieldsetLegendText = (element) => {
    const fieldset = element.closest('fieldset');
    const legend = fieldset?.querySelector('legend');
    return normalizeText(legend?.innerText || legend?.textContent || '');
  };
  const nearbyText = (element) => {
    const container = element.closest(
      'fieldset, tr, li, [class*="field"], [class*="form"], [class*="row"], [class*="group"], div',
    );
    if (!container) {
      return '';
    }

    return truncateText(container.innerText || container.textContent || '', 180);
  };
  const tableCellContext = (element) => {
    const cell = element.closest('td, th');
    const row = cell?.parentElement;
    const cells = row
      ? Array.from(row.children).filter((child) => child instanceof HTMLElement)
      : [];
    const cellIndex = cell ? cells.indexOf(cell) : -1;
    const previousCell = cellIndex > 0 ? cells[cellIndex - 1] : null;
    const nextCell = cellIndex >= 0 && cellIndex < cells.length - 1 ? cells[cellIndex + 1] : null;

    return {
      previousCellText: truncateText(
        previousCell?.innerText || previousCell?.textContent || '',
        140,
      ),
      currentCellText: truncateText(cell?.innerText || cell?.textContent || '', 140),
      nextCellText: truncateText(nextCell?.innerText || nextCell?.textContent || '', 140),
      rowText: truncateText(row?.innerText || row?.textContent || '', 260),
    };
  };
  const getLabel = (element) => {
    const cellContext = tableCellContext(element);

    return truncateText(
      labelledByText(element) ||
        normalizeText(element.getAttribute('aria-label')) ||
        explicitLabelText(element) ||
        wrappingLabelText(element) ||
        normalizeText(element.getAttribute('placeholder')) ||
        fieldsetLegendText(element) ||
        cellContext.previousCellText ||
        normalizeText(element.getAttribute('name')) ||
        normalizeText(element.getAttribute('id')),
      120,
    );
  };
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, [role="heading"]'))
    .filter(isVisible)
    .map((heading) => ({
      text: truncateText(heading.innerText || heading.textContent || '', 120),
      top: heading.getBoundingClientRect().top,
    }))
    .filter((heading) => heading.text);
  const sectionFor = (element) => {
    const top = element.getBoundingClientRect().top;
    const previousHeadings = headings.filter((heading) => heading.top <= top);
    return previousHeadings.length > 0 ? previousHeadings[previousHeadings.length - 1].text : '';
  };
  const getSelectOptions = (select) => {
    return Array.from(select.options || [])
      .map((option) => ({
        text: normalizeText(option.textContent || option.label || option.value),
        value: normalizeText(option.value),
        selected: option.selected,
        disabled: option.disabled,
      }))
      .filter((option) => option.text || option.value)
      .slice(0, 100);
  };
  const getRadioOptions = (radio) => {
    const name = radio.getAttribute('name');
    const selector = name ? `input[type="radio"][name="${cssEscape(name)}"]` : '';
    const radios = selector ? Array.from(document.querySelectorAll(selector)) : [radio];

    return radios
      .filter((input) => input instanceof HTMLInputElement && isVisible(input))
      .map((input) => ({
        value: normalizeText(input.value),
        label: getLabel(input) || normalizeText(input.value),
      }))
      .filter((option) => option.label || option.value)
      .slice(0, 40);
  };
  const getRoleOptions = (element) => {
    const controls = element.getAttribute('aria-controls');
    const listbox = controls ? document.getElementById(controls) : null;
    const optionNodes = listbox ? listbox.querySelectorAll('[role="option"]') : [];

    return Array.from(optionNodes)
      .filter((option) => option instanceof HTMLElement)
      .map((option) => normalizeText(option.innerText || option.textContent || ''))
      .filter(Boolean)
      .slice(0, 80);
  };

  const controls = Array.from(
    document.querySelectorAll(
      [
        'input',
        'select',
        'textarea',
        '[contenteditable="true"]',
        '[role="combobox"]',
        '[role="textbox"]',
        '[role="spinbutton"]',
      ].join(','),
    ),
  );
  const fields = [];
  const seenRadioGroups = new Set();

  controls.forEach((control, index) => {
    if (!(control instanceof HTMLElement) || !isVisible(control)) {
      return;
    }

    const tag = control.tagName.toLowerCase();
    const inputType = control instanceof HTMLInputElement ? control.type.toLowerCase() : '';
    const role = normalizeText(control.getAttribute('role'));
    const type = inputType || role || tag;

    if (['hidden', 'password', 'file', 'submit', 'button', 'reset', 'image'].includes(type)) {
      return;
    }

    if (type === 'radio') {
      const groupKey =
        control.getAttribute('name') || control.getAttribute('id') || `radio_${index}`;
      if (seenRadioGroups.has(groupKey)) {
        return;
      }
      seenRadioGroups.add(groupKey);
    }

    const options =
      control instanceof HTMLSelectElement
        ? getSelectOptions(control)
        : type === 'radio'
          ? getRadioOptions(control)
          : getRoleOptions(control);
    const cellContext = tableCellContext(control);

    fields.push({
      id: `field_${fields.length + 1}`,
      tag,
      type,
      role,
      label: getLabel(control),
      name: normalizeText(control.getAttribute('name')),
      htmlId: normalizeText(control.getAttribute('id')),
      placeholder: normalizeText(control.getAttribute('placeholder')),
      section: sectionFor(control),
      nearbyText: nearbyText(control),
      previousCellText: cellContext.previousCellText,
      currentCellText: cellContext.currentCellText,
      nextCellText: cellContext.nextCellText,
      rowText: cellContext.rowText,
      required:
        control.hasAttribute('required') || control.getAttribute('aria-required') === 'true',
      disabled:
        control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true',
      hasValue:
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
          ? normalizeText(control.value).length > 0
          : normalizeText(control.innerText || control.textContent || '').length > 0,
      options,
    });
  });

  return {
    href: window.location.href,
    host: window.location.host,
    pageTitle: normalizeText(document.title),
    headings: headings.map((heading) => heading.text).slice(0, 20),
    fields: fields.slice(0, MAX_FIELDS),
    fieldLimitReached: fields.length > MAX_FIELDS,
  };
}

function isValidTabId(tabId) {
  return typeof tabId === 'number' && tabId >= 0;
}

async function analyzeActiveSmartMapTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!isValidTabId(tab?.id)) {
    throw new Error('No active carrier tab found.');
  }

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectSmartMapSnapshot,
  });

  lastSmartMapReadTab = { id: tab.id, windowId: tab.windowId, href: result?.result?.href };
  return result?.result;
}

async function applySmartMapAssignments(assignments, demoContext = null) {
  const MIN_CONFIDENCE_TO_FILL = 0.5;
  const CONDITIONAL_CHANGE_SETTLE_MS = 900;

  const normalizeText = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  const normalizeChoice = (value) =>
    normalizeText(value)
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const choiceTokens = (value) =>
    normalizeChoice(value)
      .split(' ')
      .filter((token) => token.length > 1);
  const scoreChoice = (candidate, desired) => {
    const candidateText = normalizeChoice(candidate);
    const desiredText = normalizeChoice(desired);

    if (!candidateText || !desiredText) {
      return 0;
    }

    if (candidateText === desiredText) {
      return 100;
    }

    if (candidateText.includes(desiredText) || desiredText.includes(candidateText)) {
      return 85;
    }

    const desiredTokens = choiceTokens(desiredText);
    const candidateTokens = choiceTokens(candidateText);
    if (desiredTokens.length === 0 || candidateTokens.length === 0) {
      return 0;
    }

    const matchedTokens = desiredTokens.filter((token) => candidateTokens.includes(token)).length;
    return Math.round((matchedTokens / desiredTokens.length) * 70);
  };
  const cssEscape = (value) => {
    if (window.CSS?.escape) {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, '\\$&');
  };
  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const explicitLabelText = (element) => {
    const id = element.getAttribute('id');
    if (!id) {
      return '';
    }

    const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
    return normalizeText(label?.innerText || label?.textContent || '');
  };
  const wrappingLabelText = (element) => {
    const label = element.closest('label');
    return normalizeText(label?.innerText || label?.textContent || '');
  };
  const fieldLabel = (element) =>
    normalizeText(
      element.getAttribute('aria-label') ||
        explicitLabelText(element) ||
        wrappingLabelText(element) ||
        element.getAttribute('placeholder') ||
        element.getAttribute('name') ||
        element.getAttribute('id'),
    );
  const controls = Array.from(
    document.querySelectorAll(
      [
        'input',
        'select',
        'textarea',
        '[contenteditable="true"]',
        '[role="combobox"]',
        '[role="textbox"]',
        '[role="spinbutton"]',
      ].join(','),
    ),
  );
  const fields = [];
  const seenRadioGroups = new Set();

  controls.forEach((control, index) => {
    if (!(control instanceof HTMLElement) || !isVisible(control)) {
      return;
    }

    const inputType = control instanceof HTMLInputElement ? control.type.toLowerCase() : '';
    const role = normalizeText(control.getAttribute('role'));
    const type = inputType || role || control.tagName.toLowerCase();

    if (['hidden', 'password', 'file', 'submit', 'button', 'reset', 'image'].includes(type)) {
      return;
    }

    if (type === 'radio') {
      const groupKey =
        control.getAttribute('name') || control.getAttribute('id') || `radio_${index}`;
      if (seenRadioGroups.has(groupKey)) {
        return;
      }
      seenRadioGroups.add(groupKey);
    }

    fields.push({
      id: `field_${fields.length + 1}`,
      element: control,
      type,
    });
  });

  const byFieldId = new Map(fields.map((field) => [field.id, field]));
  const eventOptions = { bubbles: true };
  const shouldSuppressChangeEvents = Boolean(
    document.querySelector('input[name="__VIEWSTATE"], input[name="__EVENTTARGET"]') ||
    typeof window.__doPostBack === 'function',
  );
  const dispatchInputEvent = (element) => {
    element.dispatchEvent(new Event('input', eventOptions));
  };
  const dispatchValueEvents = (element, includeChange = true, forceChange = false) => {
    dispatchInputEvent(element);

    if (includeChange && (forceChange || !shouldSuppressChangeEvents)) {
      element.dispatchEvent(new Event('change', eventOptions));
    }
  };
  const setNativeValue = (element, value) => {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  };
  const sleep = (milliseconds) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
  const pageSignature = () => {
    const visibleControls = Array.from(
      document.querySelectorAll(
        [
          'input',
          'select',
          'textarea',
          '[contenteditable="true"]',
          '[role="combobox"]',
          '[role="textbox"]',
          '[role="spinbutton"]',
        ].join(','),
      ),
    )
      .filter((control) => control instanceof HTMLElement && isVisible(control))
      .map((control) => {
        const tag = control.tagName.toLowerCase();
        const type =
          control instanceof HTMLInputElement
            ? control.type.toLowerCase()
            : normalizeText(control.getAttribute('role')) || tag;
        const optionsLength = control instanceof HTMLSelectElement ? control.options.length : 0;

        return [
          tag,
          type,
          normalizeText(control.getAttribute('name')),
          normalizeText(control.getAttribute('id')),
          control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true'
            ? 'disabled'
            : 'enabled',
          optionsLength,
        ].join(':');
      });

    return [
      window.location.href,
      normalizeText(document.title),
      visibleControls.length,
      visibleControls.join('|'),
    ].join('::');
  };
  const isConditionalField = (field) => {
    if (!field?.element) {
      return false;
    }

    if (
      field.element instanceof HTMLSelectElement ||
      field.type === 'radio' ||
      field.type === 'checkbox'
    ) {
      return true;
    }

    const label = normalizeChoice(fieldLabel(field.element));
    return [
      'state',
      'product',
      'territory',
      'parish',
      'county',
      'construction',
      'foundation',
      'coverage',
      'deductible',
      'payment',
      'payor',
      'roof',
      'siding',
      'status',
    ].some((keyword) => label.includes(keyword));
  };
  const fillSelect = (select, value, fillOptions = {}) => {
    const desired = normalizeText(value);
    const rankedOptions = Array.from(select.options || [])
      .filter((candidate) => !candidate.disabled)
      .map((candidate) => {
        const text = normalizeText(candidate.textContent || candidate.label || '');
        const rawValue = normalizeText(candidate.value);
        const bestScore = Math.max(scoreChoice(text, desired), scoreChoice(rawValue, desired));

        return {
          option: candidate,
          text,
          value: rawValue,
          score: bestScore,
        };
      })
      .filter((candidate) => candidate.score >= 60 && (candidate.text || candidate.value))
      .sort((a, b) => b.score - a.score);
    const match = rankedOptions[0];

    if (!match) {
      return false;
    }

    select.value = match.option.value;
    dispatchValueEvents(
      select,
      Boolean(fillOptions.includeChange),
      Boolean(fillOptions.forceChange),
    );

    const selected = select.options[select.selectedIndex];
    return (
      selected === match.option ||
      normalizeChoice(selected?.textContent || selected?.label || '') ===
        normalizeChoice(match.text) ||
      normalizeChoice(selected?.value || '') === normalizeChoice(match.value)
    );
  };
  const fillRadio = (radio, value, fillOptions = {}) => {
    const name = radio.getAttribute('name');
    const radios = name
      ? Array.from(document.querySelectorAll(`input[type="radio"][name="${cssEscape(name)}"]`))
      : [radio];
    const desired = normalizeChoice(value);
    const match = radios.find((candidate) => {
      return (
        candidate instanceof HTMLInputElement &&
        isVisible(candidate) &&
        (normalizeChoice(candidate.value) === desired ||
          normalizeChoice(fieldLabel(candidate)) === desired)
      );
    });

    if (!match) {
      return false;
    }

    match.checked = true;
    dispatchValueEvents(
      match,
      Boolean(fillOptions.includeChange),
      Boolean(fillOptions.forceChange),
    );
    return true;
  };
  const fillCheckbox = (checkbox, value, fillOptions = {}) => {
    const desired =
      typeof value === 'boolean'
        ? value
        : ['true', 'yes', 'y', '1', 'checked', 'selected'].includes(normalizeChoice(value));

    checkbox.checked = desired;
    dispatchValueEvents(
      checkbox,
      Boolean(fillOptions.includeChange),
      Boolean(fillOptions.forceChange),
    );
    return true;
  };
  const fillElement = (element, value, type, fillOptions = {}) => {
    if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') {
      return { filled: false, reason: 'Field is disabled.' };
    }

    if (element instanceof HTMLSelectElement) {
      return fillSelect(element, value, fillOptions)
        ? { filled: true }
        : { filled: false, reason: 'No matching select option.' };
    }

    if (element instanceof HTMLInputElement && type === 'radio') {
      return fillRadio(element, value, fillOptions)
        ? { filled: true }
        : { filled: false, reason: 'No matching radio option.' };
    }

    if (element instanceof HTMLInputElement && type === 'checkbox') {
      return fillCheckbox(element, value, fillOptions)
        ? { filled: true }
        : { filled: false, reason: 'Unable to set checkbox.' };
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      setNativeValue(element, String(value));
      dispatchValueEvents(
        element,
        Boolean(fillOptions.includeChange),
        Boolean(fillOptions.forceChange),
      );
      return { filled: true };
    }

    if (element.isContentEditable) {
      element.textContent = String(value);
      dispatchValueEvents(
        element,
        Boolean(fillOptions.includeChange),
        Boolean(fillOptions.forceChange),
      );
      return { filled: true };
    }

    if (['combobox', 'textbox', 'spinbutton'].includes(type)) {
      element.textContent = String(value);
      element.setAttribute('value', String(value));
      dispatchValueEvents(
        element,
        Boolean(fillOptions.includeChange),
        Boolean(fillOptions.forceChange),
      );
      return { filled: true };
    }

    return { filled: false, reason: 'Unsupported field type.' };
  };
  const summary = {
    filled: [],
    skipped: [],
    lowConfidence: [],
    changeEventsSuppressed: shouldSuppressChangeEvents,
    staged: true,
    paused: false,
    pageChanged: false,
    remaining: 0,
    message: '',
  };
  const liveDemoSignature = () =>
    pageSignature() +
    JSON.stringify(
      fields.map(({ element }) => [
        fieldLabel(element),
        element.getAttribute('aria-label'),
        element.getAttribute('placeholder'),
        element.getAttribute('role'),
        Boolean(element.readOnly),
        normalizeText(
          element.closest(
            'fieldset, tr, li, [class*="field"], [class*="row"], [class*="group"], div',
          )?.textContent,
        ),
      ]),
    );
  const initialDemoSignature = demoContext ? liveDemoSignature() : null;
  const fillAssignment = (assignment, field, fillOptions = {}) => {
    if (
      demoContext &&
      (summary.paused ||
        !field.element.isConnected ||
        !isVisible(field.element) ||
        liveDemoSignature() !== initialDemoSignature)
    ) {
      summary.paused = true;
      summary.pageChanged = true;
      summary.message = 'Page changed. Read Page again before using the demo fallback.';
      summary.skipped.push({
        field_id: assignment.field_id,
        reason: 'Page changed during fill. Review and Read Page again.',
      });
      return false;
    }
    if (
      demoContext &&
      (field.element.readOnly ||
        field.element.disabled ||
        normalizeText(field.element.value) !== '')
    ) {
      summary.skipped.push({
        field_id: assignment.field_id,
        reason: 'Protected or already populated field. Review manually.',
      });
      return false;
    }
    if (demoContext) fillOptions = { ...fillOptions, includeChange: true, forceChange: true };
    let result;
    if (demoContext && field.element instanceof HTMLSelectElement) {
      const matches = Array.from(field.element.options).filter(
        (option) => !option.disabled && option.value === String(assignment.value),
      );
      if (matches.length === 1) {
        setNativeValue(field.element, matches[0].value);
        dispatchValueEvents(field.element, true, true);
        result = { filled: true };
      } else result = { filled: false, reason: 'No unique exact option. Review manually.' };
    } else result = fillElement(field.element, assignment.value, field.type, fillOptions);
    if (
      result.filled &&
      demoContext &&
      normalizeText(field.element.value) !== normalizeText(assignment.value)
    ) {
      summary.skipped.push({
        field_id: assignment.field_id,
        reason: 'Read-back mismatch. Review this field.',
      });
      return false;
    }
    if (result.filled) {
      summary.filled.push({
        ...(demoContext
          ? { source_path: assignment.source_path, semantic_key: assignment.semantic_key }
          : {}),
        field_id: assignment?.field_id || assignment?.fieldId,
        confidence: Number(assignment?.confidence ?? 0),
        stagedGroup: fillOptions.stagedGroup || 'safe',
      });
      return true;
    }

    summary.skipped.push({
      field_id: assignment?.field_id || assignment?.fieldId,
      reason: result.reason || 'Unable to fill field.',
    });
    return false;
  };
  const fillableAssignments = [];

  assignments.forEach((assignment) => {
    const fieldId = assignment?.field_id || assignment?.fieldId;
    const confidence = Number(assignment?.confidence ?? 0);
    const field = byFieldId.get(fieldId);

    if (!field) {
      summary.skipped.push({ field_id: fieldId, reason: 'Field no longer exists on this page.' });
      return;
    }

    if (demoContext) {
      const element = field.element;
      const expected = assignment.target;
      const snapshotField = demoContext.fields.find((candidate) => candidate.id === fieldId);
      const currentIdentity = {
        type: field.type,
        name: normalizeText(element.getAttribute('name')),
        htmlId: normalizeText(element.getAttribute('id')),
        placeholder: normalizeText(element.getAttribute('placeholder')),
      };
      const unsafeText = [
        fieldLabel(element),
        currentIdentity.name,
        currentIdentity.htmlId,
        currentIdentity.placeholder,
        snapshotField?.nearbyText,
        snapshotField?.section,
      ]
        .join(' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[^a-z0-9]+/gi, ' ')
        .toLowerCase();
      const sensitive =
        /\b(ssn|social security|tax id|payment|card|bank|routing|account number|cvv|cvc|signature|sign here|consent|agree|agreement|acknowledgment|acknowledgement|attestation|attest|certify|certification|authorize|authorization|submit|bind|issue|purchase|captcha|password|mfa|security code|birth|dob|premium|coverage|deductible)\b/.test(
          unsafeText,
        );
      const changed =
        !expected ||
        !snapshotField ||
        window.location.href !== demoContext.href ||
        Object.entries(currentIdentity).some(([key, value]) => value !== (expected[key] || ''));
      const unsafe =
        sensitive ||
        !assignment.source_path ||
        ![
          'first_name',
          'last_name',
          'full_name',
          'email',
          'street',
          'city',
          'state',
          'zip',
          'county',
          'year_built',
          'square_feet',
          'bedrooms',
          'bathrooms',
        ].includes(assignment.semantic_key) ||
        !['string', 'number'].includes(typeof assignment.value) ||
        (typeof assignment.value === 'number' && !Number.isFinite(assignment.value)) ||
        normalizeText(assignment.value) === '' ||
        confidence !== 1 ||
        !['text', 'email', 'tel', 'number', 'textarea', 'select', 'select-one'].includes(
          field.type,
        ) ||
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        ) ||
        element.readOnly ||
        element.disabled ||
        normalizeText(element.value) !== '';
      if (changed || unsafe) {
        summary.skipped.push({
          field_id: fieldId,
          reason: changed
            ? 'Target changed. Read Page again.'
            : 'Protected, unsupported, or already populated field. Review manually.',
        });
        return;
      }
      if (element instanceof HTMLSelectElement) {
        const matches = Array.from(element.options).filter(
          (option) => !option.disabled && option.value === String(assignment.value),
        );
        if (matches.length !== 1 || normalizeText(assignment.value) === '') {
          summary.skipped.push({
            field_id: fieldId,
            reason: 'No unique exact option. Review manually.',
          });
          return;
        }
      }
    }

    if (confidence < MIN_CONFIDENCE_TO_FILL) {
      summary.lowConfidence.push({
        field_id: fieldId,
        confidence,
        reason: 'Confidence below fill threshold.',
      });
      return;
    }

    fillableAssignments.push({
      assignment,
      field,
      conditional: isConditionalField(field),
    });
  });

  const conditionalAssignments = fillableAssignments.filter((item) => item.conditional);
  for (let index = 0; index < conditionalAssignments.length; index += 1) {
    const item = conditionalAssignments[index];
    const beforeSignature = pageSignature();
    const didFill = fillAssignment(item.assignment, item.field, {
      includeChange: true,
      forceChange: true,
      stagedGroup: 'conditional',
    });

    if (!didFill) {
      continue;
    }

    await sleep(CONDITIONAL_CHANGE_SETTLE_MS);

    const afterSignature = pageSignature();
    if (afterSignature !== beforeSignature) {
      summary.paused = true;
      summary.pageChanged = true;
      summary.remaining = conditionalAssignments.length - index - 1;
      summary.message =
        'Carrier page changed after a conditional field. Review the page, then continue mapping.';
      break;
    }
  }

  if (!summary.paused) {
    fillableAssignments
      .filter((item) => !item.conditional)
      .forEach((item) => {
        fillAssignment(item.assignment, item.field, {
          includeChange: false,
          forceChange: false,
          stagedGroup: 'safe',
        });
      });
  }

  return summary;
}

async function fillActiveSmartMapTab(assignments, demoSnapshot = null) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!isValidTabId(tab?.id)) {
    throw new Error('No active carrier tab found.');
  }

  let demoContext = null;
  if (demoSnapshot) {
    if (
      !lastSmartMapReadTab ||
      lastSmartMapReadTab.id !== tab.id ||
      lastSmartMapReadTab.windowId !== tab.windowId ||
      tab.url !== demoSnapshot.href ||
      lastSmartMapReadTab.href !== demoSnapshot.href ||
      !Array.isArray(demoSnapshot.fields)
    ) {
      throw new Error('Page changed. Read Page again before using the demo fallback.');
    }
    const [freshResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectSmartMapSnapshot,
    });
    const fresh = freshResult?.result;
    const structure = (snapshot) =>
      JSON.stringify(
        snapshot?.fields?.map((field) => ({
          id: field.id,
          type: field.type,
          label: field.label,
          name: field.name,
          htmlId: field.htmlId,
          placeholder: field.placeholder,
          nearbyText: field.nearbyText,
          section: field.section,
          disabled: field.disabled,
          options: field.options,
        })),
      );
    if (
      !fresh ||
      fresh.href !== demoSnapshot.href ||
      structure(fresh) !== structure(demoSnapshot)
    ) {
      throw new Error('Page changed. Read Page again before using the demo fallback.');
    }
    demoContext = fresh;
  }
  let result;
  try {
    [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: applySmartMapAssignments,
      args: [assignments, demoContext],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/frame|reload|navigation|context|tab/i.test(message)) {
      return {
        filled: [],
        skipped: [],
        lowConfidence: [],
        staged: true,
        paused: true,
        pageChanged: true,
        remaining: 0,
        message: 'Carrier page refreshed during SmartMap. Review the page, then continue mapping.',
      };
    }

    throw error;
  }

  return result?.result;
}

async function prepareSidePanel(tabId) {
  if (!isValidTabId(tabId)) return;
  if (preparedTabs.has(tabId)) return;

  if (!chrome.sidePanel?.setOptions) {
    console.warn('Side Panel API not available to set options.');
    return;
  }

  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: true,
    });
    preparedTabs.add(tabId);
  } catch (error) {
    console.error('Failed to prepare side panel for tab', tabId, error);
  }
}

function openPanel(tabId, onOpened, onError) {
  if (!chrome.sidePanel?.open) {
    onError?.(new Error('Side Panel API is unavailable in this browser.'));
    return;
  }

  try {
    chrome.sidePanel
      .open({ tabId })
      .then(() => {
        onOpened?.();
      })
      .catch((error) => {
        onError?.(error);
      });
  } catch (error) {
    onError?.(error);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case 'MIA_PREPARE_PANEL': {
      const tabId = sender.tab?.id;
      if (isValidTabId(tabId)) {
        prepareSidePanel(tabId);
      }
      sendResponse?.({ ok: true });
      return false;
    }
    case 'MIA_OPEN_PANEL': {
      const tabId = sender.tab?.id;

      if (message.payload?.address) {
        lastAddress = message.payload.address;
      }

      if (!isValidTabId(tabId)) {
        sendResponse?.({ ok: false, error: 'Missing tab context' });
        return false;
      }

      if (!preparedTabs.has(tabId)) {
        prepareSidePanel(tabId);
      }

      openPanel(
        tabId,
        () => {
          if (lastAddress) {
            chrome.runtime
              .sendMessage({
                type: 'MIA_ADDRESS_UPDATE',
                payload: { address: lastAddress },
              })
              .catch(() => {
                /* Side panel might not be listening yet */
              });
          }
          sendResponse?.({ ok: true });
        },
        (error) => {
          console.error('Failed to handle MIA_OPEN_PANEL', error);
          sendResponse?.({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );

      return true;
    }
    case 'MIA_PANEL_READY': {
      sendResponse({ address: lastAddress });
      return true;
    }
    case 'MIA_REQUEST_ADDRESS': {
      sendResponse({ address: lastAddress });
      return true;
    }
    case 'MIA_UPDATE_BASE_URL': {
      if (message.payload?.baseUrl) {
        chrome.storage.sync.set({ miaBaseUrl: message.payload.baseUrl });
      }
      sendResponse({ ok: true });
      return true;
    }
    case 'MIA_SMART_MAP_AUTH_TOKEN': {
      const tabId = sender.tab?.id;
      storeSmartMapAuth(message.payload)
        .then((auth) => {
          closeSmartMapAuthTab(tabId);
          sendResponse({ ok: true, auth });
        })
        .catch((error) => {
          console.error('Failed to store SmartMap auth token', error);
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }
    case 'MIA_SMART_MAP_CLOSE_AUTH_TAB': {
      const tabId = sender.tab?.id;
      if (isValidTabId(tabId)) {
        chrome.tabs.remove(tabId).catch((error) => {
          console.warn('Failed to close SmartMap auth tab', error);
        });
      }
      sendResponse({ ok: true });
      return true;
    }
    case 'MIA_SMART_MAP_ANALYZE': {
      analyzeActiveSmartMapTab()
        .then((snapshot) => {
          sendResponse({ ok: true, snapshot });
        })
        .catch((error) => {
          console.error('Failed to analyze SmartMap page', error);
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }
    case 'MIA_SMART_MAP_FILL': {
      if (
        message.demoLocal &&
        (sender.id !== chrome.runtime.id ||
          sender.url?.split('?')[0] !== chrome.runtime.getURL('sidepanel.html') ||
          !message.snapshot)
      ) {
        sendResponse({
          ok: false,
          error: 'Read Page from the SmartMap panel before using the demo fallback.',
        });
        return false;
      }
      fillActiveSmartMapTab(
        Array.isArray(message.assignments) ? message.assignments : [],
        message.demoLocal ? message.snapshot : null,
      )
        .then((summary) => {
          sendResponse({ ok: true, summary });
        })
        .catch((error) => {
          console.error('Failed to fill SmartMap page', error);
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }
    default:
      break;
  }

  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined || tab.windowId === undefined) {
    return;
  }

  prepareSidePanel(tab.id);

  openPanel(
    tab.id,
    () => {
      if (lastAddress) {
        chrome.runtime
          .sendMessage({
            type: 'MIA_ADDRESS_UPDATE',
            payload: { address: lastAddress },
          })
          .catch(() => {
            /* Side panel might not be ready */
          });
      }
    },
    (error) => {
      console.error('Failed to open side panel from action', error);
    },
  );
});

chrome.tabs.onRemoved.addListener((tabId) => {
  preparedTabs.delete(tabId);
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const { miaBaseUrl } = await chrome.storage.sync.get({ miaBaseUrl: null });
    if (!miaBaseUrl || String(miaBaseUrl).replace(/\/+$/, '') === 'https://mia.agency') {
      await chrome.storage.sync.set({ miaBaseUrl: 'https://demo.mia.agency' });
    }
  } catch (error) {
    console.error('Failed to initialize default base URL', error);
  }
});
