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
  evaluateActiveTabAction,
  valueDigest,
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

  public clearMarkers(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private controls(): PageControl[] {
    const candidates = Array.from(
      document.querySelectorAll(
        'input,textarea,select,button,[role="combobox"],[role="listbox"],[role="option"],[role="checkbox"],[role="radio"],[role="tab"],[role="button"]',
      ),
    )
      .filter(visible)
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
        disabled:
          element.matches(':disabled,[aria-disabled="true"],[readonly]') ||
          element.closest('[inert]') !== null,
        humanOnly:
          element instanceof HTMLAnchorElement ||
          !!element.closest('[data-smartmapper-human-only]'),
        options: options.slice(0, 300),
        errors,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
      control.humanOnly = controlIsHumanOnly(control);
      return control;
    });
  }

  public async observe(tabId: number, markers = false): Promise<PageObservation> {
    this.clearMarkers();
    const controls = this.controls();
    for (const control of controls) {
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
    }
    const authenticationRequired =
      controls.some((control) => control.inputType === 'password') ||
      !!document.querySelector(
        'iframe[src*="recaptcha"],iframe[src*="hcaptcha"],input[autocomplete="one-time-code"]',
      ) ||
      /\b(sign in|log in|verify your identity|multi.factor authentication)\b/i.test(
        clean(document.querySelector('h1')?.textContent),
      );
    const page: PageObservation = {
      version: '2.0',
      tabId,
      origin: location.origin,
      pageStateId: crypto.randomUUID(),
      documentId: this.documentId,
      routeId: await valueDigest(location.pathname + location.hash),
      fingerprint: await valueDigest(
        JSON.stringify({
          controls,
          scrollX,
          scrollY,
          height: document.documentElement.scrollHeight,
        }),
      ),
      title: clean(document.title),
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
      screenshot: null,
    };
    this.last = page;
    if (markers && !authenticationRequired) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
      for (const control of controls) {
        if (control.rect.y < 0 || control.rect.y > innerHeight) continue;
        const marker = document.createElement('span');
        marker.textContent = control.elementId;
        marker.style.cssText = `position:absolute;left:${Math.max(0, control.rect.x)}px;top:${Math.max(0, control.rect.y)}px;background:#102b63;color:white;font:10px monospace;padding:1px 3px;`;
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
    if (previous.fingerprint !== current.fingerprint || previous.routeId !== current.routeId)
      return fail('page_changed');
    current.pageStateId = previous.pageStateId;
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
      if (
        action.type === 'fill' &&
        (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
      ) {
        element.focus();
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
        (await valueDigest(location.pathname + location.hash)) !== current.routeId
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
