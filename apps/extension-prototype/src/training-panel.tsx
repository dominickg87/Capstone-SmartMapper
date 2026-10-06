import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type MappingDisposition,
  type MappingLineOfBusiness,
  type MappingSourceReference,
  type MappingTransform,
  type MiaCatalogField,
  type MiaFieldCatalog,
  type TrainingField,
  type TrainingPage,
} from '@smartmapper/contracts';
import { catalogFieldLabel, groupCatalogFields } from './mia-catalog.js';
import { TrainingController, type TrainingBrowserSession } from './training-controller.js';
import {
  carrierDisplayText,
  carrierBooleanTransform,
  carrierEnumCases,
  carrierFieldMetadata,
  carrierOptionDisplay,
  defaultTransform,
  dispositionReady,
  mappingSummary,
} from './training-view.js';

type SourceDisposition = Extract<MappingDisposition, { kind: 'source' }>;
type TestableMapping = { mappingId: string; mappingVersion: number };
type RepeatBinding = {
  entityType: 'applicant' | 'additionalDriver' | 'vehicle';
  index: number;
};

function referenceFor(
  field: MiaCatalogField,
  binding: 'fixed' | 'same_position',
  entityLimits: MiaFieldCatalog['entityLimits'],
): MappingSourceReference {
  if (binding === 'same_position' && field.sourcePattern.includes('*'))
    return {
      sourcePathPattern: field.sourcePattern,
      binding,
      sourceIndexBase:
        entityLimits.find(
          (limit) => limit.sourcePattern === field.sourcePattern || limit.key === field.entity?.key,
        )?.sourceIndexBase ?? 0,
    };
  return {
    sourcePathPattern: field.sourcePattern,
    sourcePath: field.sourcePath,
    binding: 'fixed',
  };
}

function sourceFieldFor(reference: MappingSourceReference, catalog: MiaCatalogField[]) {
  return catalog.find(
    (field) =>
      field.sourcePath === reference.sourcePath ||
      field.sourcePattern === reference.sourcePathPattern,
  );
}

function FieldSourceSelect({
  value,
  catalog,
  onChange,
}: {
  value: MiaCatalogField | undefined;
  catalog: MiaCatalogField[];
  onChange: (field: MiaCatalogField) => void;
}) {
  const groups = useMemo(() => groupCatalogFields(catalog), [catalog]);
  return (
    <select
      aria-label="Available M.I.A. field"
      value={value?.fieldId ?? ''}
      onChange={(event) => {
        const selected = catalog.find((field) => field.fieldId === event.target.value);
        if (selected) onChange(selected);
      }}
    >
      <option value="">Choose a M.I.A. question and field…</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.fields.map((field) => (
            <option key={field.fieldId} value={field.fieldId}>
              {catalogFieldLabel(field)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function TransformEditor({
  disposition,
  selectedField,
  carrierField,
  onChange,
}: {
  disposition: SourceDisposition;
  selectedField: MiaCatalogField | undefined;
  carrierField: TrainingField;
  onChange: (next: SourceDisposition) => void;
}) {
  const transform = disposition.transform;
  const membershipTarget =
    carrierField.control.inputType.toLowerCase() === 'checkbox' ||
    carrierField.control.role.toLowerCase() === 'checkbox';
  const setTransform = (next: MappingTransform): void =>
    onChange({ ...disposition, transform: next });
  const setKind = (kind: MappingTransform['kind']): void => {
    if (kind === 'identity') return setTransform({ kind });
    if (kind === 'date') return setTransform({ kind, format: 'MM/DD/YYYY' });
    if (kind === 'date_part') return setTransform({ kind, part: 'year', pad: true });
    if (kind === 'phone') return setTransform({ kind, format: 'dashes' });
    if (kind === 'boolean') return setTransform(carrierBooleanTransform(carrierField));
    if (kind === 'compose') return setTransform({ kind, separator: ' ' });
    if (kind === 'split') return setTransform({ kind, delimiter: 'space', part: 0 });
    if (kind === 'multiselect_membership') {
      const first = selectedField?.options[0];
      if (first) return setTransform({ kind, member: first.value });
      return;
    }
    if (kind === 'multiselect_join') return setTransform({ kind, separator: ', ' });
    const cases = carrierEnumCases(selectedField?.options ?? [], carrierField);
    if (cases.length) setTransform({ kind: 'enum', cases });
  };
  return (
    <div className="transform-editor">
      <label>
        Transformation
        <select
          value={transform.kind}
          onChange={(event) => setKind(event.target.value as MappingTransform['kind'])}
        >
          <option value="identity">Use value as stored</option>
          <option value="date">Format date</option>
          <option value="date_part">Use one date part</option>
          <option value="phone">Format phone number</option>
          <option value="boolean">Yes/no crosswalk</option>
          {!!selectedField?.options.length && !!carrierField.control.options.length && (
            <option value="enum">Dropdown option crosswalk</option>
          )}
          {selectedField?.dataType === 'multiselect' &&
            membershipTarget &&
            !!selectedField.options.length && (
              <option value="multiselect_membership">Check when M.I.A. includes one answer</option>
            )}
          {selectedField?.dataType === 'multiselect' && (
            <option value="multiselect_join">Join selected M.I.A. answers</option>
          )}
          <option value="split">Use one part of a value</option>
          {disposition.references.length > 1 && (
            <option value="compose">Combine M.I.A. fields</option>
          )}
        </select>
      </label>
      {transform.kind === 'date' && (
        <label>
          Carrier date format
          <select
            value={transform.format}
            onChange={(event) =>
              setTransform({ ...transform, format: event.target.value as typeof transform.format })
            }
          >
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="M/D/YYYY">M/D/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="MM-DD-YYYY">MM-DD-YYYY</option>
          </select>
        </label>
      )}
      {transform.kind === 'date_part' && (
        <div className="inline-fields">
          <label>
            Date part
            <select
              value={transform.part}
              onChange={(event) =>
                setTransform({ ...transform, part: event.target.value as typeof transform.part })
              }
            >
              <option value="month">Month</option>
              <option value="day">Day</option>
              <option value="year">Year</option>
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={transform.pad}
              onChange={(event) => setTransform({ ...transform, pad: event.target.checked })}
            />
            Pad month/day with zero
          </label>
        </div>
      )}
      {transform.kind === 'phone' && (
        <label>
          Carrier phone format
          <select
            value={transform.format}
            onChange={(event) =>
              setTransform({ ...transform, format: event.target.value as typeof transform.format })
            }
          >
            <option value="digits">5045551212</option>
            <option value="dashes">504-555-1212</option>
            <option value="parentheses">(504) 555-1212</option>
          </select>
        </label>
      )}
      {transform.kind === 'boolean' && (
        <div className="inline-fields">
          <label>
            M.I.A. Yes becomes
            {carrierField.control.options.length ? (
              <select
                value={String(transform.trueValue)}
                onChange={(event) => setTransform({ ...transform, trueValue: event.target.value })}
              >
                {carrierField.control.options.map((option, index) => (
                  <option key={option.value} value={option.value}>
                    {carrierOptionDisplay(option.label, index)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={String(transform.trueValue)}
                onChange={(event) => setTransform({ ...transform, trueValue: event.target.value })}
              />
            )}
          </label>
          <label>
            M.I.A. No becomes
            {carrierField.control.options.length ? (
              <select
                value={String(transform.falseValue)}
                onChange={(event) => setTransform({ ...transform, falseValue: event.target.value })}
              >
                {carrierField.control.options.map((option, index) => (
                  <option key={option.value} value={option.value}>
                    {carrierOptionDisplay(option.label, index)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={String(transform.falseValue)}
                onChange={(event) => setTransform({ ...transform, falseValue: event.target.value })}
              />
            )}
          </label>
        </div>
      )}
      {transform.kind === 'enum' && (
        <div className="crosswalk" aria-label="Dropdown option crosswalk">
          <p>Confirm how each M.I.A. answer corresponds to the carrier option.</p>
          {transform.cases.map((item, index) => (
            <label key={`${String(item.source)}-${index}`}>
              <span>{String(item.source)}</span>
              <select
                value={String(item.target)}
                onChange={(event) => {
                  const cases = transform.cases.map((entry, offset) =>
                    offset === index ? { ...entry, target: event.target.value } : entry,
                  );
                  setTransform({ ...transform, cases });
                }}
              >
                {!carrierField.control.options.some(
                  (option) => String(option.value) === String(item.target),
                ) && <option value={String(item.target)}>{String(item.target)}</option>}
                {carrierField.control.options.map((option, optionIndex) => (
                  <option key={String(option.value)} value={String(option.value)}>
                    {carrierOptionDisplay(option.label, optionIndex)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {transform.kind === 'split' && (
        <div className="inline-fields">
          <label>
            Split on
            <select
              value={transform.delimiter}
              onChange={(event) =>
                setTransform({
                  ...transform,
                  delimiter: event.target.value as typeof transform.delimiter,
                })
              }
            >
              <option value="space">Space</option>
              <option value="comma">Comma</option>
              <option value="hyphen">Hyphen</option>
              <option value="slash">Slash</option>
            </select>
          </label>
          <label>
            Part number (starts at 1)
            <input
              type="number"
              min={1}
              max={21}
              value={transform.part + 1}
              onChange={(event) =>
                setTransform({
                  ...transform,
                  part: Math.max(0, Math.min(20, Number(event.target.value) - 1)),
                })
              }
            />
          </label>
        </div>
      )}
      {transform.kind === 'compose' && (
        <label>
          Separator
          <select
            value={transform.separator}
            onChange={(event) =>
              setTransform({
                ...transform,
                separator: event.target.value as typeof transform.separator,
              })
            }
          >
            <option value=" ">Space</option>
            <option value=", ">Comma</option>
            <option value="-">Hyphen</option>
            <option value="/">Slash</option>
            <option value=" / ">Spaced slash</option>
          </select>
        </label>
      )}
      {transform.kind === 'multiselect_membership' && selectedField && (
        <label>
          M.I.A. selection represented by this carrier control
          <select
            value={String(transform.member)}
            onChange={(event) => {
              const option = selectedField.options.find(
                (item) => String(item.value) === event.target.value,
              );
              if (option) setTransform({ ...transform, member: option.value });
            }}
          >
            {selectedField.options.map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="field-help">
            SmartMapper checks this carrier option only when the saved M.I.A. answer includes this
            selection.
          </span>
        </label>
      )}
      {transform.kind === 'multiselect_join' && (
        <label>
          Join selected answers with
          <select
            value={transform.separator}
            onChange={(event) =>
              setTransform({
                ...transform,
                separator: event.target.value as typeof transform.separator,
              })
            }
          >
            <option value=" ">Space</option>
            <option value=", ">Comma</option>
            <option value="-">Hyphen</option>
            <option value="/">Slash</option>
            <option value=" / ">Spaced slash</option>
          </select>
        </label>
      )}
    </div>
  );
}

function DispositionEditor({
  field,
  value,
  catalog,
  entityLimits,
  repeatBinding,
  onChange,
  onRepeatBinding,
}: {
  field: TrainingField;
  value: MappingDisposition | null;
  catalog: MiaCatalogField[];
  entityLimits: MiaFieldCatalog['entityLimits'];
  repeatBinding: RepeatBinding | null;
  onChange: (value: MappingDisposition | null) => void;
  onRepeatBinding: (value: RepeatBinding | null) => void;
}) {
  const kind = value?.kind ?? '';
  const source = value?.kind === 'source' ? value : undefined;
  const chooseKind = (next: string): void => {
    if (!next) return onChange(null);
    if (next === 'source') {
      const initial = catalog[0];
      if (!initial) return;
      return onChange({
        kind: 'source',
        references: [referenceFor(initial, 'fixed', entityLimits)],
        transform: defaultTransform(initial, field),
      });
    }
    if (next === 'fixed_value')
      if (!field.control.operationalTarget) return;
      else
        return onChange({
          kind: 'fixed_value',
          value: '',
          classification: field.control.operationalTarget,
          reason:
            field.control.operationalTarget === 'agency_operational'
              ? 'approved_agency_identifier'
              : 'approved_carrier_identifier',
        });
    onChange({ kind: next } as MappingDisposition);
  };
  return (
    <div className="disposition-editor">
      <label>
        How should SmartMapper handle this field?
        <select value={kind} onChange={(event) => chooseKind(event.target.value)}>
          <option value="">Missing mapping</option>
          <option value="source">Map from M.I.A.</option>
          <option value="carrier_default" disabled={!field.control.operationalTarget}>
            Keep carrier-provided default
          </option>
          <option value="fixed_value" disabled={!field.control.operationalTarget}>
            Use approved fixed operational value
          </option>
          <option value="human_required">Human entry required</option>
          <option value="ignore">Ignore / not applicable</option>
          <option value="leave_blank" disabled={field.control.required}>
            Leave optional field blank
          </option>
        </select>
      </label>
      {value?.kind === 'leave_blank' && (
        <p className="field-help">
          SmartMapper will deliberately leave this optional carrier field empty.
        </p>
      )}
      {value?.kind === 'fixed_value' && (
        <div className="fixed-value-editor">
          <label>
            Approved value
            <input
              value={String(value.value)}
              onChange={(event) => onChange({ ...value, value: event.target.value })}
            />
          </label>
          <p className="field-help">
            Classification:{' '}
            {value.classification === 'agency_operational'
              ? 'Agency operational'
              : 'Carrier operational'}
          </p>
          <p className="field-help">
            Reason:{' '}
            {value.reason === 'approved_agency_identifier'
              ? 'Approved agency identifier'
              : 'Approved carrier identifier'}
          </p>
          <p className="field-help">
            Never use a fixed value for a missing customer or underwriting fact.
          </p>
        </div>
      )}
      {source && (
        <div className="source-editor">
          {source.references.map((reference, index) => {
            const selected = sourceFieldFor(reference, catalog);
            const repeatLimit = selected
              ? entityLimits.find(
                  (limit) =>
                    limit.sourcePattern === selected.sourcePattern ||
                    limit.key === selected.entity?.key,
                )
              : undefined;
            return (
              <div className="source-reference" key={`${reference.sourcePathPattern}-${index}`}>
                <label>
                  Available from M.I.A. {source.references.length > 1 ? `(${index + 1})` : ''}
                  <FieldSourceSelect
                    value={selected}
                    catalog={catalog}
                    onChange={(nextField) => {
                      const references = source.references.map((item, offset) =>
                        offset === index ? referenceFor(nextField, 'fixed', entityLimits) : item,
                      );
                      onChange({
                        ...source,
                        references,
                        transform:
                          index === 0 ? defaultTransform(nextField, field) : source.transform,
                      });
                    }}
                  />
                </label>
                {selected && (
                  <div className="mia-context">
                    <strong>{selected.question}</strong>
                    <span>
                      {[selected.section, selected.entity?.label].filter(Boolean).join(' / ')}
                    </span>
                    {!!selected.context.length && <span>{selected.context.join(' · ')}</span>}
                    <code>{selected.sourcePath}</code>
                  </div>
                )}
                {selected?.sourcePattern.includes('*') && (
                  <>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={reference.binding === 'same_position'}
                        disabled={!selected.entity || !repeatLimit}
                        onChange={(event) => {
                          const references = source.references.map((item, offset) =>
                            offset === index
                              ? referenceFor(
                                  selected,
                                  event.target.checked ? 'same_position' : 'fixed',
                                  entityLimits,
                                )
                              : item,
                          );
                          if (event.target.checked && selected.entity && repeatLimit) {
                            const detectedIndex =
                              repeatBinding?.entityType === selected.entity.type
                                ? repeatBinding.index
                                : field.repeatEntityType === selected.entity.type &&
                                    field.repeatIndex !== null
                                  ? field.repeatIndex
                                  : selected.entity.index;
                            onRepeatBinding({
                              entityType: selected.entity.type,
                              index: Math.min(detectedIndex, repeatLimit.maximumCount - 1),
                            });
                          }
                          onChange({ ...source, references });
                        }}
                      />
                      Match the carrier row to the same M.I.A. driver/vehicle position
                    </label>
                    {reference.binding === 'same_position' && selected.entity && repeatLimit && (
                      <label>
                        Carrier{' '}
                        {selected.entity.type === 'additionalDriver'
                          ? 'driver'
                          : selected.entity.type}{' '}
                        position
                        <select
                          value={
                            repeatBinding?.entityType === selected.entity.type
                              ? repeatBinding.index
                              : field.repeatIndex !== null
                                ? field.repeatIndex
                                : selected.entity.index
                          }
                          onChange={(event) =>
                            onRepeatBinding({
                              entityType: selected.entity!.type,
                              index: Number(event.target.value),
                            })
                          }
                        >
                          {Array.from({ length: repeatLimit.maximumCount }, (_, position) => (
                            <option key={position} value={position}>
                              {selected.entity!.type === 'additionalDriver'
                                ? 'Additional driver'
                                : selected.entity!.type === 'vehicle'
                                  ? 'Vehicle'
                                  : 'Applicant'}{' '}
                              {position + 1}
                            </option>
                          ))}
                        </select>
                        <span className="field-help">
                          This makes the reusable rule follow the same numbered carrier row.
                        </span>
                      </label>
                    )}
                  </>
                )}
                {source.references.length > 1 && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      onChange({
                        ...source,
                        references: source.references.filter((_, offset) => offset !== index),
                      })
                    }
                  >
                    Remove this M.I.A. field
                  </button>
                )}
              </div>
            );
          })}
          {source.references.length < 10 && (
            <button
              type="button"
              className="secondary compact"
              onClick={() => {
                const initial = catalog[0];
                if (!initial) return;
                onChange({
                  ...source,
                  references: [...source.references, referenceFor(initial, 'fixed', entityLimits)],
                  transform: { kind: 'compose', separator: ' ' },
                });
              }}
            >
              Add another M.I.A. field
            </button>
          )}
          <TransformEditor
            disposition={source}
            selectedField={sourceFieldFor(source.references[0]!, catalog)}
            carrierField={field}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
}

function pageLabel(page: TrainingPage): string {
  const sequences = page.fields.map((field) => field.sequence);
  const range = sequences.length
    ? ` · fields ${Math.min(...sequences)}–${Math.max(...sequences)}`
    : '';
  return `Page ${page.sequence}: ${page.scenarioLabel}${range}`;
}

export function TrainingPanel({
  connected,
  onTestMapping,
  onTrainingResolved,
}: {
  connected: boolean;
  onTestMapping: (mapping: TestableMapping) => void;
  onTrainingResolved: () => void;
}) {
  const controller = useRef(new TrainingController());
  const [session, setSession] = useState<TrainingBrowserSession | null>(null);
  const [lineOfBusiness, setLineOfBusiness] = useState<MappingLineOfBusiness>('home');
  const [carrierOrigin, setCarrierOrigin] = useState('');
  const [carrierBaseUrl, setCarrierBaseUrl] = useState('');
  const [activePageId, setActivePageId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, MappingDisposition | null>>({});
  const [repeatDrafts, setRepeatDrafts] = useState<Record<string, RepeatBinding | null>>({});
  const [workflowDrafts, setWorkflowDrafts] = useState<Record<string, 'use' | 'ignore' | null>>({});
  const [activeFieldId, setActiveFieldId] = useState('');
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('Open a carrier quote page to begin training.');
  const [error, setError] = useState('');
  const editGeneration = useRef(0);

  const activePage = session?.training.pages.find((page) => page.pageId === activePageId);
  const locked = session?.training.status !== 'draft';

  const loadPage = useCallback((page: TrainingPage | undefined): void => {
    if (!page) {
      setActivePageId('');
      setDrafts({});
      setRepeatDrafts({});
      setWorkflowDrafts({});
      return;
    }
    setActivePageId(page.pageId);
    setDrafts(Object.fromEntries(page.fields.map((field) => [field.fieldId, field.disposition])));
    setRepeatDrafts(
      Object.fromEntries(
        page.fields.map((field) => [
          field.fieldId,
          field.repeatIndex === null || field.repeatEntityType === null
            ? null
            : { entityType: field.repeatEntityType, index: field.repeatIndex },
        ]),
      ),
    );
    setWorkflowDrafts(
      Object.fromEntries(
        page.workflowControls.map((control) => [control.workflowControlId, control.decision]),
      ),
    );
    setActiveFieldId(
      page.fields.find((field) => field.disposition === null)?.fieldId ??
        page.fields[0]?.fieldId ??
        '',
    );
    setDirty(false);
  }, []);

  useEffect(() => {
    void controller.current
      .restore()
      .then((restored) => {
        setSession(restored);
        if (restored) {
          setLineOfBusiness(restored.training.workflow.lineOfBusiness);
          setCarrierOrigin(restored.training.workflow.carrierOrigin);
          setCarrierBaseUrl(restored.training.workflow.carrierBaseUrl);
          loadPage(restored.training.pages.at(-1));
          setMessage('Training draft restored. Continue where you left off.');
        } else {
          void controller.current
            .carrierIdentity()
            .then((identity) => {
              setCarrierOrigin(identity.carrierOrigin);
              setCarrierBaseUrl(identity.carrierBaseUrl);
              setMessage('Choose a line of business for this carrier workflow.');
            })
            .catch(() => undefined);
        }
      })
      .catch((failure: unknown) =>
        setError(failure instanceof Error ? failure.message : 'Could not restore training.'),
      );
  }, [loadPage]);

  useEffect(() => {
    const listener = (input: unknown): void => {
      if (
        typeof input !== 'object' ||
        input === null ||
        !('type' in input) ||
        input.type !== 'smartmapper-training-field-selected' ||
        !('fieldId' in input) ||
        typeof input.fieldId !== 'string'
      )
        return;
      setActiveFieldId(input.fieldId);
      document.getElementById(`training-field-${input.fieldId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const persist = useCallback(async (): Promise<TrainingBrowserSession | null> => {
    if (!session || !activePage || !dirty || locked) return session;
    const generation = editGeneration.current;
    setSaving(true);
    try {
      const saved = await controller.current.savePage(
        activePage.pageId,
        Object.entries(drafts).flatMap(([fieldId, disposition]) =>
          disposition
            ? [{ fieldId, disposition, repeatBinding: repeatDrafts[fieldId] ?? null }]
            : [],
        ),
        Object.entries(workflowDrafts).flatMap(([workflowControlId, decision]) =>
          decision ? [{ workflowControlId, decision }] : [],
        ),
      );
      setSession(saved);
      if (generation === editGeneration.current) setDirty(false);
      return saved;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this training page.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [activePage, dirty, drafts, locked, repeatDrafts, session, workflowDrafts]);

  useEffect(() => {
    if (!dirty || saving || working || locked) return;
    const timer = setTimeout(() => void persist(), 900);
    return () => clearTimeout(timer);
  }, [dirty, locked, persist, saving, working]);

  const perform = async (operation: () => Promise<void>): Promise<void> => {
    setWorking(true);
    setError('');
    try {
      await operation();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Training could not complete this step.',
      );
    } finally {
      setWorking(false);
    }
  };

  const updateDisposition = (fieldId: string, disposition: MappingDisposition | null): void => {
    editGeneration.current += 1;
    setDrafts((current) => ({ ...current, [fieldId]: disposition }));
    setDirty(true);
  };

  const updateRepeatBinding = (fieldId: string, repeatBinding: RepeatBinding | null): void => {
    editGeneration.current += 1;
    setRepeatDrafts((current) => ({ ...current, [fieldId]: repeatBinding }));
    setDirty(true);
  };

  const currentUnmapped =
    activePage?.fields.filter(
      (field) =>
        !dispositionReady(field, drafts[field.fieldId] ?? null, repeatDrafts[field.fieldId]),
    ).length ?? 0;
  const currentWorkflowUndecided =
    activePage?.workflowControls.filter((control) => !workflowDrafts[control.workflowControlId])
      .length ?? 0;
  const savedUnmapped =
    session?.training.pages.reduce(
      (count, page) =>
        count +
        page.fields.filter((field) =>
          page.pageId === activePageId
            ? !dispositionReady(field, drafts[field.fieldId] ?? null, repeatDrafts[field.fieldId])
            : !dispositionReady(field, field.disposition),
        ).length,
      0,
    ) ?? 0;
  const savedWorkflowUndecided =
    session?.training.pages.reduce(
      (count, page) =>
        count +
        page.workflowControls.filter((control) =>
          page.pageId === activePageId
            ? !workflowDrafts[control.workflowControlId]
            : control.decision === null,
        ).length,
      0,
    ) ?? 0;

  return (
    <div className="training-panel">
      {!session && (
        <section>
          <h2>Start carrier training</h2>
          <p>
            SmartMapper will identify and number every eligible field on the active carrier page.
            Training stores field structure and mappings, never customer values.
          </p>
          <label htmlFor="training-lob">M.I.A. line of business</label>
          <select
            id="training-lob"
            value={lineOfBusiness}
            disabled={working}
            onChange={(event) => setLineOfBusiness(event.target.value as MappingLineOfBusiness)}
          >
            <option value="home">Home</option>
            <option value="auto">Auto (all supported drivers and vehicles)</option>
          </select>
          <label htmlFor="workflow-name">Carrier workflow name</label>
          <input
            id="workflow-name"
            readOnly
            value={
              carrierOrigin
                ? `${new URL(carrierOrigin).hostname} ${lineOfBusiness === 'home' ? 'Home' : 'Auto'} workflow`
                : ''
            }
          />
          <label htmlFor="carrier-origin">Carrier site origin</label>
          <input id="carrier-origin" readOnly value={carrierOrigin} />
          <label htmlFor="carrier-base-url">Carrier workflow base URL</label>
          <input id="carrier-base-url" value={carrierBaseUrl} readOnly />
          <p className="field-help">
            Training uses the carrier origin only, so quote or customer path segments are never
            stored.
          </p>
          <button
            disabled={!connected || working || !carrierBaseUrl.trim()}
            onClick={() =>
              void perform(async () => {
                const started = await controller.current.start(
                  lineOfBusiness,
                  undefined,
                  carrierBaseUrl,
                );
                setSession(started);
                setMessage('Reading and numbering the carrier fields…');
                const captured = await controller.current.capture('main');
                setSession(captured);
                loadPage(captured.training.pages.at(-1));
                setMessage(
                  'Page captured. Select how SmartMapper should handle each numbered field.',
                );
              })
            }
          >
            {working ? 'Starting training…' : 'Start training and capture this page'}
          </button>
        </section>
      )}

      {session && (
        <>
          <section className="training-summary" aria-live="polite">
            <h2>{session.training.workflow.workflowName}</h2>
            <p>
              {session.training.workflow.lineOfBusiness.toUpperCase()} ·{' '}
              {session.training.workflow.carrierOrigin}
            </p>
            <p className="field-help">Base URL: {session.training.workflow.carrierBaseUrl}</p>
            <p>
              {session.training.pages.length} captured page
              {session.training.pages.length === 1 ? '' : 's'} · {savedUnmapped} field
              {savedUnmapped === 1 ? '' : 's'} missing a disposition · {savedWorkflowUndecided}{' '}
              workflow control{savedWorkflowUndecided === 1 ? '' : 's'} awaiting a decision
            </p>
            <p className="save-state">
              {saving
                ? 'Saving draft…'
                : dirty
                  ? 'Unsaved changes'
                  : `Draft saved · revision ${session.training.revision}`}
            </p>
            <p>{message}</p>
          </section>

          {!!session.training.pages.length && (
            <section>
              <label htmlFor="training-page">Captured page or scenario</label>
              <select
                id="training-page"
                value={activePageId}
                disabled={working || saving}
                onChange={(event) => {
                  const next = session.training.pages.find(
                    (page) => page.pageId === event.target.value,
                  );
                  loadPage(next);
                  if (next) void controller.current.showPage(next);
                }}
              >
                {session.training.pages.map((page) => (
                  <option key={page.pageId} value={page.pageId}>
                    {pageLabel(page)}
                  </option>
                ))}
              </select>
              {activePage && (
                <>
                  <label htmlFor="scenario-label">Page/scenario label</label>
                  <input id="scenario-label" readOnly value={activePage.scenarioLabel} />
                </>
              )}
            </section>
          )}

          {activePage && (
            <section className="training-fields">
              <div className="section-heading">
                <div>
                  <h2>Carrier fields</h2>
                  <p>
                    {currentUnmapped} missing on this page. Click a numbered badge here or on the
                    carrier page.
                  </p>
                </div>
                <button
                  className="secondary compact"
                  disabled={working}
                  onClick={() => void controller.current.showPage(activePage)}
                >
                  Show numbers
                </button>
              </div>
              <ol className="field-list">
                {activePage.fields.map((field) => {
                  const value = drafts[field.fieldId] ?? null;
                  const ready = dispositionReady(field, value, repeatDrafts[field.fieldId]);
                  const active = field.fieldId === activeFieldId;
                  return (
                    <li
                      id={`training-field-${field.fieldId}`}
                      className={`training-field ${ready ? 'assigned' : 'unmapped'}${active ? ' active' : ''}`}
                      key={field.fieldId}
                    >
                      <button
                        type="button"
                        className="field-heading"
                        aria-expanded={active}
                        onClick={() => {
                          setActiveFieldId(active ? '' : field.fieldId);
                          void controller.current.focus(field.fieldId);
                        }}
                      >
                        <span className="field-number">{field.sequence}</span>
                        <span className="field-description">
                          <strong>
                            {carrierDisplayText(field.control.label, 'Private carrier label')}
                          </strong>
                          <small>{carrierFieldMetadata(field)}</small>
                          <small className={ready ? 'mapped-summary' : 'missing-summary'}>
                            {mappingSummary(value, session.catalog.fields)}
                          </small>
                        </span>
                      </button>
                      {active && !locked && (
                        <DispositionEditor
                          field={field}
                          value={value}
                          catalog={session.catalog.fields}
                          entityLimits={session.catalog.entityLimits}
                          repeatBinding={repeatDrafts[field.fieldId] ?? null}
                          onChange={(next) => updateDisposition(field.fieldId, next)}
                          onRepeatBinding={(next) => updateRepeatBinding(field.fieldId, next)}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {activePage && activePage.workflowControls.length > 0 && (
            <section className="training-fields workflow-controls">
              <div className="section-heading">
                <div>
                  <h2>Workflow controls</h2>
                  <p>
                    {currentWorkflowUndecided} awaiting review. Detection is only a suggestion;
                    SmartMapper cannot use a control until you explicitly approve it.
                  </p>
                </div>
              </div>
              <ol className="field-list">
                {activePage.workflowControls.map((control) => {
                  const decision = workflowDrafts[control.workflowControlId] ?? null;
                  const overlayId = `workflow-${control.workflowControlId}`;
                  return (
                    <li
                      id={`training-field-${overlayId}`}
                      className={`training-field ${decision ? 'assigned' : 'unmapped'}${activeFieldId === overlayId ? ' active' : ''}`}
                      key={control.workflowControlId}
                    >
                      <button
                        type="button"
                        className="field-heading"
                        onClick={() => {
                          setActiveFieldId(overlayId);
                          void controller.current.focus(overlayId);
                        }}
                      >
                        <span className="field-number">{control.sequence}</span>
                        <span className="field-description">
                          <strong>
                            {carrierDisplayText(control.control.label, 'Private workflow label')}
                          </strong>
                          <small>
                            {control.kind === 'ordinary_next'
                              ? 'Detected ordinary Next/Continue'
                              : `Detected Add ${control.entityType ?? 'entity'} control`}
                          </small>
                        </span>
                      </button>
                      {!locked && (
                        <label className="workflow-decision">
                          How should SmartMapper handle this control?
                          <select
                            value={decision ?? ''}
                            onChange={(event) => {
                              const value = event.target.value as '' | 'use' | 'ignore';
                              editGeneration.current += 1;
                              setWorkflowDrafts((current) => ({
                                ...current,
                                [control.workflowControlId]: value || null,
                              }));
                              setDirty(true);
                            }}
                          >
                            <option value="">Review required</option>
                            <option value="use">
                              {control.kind === 'ordinary_next'
                                ? 'Allow after a clean whole-page review'
                                : 'Allow when another M.I.A. record is needed'}
                            </option>
                            <option value="ignore">Never use this control</option>
                          </select>
                        </label>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {session.training.status === 'draft' && (
            <section>
              <h2>Continue training</h2>
              <p>
                Save this page, navigate the carrier yourself, then capture the next page or a
                revealed conditional scenario.
              </p>
              <div className="actions">
                <button
                  className="secondary"
                  disabled={!dirty || saving || working}
                  onClick={() => void persist()}
                >
                  {saving ? 'Saving…' : 'Save this page'}
                </button>
                <button
                  disabled={working || saving || dirty}
                  onClick={() =>
                    void perform(async () => {
                      const captured = await controller.current.capture('page');
                      setSession(captured);
                      loadPage(captured.training.pages.at(-1));
                      setMessage('Next page captured. Numbering continues from the prior page.');
                    })
                  }
                >
                  Capture next page
                </button>
                <button
                  className="secondary"
                  disabled={working || saving || dirty}
                  onClick={() =>
                    void perform(async () => {
                      const captured = await controller.current.capture('scenario');
                      setSession(captured);
                      loadPage(captured.training.pages.at(-1));
                      setMessage('Conditional scenario captured and added to this workflow.');
                    })
                  }
                >
                  Capture scenario
                </button>
              </div>
              <button
                className="complete-mapping"
                disabled={
                  working ||
                  saving ||
                  dirty ||
                  !session.training.pages.length ||
                  savedUnmapped > 0 ||
                  savedWorkflowUndecided > 0
                }
                onClick={() =>
                  void perform(async () => {
                    const published = await controller.current.publish();
                    setSession(published);
                    setMessage(
                      'Mapping is complete and saved as a testable version. Test it with a demo quote before activation.',
                    );
                  })
                }
              >
                Mapping complete
              </button>
              {(savedUnmapped > 0 || savedWorkflowUndecided > 0) && (
                <p className="field-help">
                  Assign every captured field and explicitly review every detected workflow control
                  before completing the mapping.
                </p>
              )}
              <button
                className="link-button danger-link"
                disabled={working}
                onClick={() =>
                  void perform(async () => {
                    await controller.current.cancel();
                    setSession(null);
                    setDrafts({});
                    setRepeatDrafts({});
                    setWorkflowDrafts({});
                    setActivePageId('');
                    setMessage('Training draft cancelled.');
                  })
                }
              >
                Cancel training draft
              </button>
            </section>
          )}

          {session.publishedMapping && (
            <section className="published-mapping">
              <h2>
                Mapping version {session.publishedMapping.mappingVersion}:{' '}
                {session.publishedMapping.status}
              </h2>
              <p>
                {session.publishedMapping.status === 'testable'
                  ? 'Run this exact testable version against every captured scenario. Successful values are still read back from the carrier page.'
                  : session.publishedMapping.status === 'verified'
                    ? 'Every captured scenario passed deterministic execution and browser read-back. This version is ready to activate.'
                    : 'This trained mapping is active for matching carrier workflows.'}
              </p>
              <div className="actions">
                {session.publishedMapping.status === 'testable' && (
                  <button
                    onClick={() =>
                      onTestMapping({
                        mappingId: session.publishedMapping!.mappingId,
                        mappingVersion: session.publishedMapping!.mappingVersion,
                      })
                    }
                  >
                    Test this mapping
                  </button>
                )}
                {session.publishedMapping.status === 'verified' && (
                  <button
                    className="secondary"
                    disabled={working}
                    onClick={() =>
                      void perform(async () => {
                        const activated = await controller.current.activate();
                        setSession(activated);
                        onTrainingResolved();
                        setMessage(
                          'This verified mapping version is now active for matching quotes.',
                        );
                      })
                    }
                  >
                    Activate verified mapping
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={working}
                  onClick={() =>
                    void perform(async () => {
                      await controller.current.finish();
                      onTrainingResolved();
                      setSession(null);
                      setDrafts({});
                      setRepeatDrafts({});
                      setWorkflowDrafts({});
                      setActivePageId('');
                      setMessage(
                        'Published mapping kept. You can start another training workflow.',
                      );
                      const identity = await controller.current.carrierIdentity();
                      setCarrierOrigin(identity.carrierOrigin);
                      setCarrierBaseUrl(identity.carrierBaseUrl);
                    })
                  }
                >
                  Finish training
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
