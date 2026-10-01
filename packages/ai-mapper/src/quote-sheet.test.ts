import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import {
  PageObservationSchema,
  SourceAnswersSchema,
  type SmartMapperObservation,
} from '@smartmapper/contracts';
import { AstraMapperProvider } from './astra.js';
import { documentSources, expandDocumentPlan, quoteSheetContent } from './quote-sheet.js';

const raw = JSON.parse(
  readFileSync('fixtures/mia-quotes/active-tab.synthetic.json', 'utf8'),
) as Record<string, unknown>;
const source = SourceAnswersSchema.parse(raw.source);
const page = PageObservationSchema.parse(raw.page);
const bytes = Buffer.from('%PDF-1.4\nSynthetic test fixture');
const document = {
  tenantId: source.tenantId,
  userId: source.userId,
  quoteId: source.quoteId,
  revision: source.revision,
  digest: createHash('sha256').update(bytes).digest('hex'),
  data: bytes.toString('base64'),
};
const plan = {
  version: '2.0',
  pageStateId: page.pageStateId,
  outcome: 'act',
  reviews: [],
  actions: [
    {
      type: 'fill',
      elementId: page.controls[0]!.elementId,
      sourceAnswerIds: ['d0'],
      value: 'Alex',
      confidence: 0.99,
      transformation: { kind: 'identity', explanation: 'Printed first name' },
    },
  ],
  documentAnswers: [
    { answerId: 'd0', page: 1, question: 'First Name', entity: 'Applicant 1', value: 'Alex' },
  ],
};

describe('PDF quote sheet planning', () => {
  it('sends the PDF directly to planning, verification and chat, without embedding binary in JSON text or storing responses', async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = new OpenAI({
      apiKey: 'synthetic',
      maxRetries: 0,
      baseURL: 'https://synthetic.test/openai/v1/',
      fetch: (_url, init) => {
        if (typeof init?.body !== 'string') throw new Error('expected_json_body');
        const body = JSON.parse(init.body) as Record<string, unknown>;
        bodies.push(body);
        const output =
          bodies.length === 1
            ? plan
            : bodies.length === 2
              ? {
                  results: [
                    { i: 0, clear: true, same: true, facts: true, sources: false, human: false },
                  ],
                }
              : { version: '2.0', reply: 'Please check the quote sheet.' };
        return Promise.resolve(
          Response.json({
            id: 'resp_test',
            object: 'response',
            status: 'completed',
            output: [
              {
                id: 'msg_test',
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }],
              },
            ],
          }),
        );
      },
    });
    const mapper = new AstraMapperProvider(
      {
        baseURL: 'https://synthetic.test/openai/v1/',
        deployment: 'smartmapper-astra-dev',
        defaultEffort: 'low',
        escalationEffort: 'max',
      },
      client,
    );
    const request: SmartMapperObservation = {
      source: { ...source, answers: [], sourceFormat: 'pdf' },
      document,
      page,
      attempts: {},
      recentResults: [],
      verifiedControls: [],
    };
    const proposed = await mapper.proposeMappings(request);
    const sources = documentSources(proposed, document);
    expect(sources[0]!.sourcePath).toContain(document.digest + ':page:1');
    expect(proposed.actions[0]!.sourceAnswerIds).toEqual([sources[0]!.answerId]);
    expect(
      await mapper.verify(proposed.actions[0]!, page.controls[0]!, sources, page, document),
    ).toEqual({ approved: false, reason: 'source_mismatch' });
    await mapper.discussMapping({
      page,
      source: request.source,
      document,
      conversation: [{ role: 'user', text: 'Explain the source.' }],
      recentResults: [],
    });
    for (const body of bodies) {
      expect(body.store).toBe(false);
      expect(body.tools).toBeUndefined();
      const content = (body.input as { content: Record<string, unknown>[] }[])[0]!.content;
      expect(content.filter((item) => item.type === 'input_file')).toEqual([
        {
          type: 'input_file',
          filename: 'mia-quote-sheet.pdf',
          file_data: 'data:application/pdf;base64,' + document.data,
        },
      ]);
      expect(
        content
          .filter((item) => item.type === 'input_text')
          .some((item) => String(item.text).includes(document.data)),
      ).toBe(false);
    }
    expect(bodies[1]!.instructions).toContain('UNVERIFIED model transcriptions');
    const verificationContent = (bodies[1]!.input as { content: Record<string, unknown>[] }[])[0]!
      .content;
    expect(verificationContent[0]!.type).toBe('input_file');
    expect(verificationContent[1]!.text).toContain('sourceDocument');
    expect(sources[0]!.documentEvidence).toEqual({ digest: document.digest, page: 1 });
    await expect(
      mapper.verify(proposed.actions[0]!, page.controls[0]!, sources, page),
    ).rejects.toThrow('quote_sheet_required');
    expect(bodies).toHaveLength(3);
  });

  it('rejects corrupt PDFs, unknown or duplicate citations, and treats N/A as missing', () => {
    expect(() => quoteSheetContent({ ...document, digest: '0'.repeat(64) })).toThrow(
      'invalid_quote_sheet',
    );
    expect(() => expandDocumentPlan({ ...plan, documentAnswers: [] }, document)).toThrow(
      'unknown_source_alias',
    );
    expect(() =>
      expandDocumentPlan(
        { ...plan, documentAnswers: [...plan.documentAnswers, ...plan.documentAnswers] },
        document,
      ),
    ).toThrow('duplicate_document_citation');
    const missing = expandDocumentPlan(
      { ...plan, documentAnswers: [{ ...plan.documentAnswers[0], value: 'N/A' }] },
      document,
    );
    expect(documentSources(missing, document)[0]!.status).toBe('missing');
  });
});
