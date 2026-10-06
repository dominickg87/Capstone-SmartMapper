import {
  ActionBatchSchema,
  type ActionBatch,
  type ActionReceipt,
  type PageControl,
  type PageObservation,
} from '@smartmapper/contracts';
import {
  actionExpectedValue,
  canonicalValue,
  controlIsHumanOnly,
  humanActionPattern,
  ordinaryNextLabel,
  commitmentPattern,
  evaluateActiveTabAction,
  semanticControlSet,
  targetValueUnchangedOrExpected,
  valueDigest,
  unchangedAfterEntry,
} from './active-tab.js';

const clean = (value: string | null | undefined, limit = 2000): string =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
const visible = (element: Element): element is HTMLElement =>
  element instanceof HTMLElement &&
  element.getClientRects().length > 0 &&
  getComputedStyle(element).visibility !== 'hidden' &&
  getComputedStyle(element).display !== 'none';
const fromIds = (element: Element, name: string): string =>
  (element.getAttribute(name) ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');

export function boundedNearbyTextCue(value: string | null | undefined): string {
  const cue = clean(value, 500)
    .replace(/[\s:*]+$/g, '')
    .trim();
  if (!cue || cue.length > 120 || cue.split(/\s+/).length > 16 || !/[\p{L}\p{N}]/u.test(cue))
    return '';
  return cue;
}

const routeEnumKeys = new Set(['step', 'page', 'section', 'tab', 'screen', 'view']);
function normalizedRouteSegment(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    /* Keep malformed carrier text bounded and opaque. */
  }
  if (/^[0-9]{4,}$/.test(decoded)) return ':id';
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded)) return ':id';
  if (
    decoded.length >= 8 &&
    /^[A-Za-z0-9_-]+$/.test(decoded) &&
    /[A-Za-z]/.test(decoded) &&
    /[0-9]/.test(decoded)
  )
    return ':token';
  return encodeURIComponent(decoded).replaceAll('%3A', ':');
}

function normalizedRouteParameters(value: string): string {
  const parameters = new URLSearchParams(value.replace(/^[?#]/, ''));
  return [...parameters.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      `${leftKey}\0${leftValue}`.localeCompare(`${rightKey}\0${rightValue}`),
    )
    .map(([key, item]) => {
      const safeEnum =
        routeEnumKeys.has(key.toLowerCase()) &&
        (/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(item) || /^\d{1,2}$/.test(item));
      return `${encodeURIComponent(key)}=${safeEnum ? encodeURIComponent(item) : ':value'}`;
    })
    .join('&');
}

export function privacySafeRouteSeed(pathname: string, search: string, hash: string): string {
  const path = pathname.split('/').map(normalizedRouteSegment).join('/');
  const query = normalizedRouteParameters(search);
  const rawHash = hash.replace(/^#/, '');
  const normalizedHash = rawHash.includes('=')
    ? normalizedRouteParameters(rawHash)
    : rawHash.split('/').map(normalizedRouteSegment).join('/');
  return `${path}${query ? `?${query}` : ''}${normalizedHash ? `#${normalizedHash}` : ''}`;
}

function nearbyPrecedingTextCue(element: HTMLElement): string {
  const permitted = new Set(['LABEL', 'SPAN', 'STRONG', 'B', 'EM', 'SMALL', 'DT', 'TH', 'LEGEND']);
  let sibling: ChildNode | null = element.previousSibling;
  for (
    let inspected = 0;
    sibling && inspected < 4;
    inspected++, sibling = sibling.previousSibling
  ) {
    if (sibling.nodeType === Node.TEXT_NODE) {
      const cue = boundedNearbyTextCue(sibling.textContent);
      if (cue) return cue;
      continue;
    }
    if (!(sibling instanceof HTMLElement)) continue;
    if (sibling.matches('input,textarea,select,button,a,[role="button"],[role="option"]')) break;
    if (
      !visible(sibling) ||
      !permitted.has(sibling.tagName) ||
      sibling.matches(
        '[role="alert"],[aria-live],.error,.invalid-feedback,[data-valmsg-for],[class*="error" i],[class*="invalid" i]',
      ) ||
      sibling.querySelector('input,textarea,select,button,a,[role="button"],[role="option"]')
    )
      continue;
    const cue = boundedNearbyTextCue(sibling.textContent);
    if (cue) return cue;
  }
  return '';
}

function label(element: HTMLElement): string {
  const native =
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement;
  return clean(
    element.getAttribute('aria-label') ||
      fromIds(element, 'aria-labelledby') ||
      (native
        ? Array.from(element.labels ?? [])
            .map((item) => item.textContent)
            .join(' ')
        : element.textContent) ||
      (element instanceof HTMLInputElement && ['button', 'submit'].includes(element.type)
        ? element.value
        : '') ||
      (native ? nearbyPrecedingTextCue(element) : '') ||
      element.getAttribute('placeholder') ||
      element.getAttribute('title'),
  );
}

function semanticLocatorSeed(control: PageControl, element: HTMLElement | undefined): string {
  return JSON.stringify({
    section: control.section,
    label: control.label,
    tag: control.tag,
    inputType: control.inputType,
    role: control.role,
    name: clean(element?.getAttribute('name')),
    id: clean(element?.id),
    autocomplete: clean(element?.getAttribute('autocomplete')),
    ariaControls: clean(element?.getAttribute('aria-controls')),
    choiceGroup: control.choiceGroup ?? null,
  });
}

export class BrowserPageSession {
  private readonly documentId = crypto.randomUUID();
  private readonly elements = new Map<string, HTMLElement>();
  private last: PageObservation | null = null;
  private readonly completed = new Set<string>();
  private overlay: HTMLElement | null = null;
  private omittedControls = 0;
  private unexpanded = 0;
  private nextElementId = 0;

  public async prepareSurvey(tabId: number): Promise<PageObservation> {
    this.clearMarkers();
    const before = await this.observe(tabId);
    if (before.authenticationRequired || document.visibilityState !== 'visible') return before;
    // Open genuine disclosure controls, never arbitrary buttons or answer choices.
    for (let i = 0; i < 30; i++) {
      const details = Array.from(document.querySelectorAll('details:not([open])')).find(
        (element) =>
          visible(element) &&
          !element.closest('[data-smartmapper-human-only],[inert]') &&
          !humanActionPattern.test(element.querySelector('summary')?.textContent ?? ''),
      );
      if (details instanceof HTMLDetailsElement) {
        details.open = true;
        continue;
      }
      const disclosure = Array.from(
        document.querySelectorAll('button[type="button"][aria-expanded="false"][aria-controls]'),
      ).find(
        (element) =>
          visible(element) &&
          !element.matches(':disabled,[aria-disabled="true"]') &&
          !element.closest('[data-smartmapper-human-only],[inert]') &&
          !humanActionPattern.test(label(element)) &&
          !!document.getElementById(element.getAttribute('aria-controls') ?? ''),
      );
      if (!(disclosure instanceof HTMLButtonElement)) break;
      disclosure.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (disclosure.getAttribute('aria-expanded') !== 'true') break;
    }
    this.unexpanded = Array.from(
      document.querySelectorAll('details:not([open]),button[aria-expanded="false"][aria-controls]'),
    ).filter(visible).length;
    return this.surveyPosition(tabId, 0, 0);
  }

  public async surveyPosition(tabId: number, x: number, y: number): Promise<PageObservation> {
    if (document.visibilityState !== 'visible') throw new Error('tab_hidden');
    this.clearMarkers();
    window.scrollTo({ left: x, top: y, behavior: 'instant' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return this.observe(tabId, true);
  }

  public async finishSurvey(
    tabId: number,
    complete: boolean,
    targeted = false,
  ): Promise<PageObservation> {
    const page = await this.surveyPosition(tabId, 0, 0);
    page.capture = {
      complete,
      unexpanded: this.unexpanded,
      ...(targeted ? { mode: 'targeted' as const } : {}),
    };
    this.clearMarkers();
    this.last = page;
    return page;
  }

  private nextElementAllowed(element: HTMLElement): boolean {
    if (!ordinaryNextLabel(label(element)) || element.closest('[data-smartmapper-human-only]'))
      return false;
    if (commitmentPattern.test(fromIds(element, 'aria-describedby'))) return false;
    if (element instanceof HTMLAnchorElement)
      return (
        !!element.getAttribute('href') &&
        !element.download &&
        (!element.target || element.target === '_self') &&
        new URL(element.href, location.href).origin === location.origin &&
        !element.href.startsWith('javascript:')
      );
    if (
      !(element instanceof HTMLButtonElement || element instanceof HTMLInputElement) ||
      !['button', 'submit'].includes(element.type)
    )
      return false;
    if (
      element.form &&
      ((element.form.target && element.form.target !== '_self') ||
        new URL(
          element.getAttribute('formaction') || element.form.action || location.href,
          location.href,
        ).origin !== location.origin)
    )
      return false;
    return !element.formTarget || element.formTarget === '_self';
  }

  public clearMarkers(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private controls(): PageControl[] {
    const candidates = Array.from(
      document.querySelectorAll(
        'input,textarea,select,button,a,[role="combobox"],[role="listbox"],[role="option"],[role="checkbox"],[role="radio"],[role="tab"],[role="button"]',
      ),
    )
      .filter(visible)
      .filter(
        (element) => !(element instanceof HTMLAnchorElement) || ordinaryNextLabel(label(element)),
      )
      .filter((element) => !this.overlay?.contains(element));
    this.elements.clear();
    this.omittedControls =
      Math.max(0, candidates.length - 400) +
      Array.from(document.querySelectorAll('*')).filter(
        (element) =>
          visible(element) && (element.shadowRoot !== null || element.tagName.includes('-')),
      ).length;
    return candidates.slice(0, 400).map((element, index) => {
      const elementId = 'pending' + index;
      this.elements.set(elementId, element);
      const native =
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement;
      const tag: PageControl['tag'] =
        element instanceof HTMLInputElement
          ? 'input'
          : element instanceof HTMLSelectElement
            ? 'select'
            : element instanceof HTMLTextAreaElement
              ? 'textarea'
              : element instanceof HTMLButtonElement
                ? 'button'
                : 'custom';
      const nativeInputType = native || element instanceof HTMLButtonElement ? element.type : '';
      const role =
        element.getAttribute('role') ||
        (tag === 'select' ? 'combobox' : tag === 'button' ? 'button' : 'textbox');
      const inputType = ['radio', 'checkbox'].includes(role) ? role : nativeInputType;
      const scope = element.closest('fieldset,[role="group"],[role="radiogroup"],section,article');
      const section = clean(
        scope?.querySelector('legend,h1,h2,h3,h4,[role="heading"]')?.textContent ||
          (scope ? fromIds(scope, 'aria-labelledby') : ''),
      );
      const context = [
        clean(fromIds(element, 'aria-describedby')),
        clean(element.closest('[role="radiogroup"]')?.getAttribute('aria-label')),
      ].filter(Boolean);
      const choiceGroup =
        ['radio'].includes(inputType) || role === 'radio'
          ? (() => {
              const group = element.closest('fieldset,[role="radiogroup"],[role="group"]');
              const groupLabel = clean(
                group?.querySelector('legend')?.textContent ||
                  group?.getAttribute('aria-label') ||
                  (group ? fromIds(group, 'aria-labelledby') : '') ||
                  context[0] ||
                  section,
              );
              const groupName = clean(element.getAttribute('name'));
              const key = clean(groupName || groupLabel, 160);
              return key ? { key, label: groupLabel || key } : null;
            })()
          : null;
      const options =
        element instanceof HTMLSelectElement
          ? Array.from(element.options)
              .filter((option) => !option.disabled)
              .map((option) => ({ value: option.value, label: clean(option.label) }))
          : [];
      const rect = element.getBoundingClientRect();
      const value = native
        ? element.value
        : (element.getAttribute('data-value') ??
          element.getAttribute('value') ??
          (role === 'option' ? clean(element.textContent) : ''));
      const errors =
        element.getAttribute('aria-invalid') === 'true'
          ? [clean(fromIds(element, 'aria-errormessage')) || 'Validation error']
          : native && element.validity && !element.validity.valid && element.value
            ? [clean(element.validationMessage)]
            : [];
      const control: PageControl = {
        elementId,
        key: '',
        tag,
        inputType,
        role,
        label: label(element),
        section,
        context,
        value: clean(value, 8000),
        checked:
          element instanceof HTMLInputElement
            ? element.checked
            : element.getAttribute('aria-checked') === 'true',
        required: native ? element.required : element.getAttribute('aria-required') === 'true',
        requiredSatisfied: native ? !element.validity.valueMissing : undefined,
        disabled:
          element.matches(':disabled,[aria-disabled="true"],[readonly]') ||
          element.closest('[inert]') !== null,
        humanOnly:
          element instanceof HTMLAnchorElement ||
          !!element.closest('[data-smartmapper-human-only]'),
        ordinaryNext: this.nextElementAllowed(element),
        choiceGroup,
        options: options.slice(0, 300),
        errors,
        rect: { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height },
      };
      control.humanOnly = controlIsHumanOnly(control);
      return control;
    });
  }

  private bindStableElementIds(
    controls: PageControl[],
    candidateElements: ReadonlyMap<string, HTMLElement>,
  ): void {
    const previousByKey = new Map<string, PageControl[]>();
    for (const control of this.last?.controls ?? []) {
      const matches = previousByKey.get(control.key) ?? [];
      matches.push(control);
      previousByKey.set(control.key, matches);
    }
    const rebound = new Map<string, HTMLElement>();
    const used = new Set<string>();
    for (const control of controls) {
      const temporaryId = control.elementId;
      const previous = (previousByKey.get(control.key) ?? []).find(
        (candidate) => !used.has(candidate.elementId),
      );
      let stableId = previous?.elementId;
      if (!stableId) {
        do stableId = `e${this.nextElementId++}`;
        while (used.has(stableId));
      }
      control.elementId = stableId;
      used.add(stableId);
      const element = candidateElements.get(temporaryId);
      if (element) rebound.set(stableId, element);
    }
    this.elements.clear();
    for (const [elementId, element] of rebound) this.elements.set(elementId, element);
  }

  public async observe(tabId: number, markers = false): Promise<PageObservation> {
    this.clearMarkers();
    const controls = this.controls();
    const candidateElements = new Map(this.elements);
    await Promise.all(
      controls.map(async (control) => {
        const element = candidateElements.get(control.elementId);
        control.key = await valueDigest(semanticLocatorSeed(control, element));
      }),
    );
    this.bindStableElementIds(controls, candidateElements);
    const authenticationRequired =
      controls.some((control) => control.inputType === 'password') ||
      !!document.querySelector(
        'iframe[src*="recaptcha"],iframe[src*="hcaptcha"],input[autocomplete="one-time-code"]',
      ) ||
      /\b(sign in|log in|verify your identity|multi.factor authentication)\b/i.test(
        clean(document.querySelector('h1')?.textContent),
      );
    const textFingerprint = await valueDigest(clean(document.body.innerText, 200_000));
    const routeId = await valueDigest(
      privacySafeRouteSeed(location.pathname, location.search, location.hash),
    );
    const title = clean(document.title);
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
      .filter(visible)
      .map((element) => clean(element.textContent))
      .slice(0, 30);
    const page: PageObservation = {
      version: '2.0',
      tabId,
      origin: location.origin,
      pageStateId: crypto.randomUUID(),
      documentId: this.documentId,
      routeId,
      textFingerprint,
      fingerprint: await valueDigest(
        JSON.stringify({
          routeId,
          title,
          headings,
          controls: semanticControlSet(controls),
          authenticationRequired,
          unsupportedFrames: Array.from(document.querySelectorAll('iframe')).filter(visible).length,
          omittedControls: this.omittedControls,
        }),
      ),
      title,
      pageText: clean(document.body.innerText, 40_000),
      headings,
      controls,
      errors: Array.from(document.querySelectorAll('[role="alert"],.error,.invalid-feedback'))
        .filter(visible)
        .map((element) => clean(element.textContent))
        .filter(Boolean)
        .slice(0, 30),
      authenticationRequired,
      unsupportedFrames: Array.from(document.querySelectorAll('iframe')).filter(visible).length,
      omittedControls: this.omittedControls,
      capturedAt: new Date().toISOString(),
      viewport: { width: innerWidth, height: innerHeight },
      coordinates: 'document',
      scroll: {
        x: scrollX,
        y: scrollY,
        width: Math.max(innerWidth, document.documentElement.scrollWidth),
        height: Math.max(innerHeight, document.documentElement.scrollHeight),
      },
    };
    this.last = page;
    if (markers && !authenticationRequired) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
      for (const control of controls) {
        if (control.rect.y < scrollY || control.rect.y > scrollY + innerHeight) continue;
        const marker = document.createElement('span');
        marker.textContent = control.elementId;
        marker.style.cssText = `position:absolute;left:${Math.max(0, control.rect.x - scrollX)}px;top:${Math.max(0, control.rect.y - scrollY)}px;background:#102b63;color:white;font:10px monospace;padding:1px 3px;`;
        overlay.append(marker);
      }
      document.documentElement.append(overlay);
      this.overlay = overlay;
    }
    return page;
  }

  private resolveControl(
    reference: PageControl | undefined,
    controls: PageControl[],
  ): PageControl | undefined {
    if (!reference) return undefined;
    const semanticMatches = controls.filter((control) => control.key === reference.key);
    if (semanticMatches.length === 1) return semanticMatches[0];
    return semanticMatches.find((control) => control.elementId === reference.elementId);
  }

  private readControl(
    action: ActionBatch['action'],
    control: PageControl | undefined,
    element: HTMLElement | undefined,
  ): string | boolean | null {
    if (action.type === 'check')
      return element instanceof HTMLInputElement ? element.checked : (control?.checked ?? null);
    if (action.type === 'fill' || action.type === 'select')
      return element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
        ? element.value
        : (control?.value ?? null);
    if (action.purpose === 'select_option' && element?.getAttribute('aria-selected') === 'true')
      return (
        element.getAttribute('data-value') ??
        element.getAttribute('value') ??
        clean(element.textContent)
      );
    return null;
  }

  private async settleAfterEntry(
    tabId: number,
    baseline: PageObservation,
    target: PageControl,
    action: ActionBatch['action'],
  ): Promise<PageObservation> {
    const deadline = Date.now() + 600;
    let lastState = '';
    let stableSamples = 0;
    let latest: PageObservation | undefined;
    do {
      await new Promise((resolve) => setTimeout(resolve, 40));
      latest = await this.observe(tabId);
      const control = this.resolveControl(target, latest.controls);
      const element = control ? this.elements.get(control.elementId) : undefined;
      const native =
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement;
      const state = JSON.stringify({
        samePage: unchangedAfterEntry(baseline, latest, target.elementId),
        targetKey: control?.key ?? null,
        value: this.readControl(action, control, element),
        errors: control?.errors ?? [],
        ariaInvalid: element?.getAttribute('aria-invalid') === 'true',
        valid: native ? element.validity.valid : true,
      });
      stableSamples = state === lastState ? stableSamples + 1 : 0;
      lastState = state;
      if (stableSamples >= 2) break;
    } while (Date.now() < deadline);
    return latest ?? baseline;
  }

  private preservePageState(previous: PageObservation, current: PageObservation): void {
    current.pageStateId = previous.pageStateId;
    if (previous.capture) current.capture = previous.capture;
    this.last = current;
  }

  public async execute(input: ActionBatch): Promise<ActionReceipt> {
    const batch = ActionBatchSchema.parse(input);
    const action = batch.action;
    const fail = (reason: ActionReceipt['reason']): ActionReceipt => ({
      actionId: action.actionId,
      status: 'blocked',
      reason,
      observedHash: null,
    });
    if (this.completed.has(batch.batchId)) return fail('interrupted');
    const previous = this.last;
    if (
      !previous ||
      previous.pageStateId !== action.pageStateId ||
      document.visibilityState !== 'visible'
    )
      return fail('page_changed');
    const previousControl = action.elementId
      ? previous.controls.find((control) => control.elementId === action.elementId)
      : undefined;
    const current = await this.observe(previous.tabId);
    if (!unchangedAfterEntry(previous, current, action.elementId ?? ''))
      return fail('page_changed');
    this.preservePageState(previous, current);
    const currentControl = this.resolveControl(previousControl, current.controls);
    if (action.elementId && !currentControl) return fail('control_missing');
    const effectiveAction = currentControl
      ? { ...action, elementId: currentControl.elementId }
      : action;
    const policy = evaluateActiveTabAction(effectiveAction, current, {
      version: '2.0',
      tenantId: 'local',
      userId: 'local',
      quoteId: 'local',
      formType: 'local',
      revision: 'local',
      answers: batch.sources,
      unavailablePaths: [],
    });
    if (!policy.allowed) return fail('policy_blocked');
    const element = currentControl ? this.elements.get(currentControl.elementId) : undefined;
    if (action.elementId && (!element || !element.isConnected)) return fail('control_missing');
    const expected = actionExpectedValue(action);
    const before = this.readControl(action, currentControl, element);
    const lastObserved = this.readControl(action, previousControl, undefined);
    if (
      ['fill', 'select', 'check'].includes(action.type) &&
      !targetValueUnchangedOrExpected(lastObserved, before, expected)
    ) {
      this.last = null;
      return fail('page_changed');
    }
    this.completed.add(batch.batchId);
    if (
      expected !== null &&
      before !== null &&
      canonicalValue(before) === canonicalValue(expected) &&
      !policy.control?.errors.length
    ) {
      return {
        actionId: action.actionId,
        status: 'already_correct',
        reason: 'matched',
        observedHash: await valueDigest(before),
      };
    }
    try {
      if (action.type === 'next_page') {
        if (
          !element ||
          !this.nextElementAllowed(element) ||
          ((element instanceof HTMLButtonElement || element instanceof HTMLInputElement) &&
            element.form &&
            !element.form.checkValidity())
        )
          return fail('policy_blocked');
        this.last = null;
        // A document navigation destroys this message channel. Acknowledge dispatch, then
        // let the extension verify that a new page actually appears before mapping again.
        const navigate = async () => {
          if (document.visibilityState !== 'visible') return;
          const fresh = await this.observe(previous.tabId);
          const freshControl = this.resolveControl(currentControl, fresh.controls);
          const freshElement = freshControl ? this.elements.get(freshControl.elementId) : undefined;
          if (
            !freshControl ||
            !freshElement?.isConnected ||
            !unchangedAfterEntry(current, fresh, currentControl?.elementId ?? '') ||
            !this.nextElementAllowed(freshElement) ||
            ((freshElement instanceof HTMLButtonElement ||
              freshElement instanceof HTMLInputElement) &&
              freshElement.form &&
              !freshElement.form.checkValidity())
          )
            return;
          this.preservePageState(current, fresh);
          const finalPolicy = evaluateActiveTabAction(
            { ...action, elementId: freshControl.elementId },
            fresh,
            {
              version: '2.0',
              tenantId: 'local',
              userId: 'local',
              quoteId: 'local',
              formType: 'local',
              revision: 'local',
              answers: [],
              unavailablePaths: [],
            },
          );
          this.last = null;
          if (finalPolicy.allowed) freshElement.click();
        };
        setTimeout(() => {
          void navigate().catch(() => undefined);
        }, 50);
        return {
          actionId: action.actionId,
          status: 'executed',
          reason: 'applied',
          observedHash: null,
        };
      }
      if (
        action.type === 'fill' &&
        (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
      ) {
        element.focus({ preventScroll: true });
        const prototype =
          element instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, action.value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.blur();
      } else if (action.type === 'select' && element instanceof HTMLSelectElement) {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(
          element,
          action.value,
        );
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action.type === 'check' && element instanceof HTMLInputElement) {
        if (element.checked !== action.checked) element.click();
      } else if (
        action.type === 'check' &&
        element &&
        ['radio', 'checkbox'].includes(element.getAttribute('role') ?? '')
      ) {
        if ((element.getAttribute('aria-checked') === 'true') !== action.checked) element.click();
      } else if (action.type === 'click' && element) element.click();
      else if (action.type === 'key' && element && action.key) {
        element.dispatchEvent(new KeyboardEvent('keydown', { key: action.key, bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { key: action.key, bubbles: true }));
      } else if (action.type === 'scroll')
        window.scrollBy({
          top: (action.direction === 'down' ? 1 : -1) * innerHeight * 0.75,
          behavior: 'instant',
        });
      else if (action.type === 'wait')
        await new Promise((resolve) => setTimeout(resolve, action.milliseconds ?? 100));
      if (
        location.origin !== current.origin ||
        (await valueDigest(
          privacySafeRouteSeed(location.pathname, location.search, location.hash),
        )) !== current.routeId
      )
        return fail('page_changed');
      if (expected === null)
        return {
          actionId: action.actionId,
          status: 'executed',
          reason: 'applied',
          observedHash: null,
        };
      const originalObserved = this.readControl(action, currentControl, element);
      const next = currentControl
        ? await this.settleAfterEntry(previous.tabId, current, currentControl, action)
        : await this.observe(previous.tabId);
      const stable =
        !!currentControl &&
        ['fill', 'select', 'check'].includes(action.type) &&
        unchangedAfterEntry(current, next, currentControl.elementId);
      if (next.origin !== current.origin || next.routeId !== current.routeId)
        return fail('page_changed');
      if (stable) this.preservePageState(previous, next);

      // Controlled carrier forms often replace an input node on change or blur. When the
      // route is stable, relocate by its key and read the replacement rather than a detached
      // node. A target-specific mismatch does not invalidate siblings on a stable semantic page.
      const freshControl = this.resolveControl(currentControl, next.controls);
      const rebound = freshControl ? this.elements.get(freshControl.elementId) : undefined;
      const observed = freshControl
        ? this.readControl(action, freshControl, rebound)
        : originalObserved;
      const native =
        rebound instanceof HTMLInputElement ||
        rebound instanceof HTMLSelectElement ||
        rebound instanceof HTMLTextAreaElement;
      const invalid = freshControl
        ? !!freshControl?.errors.length ||
          rebound?.getAttribute('aria-invalid') === 'true' ||
          (native && !rebound.validity.valid)
        : element?.getAttribute('aria-invalid') === 'true' ||
          ((element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement) &&
            !element.validity.valid);
      const matches =
        (freshControl ? !!rebound?.isConnected : !!element?.isConnected) &&
        observed !== null &&
        canonicalValue(observed) === canonicalValue(expected) &&
        !invalid;
      return {
        actionId: action.actionId,
        status: matches ? 'verified' : 'failed',
        reason: invalid ? 'validation_error' : matches ? 'matched' : 'read_back_mismatch',
        observedHash: observed === null ? null : await valueDigest(observed),
      };
    } catch {
      return fail('interrupted');
    }
  }
}
