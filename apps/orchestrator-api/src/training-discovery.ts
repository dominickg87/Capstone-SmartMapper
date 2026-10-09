import type { TrainingControlSnapshot, TrainingPage } from '@smartmapper/contracts';
import { stableTargetSignature } from '@smartmapper/automation-core/registry';

type Item = TrainingPage['fields'][number] | TrainingPage['workflowControls'][number];
const logicalId = (item: Item): string =>
  item.logicalFieldId ?? ('fieldId' in item ? item.fieldId : item.workflowControlId);

/** Metadata that must agree before a saved decision can follow a field into another scenario. */
export function trainingControlDomain(control: TrainingControlSnapshot): string {
  return JSON.stringify({
    tag: control.tag,
    type: control.inputType,
    role: control.role,
    label: control.label,
    section: control.section,
    required: control.required,
    humanOnly: control.humanOnly,
    operational: control.operationalTarget,
    addEntity: control.addEntityType,
    next: !!control.ordinaryNext,
    options: control.options.map((option) => JSON.stringify(option)).sort(),
    choiceValue: control.choiceValue,
  });
}

/** Snapshot IDs stay distinct for proof coverage; only logical identity, number and choices carry. */
export async function reuseTrainingNumbers(
  page: TrainingPage,
  previous: TrainingPage[],
  preferredPageId: string | undefined,
  nextNumber: number,
): Promise<void> {
  const pages = [...previous].reverse().filter((candidate) => candidate.routeId === page.routeId);
  const items = (candidate: TrainingPage): Item[] => [
    ...candidate.fields,
    ...candidate.workflowControls,
  ];
  const fresh = items(page).sort((a, b) => a.sequence - b.sequence);
  const signatures = new Map<Item, string>();
  await Promise.all(
    [...fresh, ...pages.flatMap(items)].map(async (item) => {
      signatures.set(item, await stableTargetSignature(item.control));
    }),
  );
  const assigned = new Set<string>();
  for (const item of fresh) {
    const compatible = (candidate: Item): boolean =>
      'fieldId' in candidate === 'fieldId' in item &&
      trainingControlDomain(candidate.control) === trainingControlDomain(item.control);
    const matches = pages.flatMap((candidatePage) => {
      const candidates = items(candidatePage);
      // Repeated controls must have a unique DOM hint on both sides before ignoring occurrence.
      for (const hint of ['name', 'id'] as const) {
        const value = item.control.locatorHints?.[hint];
        if (
          !value ||
          fresh.filter((entry) => entry.control.locatorHints?.[hint] === value).length !== 1
        )
          continue;
        const found = candidates.filter((entry) => entry.control.locatorHints?.[hint] === value);
        if (found.length === 1 && compatible(found[0]!))
          return [{ item: found[0]!, pageId: candidatePage.pageId }];
      }
      const same = candidates.filter((entry) => signatures.get(entry) === signatures.get(item));
      const sameFresh = fresh.filter((entry) => signatures.get(entry) === signatures.get(item));
      if (same.length !== sameFresh.length) return [];
      const found = same[sameFresh.indexOf(item)];
      if (!found || !compatible(found)) return [];
      const commonHints = (['name', 'id'] as const).filter(
        (hint) => item.control.locatorHints?.[hint] && found.control.locatorHints?.[hint],
      );
      if (
        commonHints.length &&
        !commonHints.some(
          (hint) => item.control.locatorHints?.[hint] === found.control.locatorHints?.[hint],
        )
      )
        return [];
      return [{ item: found, pageId: candidatePage.pageId }];
    });
    const preferred = matches.find((match) => match.pageId === preferredPageId)?.item;
    const identities = new Set(matches.map((match) => logicalId(match.item)));
    const previousItem = preferred ?? (identities.size === 1 ? matches[0]?.item : undefined);
    if (!previousItem || assigned.has(logicalId(previousItem))) {
      item.sequence = nextNumber++;
      item.logicalFieldId = logicalId(item);
      continue;
    }
    item.logicalFieldId = logicalId(previousItem);
    assigned.add(item.logicalFieldId);
    item.sequence = previousItem.sequence;
    if ('fieldId' in item && 'fieldId' in previousItem) {
      item.disposition = structuredClone(previousItem.disposition);
      item.repeatIndex = previousItem.repeatIndex;
      item.repeatEntityType = previousItem.repeatEntityType;
      item.groupKey = previousItem.groupKey;
    } else if ('decision' in item && 'decision' in previousItem) {
      // Navigation approval is scenario-specific, even when its display number is shared.
      item.decision = null;
    }
  }
  page.fields.sort((a, b) => a.sequence - b.sequence);
  page.workflowControls.sort((a, b) => a.sequence - b.sequence);
}
