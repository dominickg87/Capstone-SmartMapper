import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import type { CarrierWorkflowIdentity, MappingProfile } from '@smartmapper/contracts';
import { MemoryMappingRegistryStore } from './mapping-registry.js';

const now = new Date().toISOString();
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const semanticHash = (value: string): string => `sha256:${digest(value.toLowerCase())}`;

function draft(
  workflow: Partial<CarrierWorkflowIdentity> = {},
): Omit<MappingProfile, 'mappingVersion' | 'status' | 'publishedAt'> {
  const mappingId = crypto.randomUUID();
  const fields = [crypto.randomUUID(), crypto.randomUUID()];
  const target = {
    signature: 'a'.repeat(64),
    occurrence: 0,
    repeatIndex: null,
    repeatEntityType: null,
    groupKey: null,
    tag: 'input' as const,
    inputType: 'text',
    role: 'textbox',
    label: semanticHash('Agency code'),
    section: semanticHash('Agency'),
    context: [],
    required: true,
    humanOnly: false,
    choiceGroup: null,
    choiceValue: null,
    operationalTarget: 'agency_operational' as const,
    options: [],
  };
  return {
    version: '2.0',
    mappingId,
    tenantId: 'tenant',
    createdByUserId: 'user',
    workflow: {
      carrierOrigin: 'https://carrier.test',
      carrierBaseUrl: 'https://carrier.test',
      workflowName: 'Auto workflow',
      lineOfBusiness: 'auto',
      ...workflow,
    },
    catalogRevision: 'catalog-1',
    entityLimits: [],
    pages: [1, 2].map((sequence) => ({
      pageId: crypto.randomUUID(),
      sequence,
      scenarioLabel: `Page ${sequence}`,
      routeId: digest(`route-${sequence}`),
      signature: String(sequence).repeat(64),
      fields: [
        {
          fieldId: fields[sequence - 1]!,
          sequence,
          target,
          disposition: {
            kind: 'fixed_value' as const,
            value: `operational-${sequence}`,
            classification: 'agency_operational' as const,
            reason: 'approved_agency_identifier' as const,
          },
        },
      ],
      workflowControls: [],
    })),
    verification: {
      coveredPageIds: [],
      coveredFieldIds: [],
      coveredWorkflowControlIds: [],
      evidenceDigests: [],
      lastVerifiedAt: null,
    },
    createdAt: now,
  };
}

describe('mapping registry lifecycle', () => {
  async function verify(
    registry: MemoryMappingRegistryStore,
    mapping: MappingProfile,
    evidenceCharacter: string,
  ): Promise<MappingProfile> {
    return registry.recordVerification(
      {
        tenantId: mapping.tenantId,
        carrierOrigin: mapping.workflow.carrierOrigin,
        lineOfBusiness: mapping.workflow.lineOfBusiness,
      },
      mapping.mappingId,
      mapping.mappingVersion,
      {
        pageIds: mapping.pages.map((page) => page.pageId),
        fieldIds: mapping.pages.flatMap((page) => page.fields.map((field) => field.fieldId)),
        workflowControlIds: mapping.pages.flatMap((page) =>
          page.workflowControls.map((control) => control.workflowControlId),
        ),
        evidenceDigest: evidenceCharacter.repeat(64),
      },
    );
  }

  it('accumulates redacted coverage across clean test jobs before allowing activation', async () => {
    const registry = new MemoryMappingRegistryStore();
    const published = await registry.publish(draft());
    const scope = {
      tenantId: published.tenantId,
      carrierOrigin: published.workflow.carrierOrigin,
      lineOfBusiness: published.workflow.lineOfBusiness,
    };
    await expect(registry.setActive(scope, published.mappingId, 1)).rejects.toThrow(
      'mapping_not_verified',
    );
    const first = await registry.recordVerification(scope, published.mappingId, 1, {
      pageIds: [published.pages[0]!.pageId],
      fieldIds: [published.pages[0]!.fields[0]!.fieldId],
      workflowControlIds: [],
      evidenceDigest: 'b'.repeat(64),
    });
    expect(first.status).toBe('testable');
    const second = await registry.recordVerification(scope, published.mappingId, 1, {
      pageIds: [published.pages[1]!.pageId],
      fieldIds: [published.pages[1]!.fields[0]!.fieldId],
      workflowControlIds: [],
      evidenceDigest: 'c'.repeat(64),
    });
    expect(second.status).toBe('verified');
    expect(second.verification.coveredPageIds).toHaveLength(2);
    await expect(registry.setActive(scope, published.mappingId, 1)).resolves.toMatchObject({
      status: 'active',
    });
  });

  it('serializes concurrent verification updates without losing scenario coverage', async () => {
    const registry = new MemoryMappingRegistryStore();
    const published = await registry.publish(draft());
    const scope = {
      tenantId: published.tenantId,
      carrierOrigin: published.workflow.carrierOrigin,
      lineOfBusiness: published.workflow.lineOfBusiness,
    };
    await Promise.all(
      published.pages.map((page, index) =>
        registry.recordVerification(scope, published.mappingId, published.mappingVersion, {
          pageIds: [page.pageId],
          fieldIds: page.fields.map((field) => field.fieldId),
          workflowControlIds: [],
          evidenceDigest: String(index + 2).repeat(64),
        }),
      ),
    );
    const final = await registry.get(scope, published.mappingId, published.mappingVersion);
    expect(final?.status).toBe('verified');
    expect(final?.verification.coveredPageIds).toEqual(
      expect.arrayContaining(published.pages.map((page) => page.pageId)),
    );
    expect(final?.verification.coveredFieldIds).toEqual(
      expect.arrayContaining(
        published.pages.flatMap((page) => page.fields.map((field) => field.fieldId)),
      ),
    );
  });

  it('uses generated origin-scoped workflow metadata and rejects arbitrary variants', async () => {
    const registry = new MemoryMappingRegistryStore();
    await expect(
      registry.publish(draft({ workflowName: 'Customer supplied name' })),
    ).rejects.toThrow('unsafe_mapping_workflow_metadata');
    await expect(
      registry.publish(draft({ carrierBaseUrl: 'https://carrier.test/quote' })),
    ).rejects.toThrow('unsafe_mapping_workflow_metadata');
    await expect(registry.publish(draft({ stateCode: 'LA', productCode: 'HO3' }))).rejects.toThrow(
      'unsafe_mapping_workflow_metadata',
    );
    const unsafeRoute = draft();
    unsafeRoute.pages[0]!.routeId = 'customer-route-sentinel';
    await expect(registry.publish(unsafeRoute)).rejects.toThrow('unsafe_mapping_route_metadata');
  });

  it('rejects unhashed carrier metadata, choice outputs and forged operational classifications', async () => {
    const registry = new MemoryMappingRegistryStore();
    const rawTarget = draft();
    rawTarget.pages[0]!.fields[0]!.target.label = 'Customer supplied carrier label';
    await expect(registry.publish(rawTarget)).rejects.toThrow('unsafe_mapping_target_metadata');

    const rawChoice = draft();
    rawChoice.pages[0]!.fields[0]!.disposition = {
      kind: 'source',
      references: [
        {
          binding: 'fixed',
          sourcePath: 'policy.form',
          sourcePathPattern: 'policy.form',
        },
      ],
      transform: { kind: 'enum', cases: [{ source: 'HO3', target: 'carrier-option' }] },
    };
    await expect(registry.publish(rawChoice)).rejects.toThrow('unsafe_enum_mapping_target');

    const forged = draft();
    forged.pages[0]!.fields[0]!.target.operationalTarget = 'carrier_operational';
    await expect(registry.publish(forged)).rejects.toThrow(
      'unsafe_operational_target_classification',
    );
  });

  it('keeps exactly one active version in the origin-and-line activation slot', async () => {
    const registry = new MemoryMappingRegistryStore();
    const first = await registry.publish(draft());
    const second = await registry.publish(draft());
    expect(second.mappingId).toBe(first.mappingId);
    expect(second.mappingVersion).toBe(2);
    const verifiedFirst = await verify(registry, first, 'd');
    const verifiedSecond = await verify(registry, second, 'e');
    const scope = {
      tenantId: first.tenantId,
      carrierOrigin: first.workflow.carrierOrigin,
      lineOfBusiness: first.workflow.lineOfBusiness,
    };
    await registry.setActive(scope, verifiedFirst.mappingId, verifiedFirst.mappingVersion);
    await registry.setActive(scope, verifiedSecond.mappingId, verifiedSecond.mappingVersion);

    const profiles = await registry.list(scope);
    expect(
      profiles.find(
        (profile) =>
          profile.mappingId === verifiedFirst.mappingId &&
          profile.mappingVersion === verifiedFirst.mappingVersion,
      )?.status,
    ).toBe('superseded');
    expect(
      profiles.find(
        (profile) =>
          profile.mappingId === verifiedSecond.mappingId &&
          profile.mappingVersion === verifiedSecond.mappingVersion,
      )?.status,
    ).toBe('active');
    await expect(registry.resolveActive(scope)).resolves.toMatchObject({
      mappingId: verifiedSecond.mappingId,
      mappingVersion: verifiedSecond.mappingVersion,
    });
  });
});
