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
import { AstraMapperProvider } from './astra.js';

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
  it('uses the deployment, screenshot, question context, strict schema, high/max reasoning and store:false', async () => {
    const bodies: Record<string, unknown>[] = [];
    const result = {
      version: '2.0',
      pageStateId: 'page-1',
      outcome: 'act',
      actions: [fixture.action],
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
        defaultEffort: 'high',
        escalationEffort: 'max',
      },
      client,
    );
    const request = {
      page: fixture.page,
      source: fixture.source,
      attempts: {},
      recentResults: [],
      verifiedControls: [],
    };
    expect(await mapper.proposeMappings(request)).toEqual(result);
    expect(bodies[0]).toMatchObject({
      model: 'smartmapper-astra-dev',
      store: false,
      reasoning: { effort: 'high' },
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(JSON.stringify(bodies[0]?.input)).toContain('First Name');
    expect(JSON.stringify(bodies[0]?.input)).toContain('input_image');
    await mapper.proposeMappings({
      ...request,
      recentResults: [
        { actionId: 'prior', status: 'failed', reason: 'validation_error', observedHash: null },
      ],
    });
    expect(bodies[1]?.reasoning).toEqual({ effort: 'max' });
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
