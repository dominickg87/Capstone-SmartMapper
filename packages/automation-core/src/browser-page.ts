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
      element.getAttribute('placeholder') ||
      element.getAttribute('title'),
  );
}

export class BrowserPageSession {
  private readonly documentId = crypto.randomUUID();
  private readonly elements = new Map<string, HTMLElement>();
  private last: PageObservation | null = null;
  private readonly completed = new Set<string>();
  private overlay: HTMLElement | null = null;
  private omittedControls = 0;
  private unexpanded = 0;

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
      const elementId = 'e' + index;
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
      const inputType = native || element instanceof HTMLButtonElement ? element.type : '';
      const role =
        element.getAttribute('role') ||
        (tag === 'select' ? 'combobox' : tag === 'button' ? 'button' : 'textbox');
      const scope = element.closest('fieldset,[role="group"],[role="radiogroup"],section,article');
      const section = clean(
        scope?.querySelector('legend,h1,h2,h3,h4,[role="heading"]')?.textContent ||
          (scope ? fromIds(scope, 'aria-labelledby') : ''),
      );
      const context = [
        clean(fromIds(element, 'aria-describedby')),
        clean(element.closest('[role="radiogroup"]')?.getAttribute('aria-label')),
      ].filter(Boolean);
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
        options: options.slice(0, 300),
        errors,
        rect: { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height },
      };
      control.humanOnly = controlIsHumanOnly(control);
      return control;
    });
  }

  public async observe(tabId: number, markers = false): Promise<PageObservation> {
    this.clearMarkers();
    const controls = this.controls();
    await Promise.all(
      controls.map(async (control) => {
        const element = this.elements.get(control.elementId);
        control.key = await valueDigest(
          [
            control.section,
            control.label,
            element?.getAttribute('name') ?? '',
            element?.id ?? '',
            control.elementId,
          ].join('|'),
        );
      }),
    );
    const authenticationRequired =
      controls.some((control) => control.inputType === 'password') ||
      !!document.querySelector(
        'iframe[src*="recaptcha"],iframe[src*="hcaptcha"],input[autocomplete="one-time-code"]',
      ) ||
      /\b(sign in|log in|verify your identity|multi.factor authentication)\b/i.test(
        clean(document.querySelector('h1')?.textContent),
      );
    const textFingerprint = await valueDigest(clean(document.body.innerText, 200_000));
    const page: PageObservation = {
      version: '2.0',
      tabId,
      origin: location.origin,
      pageStateId: crypto.randomUUID(),
      documentId: this.documentId,
      routeId: await valueDigest(location.pathname + location.search + location.hash),
      textFingerprint,
      fingerprint: await valueDigest(
        JSON.stringify({
          controls,
          textFingerprint,
          height: document.documentElement.scrollHeight,
        }),
      ),
      title: clean(document.title),
      pageText: clean(document.body.innerText, 40_000),
      headings: Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]'))
        .filter(visible)
        .map((element) => clean(element.textContent))
        .slice(0, 30),
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
      screenshot: null,
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
    const current = await this.observe(previous.tabId);
    const originalElements = new Map(this.elements);
    if (previous.fingerprint !== current.fingerprint || previous.routeId !== current.routeId)
      return fail('page_changed');
    current.pageStateId = previous.pageStateId;
    if (previous.capture) current.capture = previous.capture;
    const policy = evaluateActiveTabAction(action, current, {
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
    const element = action.elementId ? this.elements.get(action.elementId) : undefined;
    if (action.elementId && (!element || !element.isConnected)) return fail('control_missing');
    this.completed.add(batch.batchId);
    const expected = actionExpectedValue(action);
    const read = (): string | boolean | null => {
      if (action.type === 'check' && element instanceof HTMLInputElement) return element.checked;
      if (
        (action.type === 'fill' || action.type === 'select') &&
        (element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement)
      )
        return element.value;
      if (action.purpose === 'select_option' && element?.getAttribute('aria-selected') === 'true')
        return (
          element.getAttribute('data-value') ??
          element.getAttribute('value') ??
          clean(element.textContent)
        );
      return null;
    };
    const before = read();
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
          if (document.visibilityState !== 'visible' || !element.isConnected) return;
          const fresh = await this.observe(previous.tabId);
          fresh.pageStateId = current.pageStateId;
          if (current.capture) fresh.capture = current.capture;
          if (
            fresh.fingerprint !== current.fingerprint ||
            !this.nextElementAllowed(element) ||
            ((element instanceof HTMLButtonElement || element instanceof HTMLInputElement) &&
              element.form &&
              !element.form.checkValidity())
          )
            return;
          const finalPolicy = evaluateActiveTabAction(action, fresh, {
            version: '2.0',
            tenantId: 'local',
            userId: 'local',
            quoteId: 'local',
            formType: 'local',
            revision: 'local',
            answers: [],
            unavailablePaths: [],
          });
          this.last = null;
          if (finalPolicy.allowed) element.click();
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
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (
        location.origin !== current.origin ||
        (await valueDigest(location.pathname + location.search + location.hash)) !== current.routeId
      )
        return fail('page_changed');
      if (expected === null)
        return {
          actionId: action.actionId,
          status: 'executed',
          reason: 'applied',
          observedHash: null,
        };
      const observed = read();
      const native =
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement;
      const invalid =
        element?.getAttribute('aria-invalid') === 'true' || (native && !element.validity.valid);
      const matches =
        !!element?.isConnected &&
        observed !== null &&
        canonicalValue(observed) === canonicalValue(expected) &&
        !invalid;
      // Carry the original plan forward only across the expected value change. Any layout,
      // label, option, other answer, node replacement or navigation invalidates the remainder.
      if (matches && action.elementId && ['fill', 'select', 'check'].includes(action.type)) {
        const next = await this.observe(previous.tabId);
        const sameElements =
          originalElements.size === this.elements.size &&
          [...originalElements].every(([id, original]) => this.elements.get(id) === original);
        if (sameElements && unchangedAfterEntry(current, next, action.elementId)) {
          next.pageStateId = previous.pageStateId;
          if (previous.capture) next.capture = previous.capture;
          this.last = next;
        } else this.last = null;
      } else this.last = null;
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
