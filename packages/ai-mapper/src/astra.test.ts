import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import OpenAI from 'openai';
import { z } from 'zod';
import {
  AutomationActionV2Schema,
  PageObservationSchema,
  SourceAnswersSchema,
} from '@smartmapper/contracts';
import { AstraMapperProvider, type ModelTiming } from './astra.js';

const fixture = z
  .object({
    source: SourceAnswersSchema,
    page: PageObservationSchema,
    action: AutomationActionV2Schema,
  })
  .parse(
    JSON.parse(readFileSync(resolve('fixtures/mia-quotes/active-tab.synthetic.json'), 'utf8')),
  );
describe('Azure Responses adapter', () => {
  it('independently checks an unlabeled target with the current screenshot, nearby controls and original Q&A', async () => {
    const bodies: Record<string, unknown>[] = [];
    const approved = {
      i: 0,
      clear: true,
      same: true,
      facts: true,
      sources: true,
      human: false,
    };
    let result: Record<string, unknown> = approved;
    let sectionResults: Record<string, unknown>[] | undefined;
    const client = new OpenAI({
      apiKey: 'synthetic',
      maxRetries: 0,
      baseURL: 'https://synthetic.test/openai/v1/',
      fetch: (_input, init) => {
        if (typeof init?.body !== 'string') throw new Error('expected_body');
        bodies.push(JSON.parse(init.body) as Record<string, unknown>);
        return Promise.resolve(
          Response.json({
            id: 'resp_verify',
            object: 'response',
            status: 'completed',
            output: [
              {
                id: 'msg_verify',
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({ results: sectionResults ?? [result] }),
                    annotations: [],
                  },
                ],
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
        defaultEffort: 'high',
        escalationEffort: 'max',
      },
      client,
    );
    const target = { ...fixture.page.controls[0]!, label: '' };
    const neighbor = { ...target, elementId: 'e1', key: 'middle-initial', label: 'M.I.' };
    const page = { ...fixture.page, controls: [target, neighbor] };
    const verify = () => mapper.verify(fixture.action, target, fixture.source.answers, page);
    expect(await verify()).toEqual({ approved: true });
    expect(bodies[0]).toMatchObject({
      store: false,
      model: 'smartmapper-astra-dev',
      text: { format: { type: 'json_schema', strict: true } },
    });
    const input = bodies[0]?.input as {
      content: { type: string; text?: string; image_url?: string }[];
    }[];
    expect(input[0]?.content[1]).toEqual({
      type: 'input_image',
      image_url: page.screenshot,
      detail: 'high',
    });
    expect(JSON.parse(input[0]!.content[0]!.text!)).toEqual({
      page: { ...page, screenshot: undefined },
      entries: [
        {
          i: 0,
          action: fixture.action,
          targetQuestion: target,
          originalQuestionsAndAnswers: fixture.source.answers,
        },
      ],
    });
    expect(input[0]!.content[0]!.text).not.toContain('data:image');
    expect(bodies[0]?.previous_response_id).toBeUndefined();
    expect(bodies[0]?.tools).toBeUndefined();
    for (const field of ['same', 'facts', 'sources']) {
      result = { ...approved, [field]: false };
      expect(await verify()).toEqual({ approved: false, reason: 'source_mismatch' });
    }
    result = { ...approved, clear: false, human: true };
    expect(await verify()).toEqual({ approved: false, reason: 'missing_question_context' });
    result = { ...approved, human: true };
    expect(await verify()).toEqual({ approved: false, reason: 'ambiguous_match' });
    result = { ...approved, actions: [fixture.action] };
    await expect(verify()).rejects.toThrow();
    const entries = [
      { action: fixture.action, control: target, sources: fixture.source.answers },
      {
        action: { ...fixture.action, actionId: 'action-2', elementId: neighbor.elementId },
        control: neighbor,
        sources: fixture.source.answers,
      },
    ];
    const callsBeforeSection = bodies.length;
    sectionResults = [{ ...approved, i: 1, facts: false }, approved];
    expect(await mapper.verifySection(entries, page)).toEqual([
      { approved: true },
      { approved: false, reason: 'source_mismatch' },
    ]);
    expect(bodies).toHaveLength(callsBeforeSection + 1);
    for (const malformed of [[approved], [approved, approved], [approved, { ...approved, i: 2 }]]) {
      sectionResults = malformed;
      await expect(mapper.verifySection(entries, page)).rejects.toThrow(
        'verification_result_mismatch',
      );
    }
    const requests = bodies.length;
    await expect(
      mapper.verify(fixture.action, target, fixture.source.answers, { ...page, screenshot: null }),
    ).rejects.toThrow('screenshot_required');
    await expect(
      mapper.verify(
        { ...fixture.action, pageStateId: 'stale' },
        target,
        fixture.source.answers,
        page,
      ),
    ).rejects.toThrow('verification_target_mismatch');
    await expect(
      mapper.verify(fixture.action, neighbor, fixture.source.answers, page),
    ).rejects.toThrow('verification_target_mismatch');
    expect(bodies).toHaveLength(requests);
  });
  it('sends bounded conversational context with a screenshot and rejects action-bearing chat replies', async () => {
    const bodies: Record<string, unknown>[] = [];
    let result: Record<string, unknown> = {
      version: '2.0',
      reply: 'I will recheck the selected applicant on Resume.',
    };
    const client = new OpenAI({
      apiKey: 'synthetic',
      maxRetries: 0,
      baseURL: 'https://synthetic.test/openai/v1/',
      fetch: (_input, init) => {
        if (typeof init?.body !== 'string') throw new Error('expected_body');
        bodies.push(JSON.parse(init.body) as Record<string, unknown>);
        return Promise.resolve(
          Response.json({
            id: 'resp_chat',
            object: 'response',
            status: 'completed',
            output: [
              {
                id: 'msg_chat',
                type: 'message',
                role: 'assistant',
                status: 'completed',
                content: [{ type: 'output_text', text: JSON.stringify(result), annotations: [] }],
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
        defaultEffort: 'high',
        escalationEffort: 'max',
      },
      client,
    );
    const request = {
      page: fixture.page,
      source: fixture.source,
      recentResults: [],
      conversation: [{ role: 'user' as const, text: 'That field belongs to the applicant.' }],
    };
    expect(await mapper.discussMapping(request)).toEqual(result);
    expect(bodies[0]).toMatchObject({
      model: 'smartmapper-astra-dev',
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(JSON.stringify(bodies[0]?.input)).toContain('That field belongs to the applicant.');
    expect(JSON.stringify(bodies[0]?.input)).toContain('input_image');
    expect(bodies[0]?.tools).toBeUndefined();
    expect(bodies[0]?.previous_response_id).toBeUndefined();
    result = { ...result, actions: [fixture.action] };
    await expect(mapper.discussMapping(request)).rejects.toThrow();
    await expect(
      mapper.discussMapping({ ...request, page: { ...fixture.page, screenshot: null } }),
    ).rejects.toThrow('screenshot_required');
  });
  it('expands compact output, uses configured low/max reasoning and retains screenshot, source context and store:false', async () => {
    const bodies: Record<string, unknown>[] = [];
    const timings: ModelTiming[] = [];
    const result = {
      version: '2.0',
      pageStateId: 'page-1',
      outcome: 'act',
      actions: [
        {
          type: 'fill',
          elementId: fixture.action.elementId,
          sourceAnswerIds: ['s0'],
          value: fixture.action.value,
          confidence: fixture.action.confidence,
          transformation: fixture.action.transformation,
        },
      ],
      reviews: [],
    };
    const client = new OpenAI({
      apiKey: 'synthetic-key',
      baseURL: 'https://synthetic.test/openai/v1/',
      maxRetries: 0,
      fetch: (_input, init) => {
        if (typeof init?.body !== 'string') throw new Error('expected_json_body');
        bodies.push(JSON.parse(init.body) as Record<string, unknown>);
        return Promise.resolve(
          Response.json({
            id: 'resp_test',
            object: 'response',
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                status: 'completed',
                id: 'msg_test',
                content: [{ type: 'output_text', text: JSON.stringify(result), annotations: [] }],
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
      (timing) => {
        timings.push(timing);
      },
    );
    const request = {
      page: fixture.page,
      source: fixture.source,
      attempts: {},
      recentResults: [],
      verifiedControls: [],
    };
    const proposal = await mapper.proposeMappings(request);
    expect(proposal.actions[0]?.actionId).toEqual(expect.any(String));
    expect(proposal).toEqual({
      ...result,
      actions: [{ ...fixture.action, actionId: proposal.actions[0]?.actionId }],
    });
    expect(bodies[0]).toMatchObject({
      model: 'smartmapper-astra-dev',
      store: false,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(JSON.stringify(bodies[0]?.input)).toContain('First Name');
    expect(JSON.stringify(bodies[0]?.input)).toContain('input_image');
    expect(timings[0]).toEqual({
      stage: 'plan',
      elapsedMs: timings[0]?.elapsedMs,
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      serviceTier: 'unknown',
    });
    expect(timings[0]?.elapsedMs).toBeGreaterThanOrEqual(0);
    await mapper.proposeMappings({
      ...request,
      recentResults: [
        { actionId: 'prior', status: 'failed', reason: 'validation_error', observedHash: null },
      ],
    });
    expect(bodies[1]?.reasoning).toEqual({ effort: 'max' });
    await mapper.proposeMappings({
      ...request,
      recentResults: [
        {
          actionId: 'revealed-field',
          status: 'blocked',
          reason: 'page_changed',
          observedHash: null,
        },
      ],
    });
    expect(bodies[2]?.reasoning).toEqual({ effort: 'low' });
  });
  it('refuses to plan without a fresh screenshot', async () => {
    const mapper = new AstraMapperProvider(
      {
        baseURL: 'https://synthetic.test/openai/v1/',
        deployment: 'synthetic',
        defaultEffort: 'high',
        escalationEffort: 'max',
      },
      new OpenAI({ apiKey: 'synthetic' }),
    );
    await expect(
      mapper.proposeMappings({
        page: { ...fixture.page, screenshot: null },
        source: fixture.source,
        attempts: {},
        recentResults: [],
        verifiedControls: [],
      }),
    ).rejects.toThrow('screenshot_required');
  });
});
