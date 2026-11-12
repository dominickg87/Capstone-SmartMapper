import {
  MiaFieldCatalogSchema,
  TrainingSessionViewSchema,
  type MiaFieldCatalog,
  type TrainingControlSnapshot,
  type TrainingSessionView,
} from '@smartmapper/contracts';
import {
  canonicalControlInputType,
  canonicalControlRole,
  carrierReferenceCaption,
  carrierReferenceOption,
  isSemanticHash,
} from '@smartmapper/automation-core/registry';

function inventoryControl(control: TrainingControlSnapshot, number: number) {
  return {
    label: carrierReferenceCaption(control.reference?.label ?? '') || `Carrier field ${number}`,
    section: carrierReferenceCaption(control.reference?.section ?? '') || 'Carrier section',
    type: control.choiceGroup
      ? 'radio group'
      : canonicalControlInputType(control.inputType) || control.tag,
    role: canonicalControlRole(control.role),
    required: control.required,
    disabled: control.disabled,
    humanOnly: control.humanOnly,
    options: control.options.map((option, index) => ({
      number: index + 1,
      label:
        carrierReferenceOption(control.reference?.options[index] ?? '') ||
        `Carrier option ${index + 1}`,
      // Never export raw DOM option values, including those in an older capture.
      optionKey: isSemanticHash(option.value) ? option.value : null,
    })),
  };
}

/** A review worksheet, not an executable mapping or a browser-session backup. */
export function createFieldInventory(training: TrainingSessionView, catalog: MiaFieldCatalog) {
  const checkedTraining = TrainingSessionViewSchema.safeParse(training);
  const checkedCatalog = MiaFieldCatalogSchema.safeParse(catalog);
  if (!checkedTraining.success || !checkedCatalog.success)
    throw new Error('Could not export this reference. Reopen saved training and try again.');
  const saved = checkedTraining.data;
  const sourceCatalog = checkedCatalog.data;
  if (
    sourceCatalog.formType !== saved.workflow.lineOfBusiness ||
    sourceCatalog.schemaRevision !== saved.catalogRevision
  )
    throw new Error('The M.I.A. catalog changed. Reopen saved training before exporting.');
  if (!saved.pages.length) throw new Error('Capture a carrier page before exporting.');

  // Explicit projection excludes capabilities, tenant/user/tab IDs, URLs, page text, raw DOM
  // identity, scenario names, source answers and fixed-value/transform payloads. The catalog
  // comes from M.I.A.'s reviewed question definitions, never from the selected client's answers.
  return {
    format: 'smartmapper-field-inventory' as const,
    formatVersion: 1,
    lineOfBusiness: saved.workflow.lineOfBusiness,
    draftRevision: saved.revision,
    notes: [
      'Only captured pages and revealed scenarios are included; this is not proof of complete site coverage.',
      'Numbers match the training reference. Fields can recur in multiple captured states.',
      'Unapproved captions and private choices are omitted; numbered placeholders need human identification.',
      'This file does not select answers, import mappings, publish, verify or activate a workflow.',
    ],
    pages: saved.pages.map((page) => ({
      pageId: page.pageId,
      number: page.sequence,
      fields: page.fields.map((field) => ({
        fieldId: field.fieldId,
        logicalFieldId: field.logicalFieldId ?? null,
        number: field.sequence,
        ...inventoryControl(field.control, field.sequence),
        repeatEntityType: field.repeatEntityType,
        repeatIndex: field.repeatIndex,
        disposition: field.disposition?.kind ?? null,
      })),
      workflowControls: page.workflowControls.map((control) => ({
        workflowControlId: control.workflowControlId,
        logicalFieldId: control.logicalFieldId ?? null,
        number: control.sequence,
        ...inventoryControl(control.control, control.sequence),
        kind: control.kind,
        decision: control.decision,
      })),
    })),
    miaCatalog: sourceCatalog,
  };
}

export function downloadFieldInventory(training: TrainingSessionView, catalog: MiaFieldCatalog) {
  const inventory = createFieldInventory(training, catalog);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(inventory, null, 2) + '\n'], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `smartmapper-${inventory.lineOfBusiness}-fields-r${inventory.draftRevision}.json`;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Let Chrome begin the download before releasing the temporary document URL.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
