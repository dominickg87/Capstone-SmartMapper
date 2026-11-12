import type { ReadPageData, ReadPageField } from '@smartmapper/contracts';

/** Self-contained for isolated-world injection. Only its optional marker layer writes to the DOM. */
export function readPageFields(annotate = false): ReadPageData {
  type ReaderState = {
    identities: WeakMap<Element, { signature: string; key: string }>;
    cleanup?: () => void;
  };
  const readerWindow = window as Window & { __smartmapperReader?: ReaderState };
  const state = (readerWindow.__smartmapperReader ??= { identities: new WeakMap() });
  const newKey = (): string => {
    // getRandomValues is also available on ordinary HTTP pages, unlike randomUUID.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  if (annotate) state.cleanup?.();
  const result: ReadPageData = {
    pageOrigin: location.origin,
    fields: [],
    inaccessibleFrames: 0,
    unreadableControls: 0,
    truncated: false,
  };
  const candidates: Array<{ element: Element; frame: number }> = [];
  const anchors = new Map<ReadPageField, Element[]>();
  const seenRoots = new Set<Document | ShadowRoot>();
  let visited = 0;
  let frameNumber = 0;
  let remainingChoices = 10_000;
  const selector =
    'input,select,textarea,button,[role="combobox"],[role="listbox"],[role="radiogroup"],[role="radio"],[role="checkbox"],[role="switch"],[role="textbox"],[role="spinbutton"],[role="slider"],[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]';
  const clean = (value: string | null | undefined, limit = 500): string =>
    (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  const text = (element: Element | null): string => {
    if (!element) return '';
    const copy = element.cloneNode(true) as Element;
    copy
      .querySelectorAll('input,select,textarea,script,style,[contenteditable]')
      .forEach((child) => child.remove());
    return clean(copy.textContent);
  };
  const lookup = (element: Element, id: string): Element | null => {
    const root = element.getRootNode();
    return 'getElementById' in root ? (root as Document | ShadowRoot).getElementById(id) : null;
  };
  const referenced = (element: Element, attribute: string): Element[] =>
    (element.getAttribute(attribute) ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((id) => {
        const found = lookup(element, id);
        return found ? [found] : [];
      });
  const labelledBy = (element: Element): string =>
    clean(referenced(element, 'aria-labelledby').map(text).join(' '));
  const label = (element: Element): string => {
    const explicit = clean(element.getAttribute('aria-label')) || labelledBy(element);
    if (explicit) return explicit;
    if ('labels' in element) {
      const labels = (element as HTMLInputElement).labels;
      const value = clean(
        Array.from(labels ?? [])
          .map(text)
          .join(' '),
      );
      if (value) return value;
    }
    if (
      element.matches(
        'button:not([role="combobox"]),[role="radio"],[role="checkbox"],[role="switch"]',
      )
    ) {
      const value = text(element);
      if (value) return value;
    }
    const preceding = element.previousElementSibling;
    return (
      (preceding?.matches('label,span,strong,b,legend') ? text(preceding) : '') ||
      clean(element.getAttribute('placeholder')) ||
      clean(element.getAttribute('title')) ||
      clean(element.getAttribute('name')) ||
      clean(element.id)
    );
  };
  const groupLabel = (element: Element | null): string =>
    element
      ? clean(element.getAttribute('aria-label')) ||
        labelledBy(element) ||
        text(element.querySelector(':scope > legend'))
      : '';
  const visible = (element: Element): boolean => {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    return (
      element.getClientRects().length > 0 &&
      style?.visibility !== 'hidden' &&
      style?.visibility !== 'collapse' &&
      !element.closest('[hidden]')
    );
  };
  const disabled = (element: Element): boolean =>
    element.matches(':disabled,[aria-disabled="true"]') || !!element.closest('[inert]');

  function walk(root: Document | ShadowRoot, frame: number): void {
    if (seenRoots.has(root)) return;
    seenRoots.add(root);
    const walker =
      root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_ELEMENT) ??
      (root as Document).createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (++visited > 30_000) {
        result.truncated = true;
        return;
      }
      const element = node as Element;
      if (element.hasAttribute('data-smartmapper-reader-markers')) {
        node = walker.nextNode();
        continue;
      }
      if (
        element.matches(selector) &&
        !element.matches('input[type="hidden"]') &&
        !element.closest('[data-smartmapper-overlay],#smartmapper-training-overlay')
      )
        candidates.push({ element, frame });
      if (element.shadowRoot) walk(element.shadowRoot, frame);
      if (element.tagName === 'IFRAME' || element.tagName === 'FRAME') {
        try {
          const nested = (element as HTMLIFrameElement).contentDocument;
          if (nested?.documentElement) walk(nested, ++frameNumber);
          else result.inaccessibleFrames++;
        } catch {
          result.inaccessibleFrames++;
        }
      }
      node = walker.nextNode();
    }
  }
  walk(document, 0);

  // A popup belonging to a combobox is part of that field, not a second dropdown.
  const ownedPopups = new Set<Element>();
  for (const { element } of candidates) {
    if (element.getAttribute('role') === 'combobox')
      [...referenced(element, 'aria-controls'), ...referenced(element, 'aria-owns')].forEach(
        (popup) => ownedPopups.add(popup),
      );
  }
  const radioGroups = new Map<Node, Map<string, ReadPageField>>();
  const ariaGroups = new Set<Element>();
  function choices(field: ReadPageField, options: Element[]): void {
    for (const option of options) {
      if (field.choices.length >= 500 || remainingChoices <= 0) {
        field.choicesIncomplete = true;
        result.truncated = true;
        break;
      }
      field.choices.push({
        label: text(option) || `Option ${field.choices.length + 1}`,
        disabled: disabled(option) || !!option.closest('optgroup[disabled]'),
      });
      remainingChoices--;
    }
  }
  for (const { element, frame } of candidates) {
    try {
      if (ownedPopups.has(element)) continue;
      const ariaGroup = element.closest('[role="radiogroup"]');
      if (ariaGroup && ariaGroup !== element && ariaGroups.has(ariaGroup)) continue;
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute('role') ?? '';
      const input = tag === 'input' ? (element as HTMLInputElement) : null;
      const inputType = input?.type ?? '';
      const radio = inputType === 'radio';
      const scope = element.closest('fieldset,[role="group"],[role="radiogroup"]');
      const type =
        role === 'radiogroup' || radio
          ? 'radio group'
          : tag === 'select'
            ? (element as HTMLSelectElement).multiple
              ? 'multi-select'
              : 'dropdown'
            : role === 'combobox'
              ? 'custom dropdown'
              : inputType ||
                role ||
                (element.hasAttribute('contenteditable') ? 'editable text' : tag);
      const field: ReadPageField = {
        key: newKey(),
        number: result.fields.length + 1,
        label:
          (radio ? groupLabel(scope) || clean(input!.name) : '') ||
          label(element) ||
          `Unlabelled field ${result.fields.length + 1}`,
        type,
        section: groupLabel(scope),
        name: clean(element.getAttribute('name'), 240),
        id: clean(element.id, 240),
        required: element.matches('[required],[aria-required="true"]'),
        disabled: disabled(element),
        readOnly: element.matches('[readonly],[aria-readonly="true"]'),
        visible: visible(element),
        frame,
        choices: [],
        choicesIncomplete: false,
      };
      if (radio) {
        const name = input!.name;
        const owner = input!.form ?? element.getRootNode();
        const groups = radioGroups.get(owner) ?? new Map<string, ReadPageField>();
        radioGroups.set(owner, groups);
        const existing = name ? groups.get(name) : undefined;
        const group = existing ?? field;
        if (group.choices.length < 500 && remainingChoices > 0) {
          group.choices.push({
            label: label(element) || `Option ${group.choices.length + 1}`,
            disabled: disabled(element),
          });
          remainingChoices--;
        } else {
          group.choicesIncomplete = true;
          result.truncated = true;
        }
        group.required ||= field.required;
        group.disabled &&= field.disabled;
        group.visible ||= field.visible;
        if (existing) {
          anchors.get(existing)?.push(element);
          continue;
        }
        if (name) groups.set(name, field);
      } else if (tag === 'select') {
        choices(field, Array.from((element as HTMLSelectElement).options));
      } else if (role === 'radiogroup') {
        ariaGroups.add(element);
        field.label = groupLabel(element) || field.label;
        const radios = Array.from(element.querySelectorAll('[role="radio"],input[type="radio"]'));
        for (const choice of radios) {
          if (field.choices.length >= 500 || remainingChoices <= 0) {
            field.choicesIncomplete = true;
            result.truncated = true;
            break;
          }
          field.choices.push({
            label: label(choice) || `Option ${field.choices.length + 1}`,
            disabled: disabled(choice),
          });
          remainingChoices--;
        }
      } else if (role === 'combobox' || role === 'listbox') {
        const roots = [
          element,
          ...referenced(element, 'aria-controls'),
          ...referenced(element, 'aria-owns'),
        ];
        choices(field, [
          ...new Set(
            roots.flatMap((root) => Array.from(root.querySelectorAll('[role="option"],option'))),
          ),
        ]);
        if (!field.choices.length) field.choicesIncomplete = true;
      } else if (input?.list) {
        choices(field, Array.from(input.list.options));
      }
      if (result.fields.length >= 1500) {
        result.truncated = true;
        break;
      }
      result.fields.push(field);
      anchors.set(field, [element]);
    } catch {
      result.unreadableControls++;
    }
  }
  for (const [field, elements] of anchors) {
    const anchor = elements[0]!;
    const signature = JSON.stringify({ ...field, key: '', number: 0, visible: true });
    const previous = state.identities.get(anchor);
    if (previous?.signature === signature) field.key = previous.key;
    else state.identities.set(anchor, { signature, key: field.key });
  }
  if (annotate) {
    const cleanups: Array<() => void> = [];
    const documents = new Map<Document, Array<{ number: number; element: Element }>>();
    for (const [field, elements] of anchors) {
      for (const element of elements) {
        const doc = element.ownerDocument;
        const entries = documents.get(doc) ?? [];
        entries.push({ number: field.number, element });
        documents.set(doc, entries);
      }
    }
    for (const [doc, entries] of documents) {
      const view = doc.defaultView;
      if (!view || !doc.documentElement) continue;
      const host = doc.createElement('div');
      host.setAttribute('data-smartmapper-reader-markers', '');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText =
        'all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;overflow:visible!important;pointer-events:none!important;z-index:2147483647!important;';
      const shadow = host.attachShadow({ mode: 'open' });
      const markers = entries.map(({ number, element }) => {
        const badge = doc.createElement('span');
        badge.textContent = String(number);
        badge.dataset.fieldNumber = String(number);
        badge.style.cssText =
          'all:initial;position:fixed;box-sizing:border-box;pointer-events:none;min-width:24px;height:22px;padding:2px 5px;border:1px solid white;border-radius:5px;background:#173f80;color:white;font:700 12px/16px Arial,sans-serif;text-align:center;box-shadow:0 1px 4px #0005;';
        shadow.append(badge);
        return { badge, element };
      });
      doc.documentElement.append(host);
      let pending = 0;
      const position = () => {
        pending = 0;
        // Read all geometry before changing our own layer; never alter carrier controls.
        const positions = markers.map(({ element }) => {
          if (!element.isConnected || !visible(element)) return null;
          const rect = element.getBoundingClientRect();
          if (
            rect.bottom < 0 ||
            rect.top > view.innerHeight ||
            rect.right < 0 ||
            rect.left > view.innerWidth
          )
            return null;
          return {
            left: Math.max(0, Math.min(view.innerWidth - 32, rect.left - 12)),
            top: Math.max(0, rect.top - 16),
          };
        });
        markers.forEach(({ badge }, index) => {
          const point = positions[index];
          badge.style.display = point ? 'block' : 'none';
          if (point) {
            badge.style.left = `${point.left}px`;
            badge.style.top = `${point.top}px`;
          }
        });
      };
      const schedule = () => {
        if (!pending) pending = view.requestAnimationFrame(position);
      };
      view.addEventListener('scroll', schedule, true);
      view.addEventListener('resize', schedule);
      const resize = new ResizeObserver(schedule);
      for (const { element } of entries) resize.observe(element);
      if (doc.body) resize.observe(doc.body);
      const mutation = new MutationObserver(schedule);
      if (doc.body)
        mutation.observe(doc.body, { childList: true, subtree: true, attributes: true });
      // Shadow-root layout changes are outside the document observer.
      for (const root of seenRoots)
        if (root.ownerDocument === doc)
          mutation.observe(root, { childList: true, subtree: true, attributes: true });
      position();
      cleanups.push(() => {
        view.cancelAnimationFrame(pending);
        view.removeEventListener('scroll', schedule, true);
        view.removeEventListener('resize', schedule);
        resize.disconnect();
        mutation.disconnect();
        host.remove();
      });
    }
    const cleanup = () => {
      cleanups.forEach((dispose) => dispose());
      window.removeEventListener('pagehide', cleanup);
    };
    state.cleanup = cleanup;
    window.addEventListener('pagehide', cleanup, { once: true });
  }
  return result;
}
