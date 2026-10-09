import type { PageControl } from '@smartmapper/contracts';
import { isSemanticHash } from '@smartmapper/automation-core/registry';
import { z } from 'zod';

export const TrainingMarkerSchema = z
  .object({
    fieldId: z.string().min(1).max(240),
    number: z.number().int().positive(),
    label: z.string().max(2000),
    control: z.object({
      elementId: z.string().min(1).max(160),
      rect: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number().nonnegative(),
          height: z.number().nonnegative(),
        })
        .strict(),
    }),
    state: z.enum(['unmapped', 'mapped', 'human', 'ignored', 'missing']).default('unmapped'),
  })
  .strict();
export type TrainingMarker = z.infer<typeof TrainingMarkerSchema>;

const markerColors: Record<TrainingMarker['state'], { fill: string; border: string }> = {
  unmapped: { fill: '#b42318', border: '#fff1f0' },
  missing: { fill: '#b42318', border: '#fff1f0' },
  mapped: { fill: '#067647', border: '#ecfdf3' },
  human: { fill: '#7a2e0e', border: '#fff7ed' },
  ignored: { fill: '#475467', border: '#f2f4f7' },
};

/**
 * Owns the visual trainer layer inside the carrier tab. The layer never reads or changes field
 * values. Geometry follows the actual observed element, including nested scrolling containers.
 */
export class TrainingOverlay {
  private root: HTMLDivElement | null = null;
  private markers = new Map<
    string,
    { badge: HTMLButtonElement; outline: HTMLDivElement; elementId: string }
  >();
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private mutations: MutationObserver | undefined;
  private readonly schedule = (): void => {
    if (!this.frame && this.root)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.position();
      });
  };

  public constructor(private readonly elementFor: (elementId: string) => HTMLElement | undefined) {}

  public clear(): void {
    document.removeEventListener('scroll', this.schedule, true);
    window.removeEventListener('resize', this.schedule);
    this.mutations?.disconnect();
    this.mutations = undefined;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    clearInterval(this.timer);
    this.timer = undefined;
    this.root?.remove();
    this.root = null;
    this.markers.clear();
  }

  public show(input: TrainingMarker[]): void {
    this.clear();
    if (!input.length) return;
    const root = document.createElement('div');
    root.id = 'smartmapper-training-overlay';
    root.setAttribute('data-smartmapper-overlay', 'training');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'SmartMapper training field markers');
    root.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'width:100%',
      'height:100%',
      'overflow:hidden',
      'pointer-events:none',
      'z-index:2147483647',
      'contain:layout style',
    ].join(';');

    for (const marker of input) {
      const colors = markerColors[marker.state];
      const { rect } = marker.control;
      const outline = document.createElement('div');
      outline.dataset.smartmapperFieldId = marker.fieldId;
      outline.style.cssText = [
        'position:absolute',
        `left:${Math.max(0, rect.x - 4)}px`,
        `top:${Math.max(0, rect.y - 4)}px`,
        `width:${Math.max(16, rect.width + 8)}px`,
        `height:${Math.max(16, rect.height + 8)}px`,
        `border:3px solid ${colors.fill}`,
        `box-shadow:0 0 0 2px ${colors.border},0 2px 10px rgba(16,24,40,.35)`,
        'border-radius:5px',
        'box-sizing:border-box',
        'pointer-events:none',
        'transition:box-shadow .15s ease,transform .15s ease',
      ].join(';');

      const badge = document.createElement('button');
      badge.type = 'button';
      badge.textContent = String(marker.number);
      badge.title = `SmartMapper field ${marker.number}: ${marker.label || 'Unlabeled field'}`;
      badge.dataset.smartmapperFieldId = marker.fieldId;
      badge.setAttribute('aria-label', badge.title);
      badge.style.cssText = [
        'position:absolute',
        `left:${Math.max(0, rect.x - 15)}px`,
        `top:${Math.max(0, rect.y - 19)}px`,
        'min-width:34px',
        'height:34px',
        'padding:0 7px',
        `background:${colors.fill}`,
        `border:3px solid ${colors.border}`,
        'border-radius:18px',
        'box-shadow:0 3px 12px rgba(16,24,40,.45)',
        'color:white',
        'font:700 15px/28px system-ui,-apple-system,"Segoe UI",sans-serif',
        'text-align:center',
        'cursor:pointer',
        'pointer-events:auto',
        'box-sizing:border-box',
      ].join(';');
      badge.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void chrome.runtime.sendMessage({
          type: 'smartmapper-training-field-selected',
          fieldId: marker.fieldId,
          number: marker.number,
        });
      });
      root.append(outline, badge);
      this.markers.set(marker.fieldId, { badge, outline, elementId: marker.control.elementId });
    }
    document.documentElement.append(root);
    this.root = root;
    document.addEventListener('scroll', this.schedule, true);
    window.addEventListener('resize', this.schedule);
    this.mutations = new MutationObserver((changes) => {
      if (changes.some((change) => !this.root?.contains(change.target))) this.schedule();
    });
    this.mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open'],
    });
    // Covers CSS transitions, font/image layout changes and replaced controls between observations.
    this.timer = setInterval(this.schedule, 250);
    this.position();
  }

  private position(): void {
    for (const marker of this.markers.values()) {
      const element = this.elementFor(marker.elementId);
      const rect = element?.getBoundingClientRect();
      const style = element ? getComputedStyle(element) : null;
      let left = 0;
      let top = 0;
      let right = innerWidth;
      let bottom = innerHeight;
      for (let ancestor = element?.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const css = getComputedStyle(ancestor);
        const bounds = ancestor.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) {
          left = Math.max(left, bounds.left + ancestor.clientLeft);
          right = Math.min(right, bounds.left + ancestor.clientLeft + ancestor.clientWidth);
        }
        if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {
          top = Math.max(top, bounds.top + ancestor.clientTop);
          bottom = Math.min(bottom, bounds.top + ancestor.clientTop + ancestor.clientHeight);
        }
      }
      const visible =
        !!element?.isConnected &&
        !!rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        style?.visibility !== 'hidden' &&
        style?.display !== 'none' &&
        rect.right > left &&
        rect.left < right &&
        rect.bottom > top &&
        rect.top < bottom;
      marker.outline.hidden = !visible;
      marker.badge.hidden = !visible;
      // Carrier styles can override the browser's default [hidden] rule.
      marker.outline.style.display = visible ? 'block' : 'none';
      marker.badge.style.display = visible ? 'block' : 'none';
      if (!visible || !rect) continue;
      Object.assign(marker.outline.style, {
        left: `${rect.left - 4}px`,
        top: `${rect.top - 4}px`,
        width: `${rect.width + 8}px`,
        height: `${rect.height + 8}px`,
        clipPath: `inset(${Math.max(0, top - rect.top + 4)}px ${Math.max(0, rect.right + 4 - right)}px ${Math.max(0, rect.bottom + 4 - bottom)}px ${Math.max(0, left - rect.left + 4)}px)`,
      });
      marker.badge.style.left = `${Math.max(left, Math.min(right - 34, rect.left - 15))}px`;
      marker.badge.style.top = `${Math.max(top, Math.min(bottom - 34, rect.top - 19))}px`;
    }
  }

  public focus(fieldId: string): boolean {
    const marker = this.markers.get(fieldId);
    if (!marker) return false;
    const element = this.elementFor(marker.elementId);
    if (!element) return false;
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    this.schedule();
    marker.outline.animate(
      [
        { transform: 'scale(1)', boxShadow: marker.outline.style.boxShadow },
        { transform: 'scale(1.08)', boxShadow: '0 0 0 7px #fdb022,0 4px 18px rgba(16,24,40,.55)' },
        { transform: 'scale(1)', boxShadow: marker.outline.style.boxShadow },
      ],
      { duration: 900, iterations: 2 },
    );
    marker.badge.focus({ preventScroll: true });
    return true;
  }
}

export function markerFromControl(
  fieldId: string,
  number: number,
  control: Pick<PageControl, 'elementId' | 'label' | 'rect'>,
  state: TrainingMarker['state'] = 'unmapped',
): TrainingMarker {
  return {
    fieldId,
    number,
    label: isSemanticHash(control.label) ? 'Private carrier label' : control.label,
    control: { elementId: control.elementId, rect: control.rect },
    state,
  };
}
