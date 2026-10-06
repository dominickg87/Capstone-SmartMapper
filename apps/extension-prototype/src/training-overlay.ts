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
 * values. Every marker is positioned from an already captured document-coordinate rectangle.
 */
export class TrainingOverlay {
  private root: HTMLDivElement | null = null;
  private markers = new Map<string, { badge: HTMLButtonElement; outline: HTMLDivElement }>();

  public clear(): void {
    this.root?.remove();
    this.root = null;
    this.markers.clear();
  }

  public show(input: TrainingMarker[]): void {
    this.clear();
    if (!input.length) return;
    const root = document.createElement('div');
    root.id = 'smartmapper-training-overlay';
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'SmartMapper training field markers');
    root.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'width:100%',
      `height:${Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)}px`,
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
      this.markers.set(marker.fieldId, { badge, outline });
    }
    document.documentElement.append(root);
    this.root = root;
  }

  public focus(fieldId: string): boolean {
    const marker = this.markers.get(fieldId);
    if (!marker) return false;
    const top = Number.parseFloat(marker.outline.style.top) || 0;
    const height = Number.parseFloat(marker.outline.style.height) || 0;
    window.scrollTo({
      top: Math.max(0, top - Math.max(100, (innerHeight - height) / 2)),
      behavior: 'smooth',
    });
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
