import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PageObservationSchema } from '@smartmapper/contracts';
import { pageEvidence } from './page-evidence.js';
import { z } from 'zod';
const { page } = z
  .object({ page: PageObservationSchema })
  .parse(
    JSON.parse(readFileSync(resolve('fixtures/mia-quotes/active-tab.synthetic.json'), 'utf8')),
  );
describe('whole-page visual evidence', () => {
  it('sends every tile once with document offsets, keeping binary data out of the text manifest', () => {
    const observation = {
      ...page,
      coordinates: 'document' as const,
      capture: { complete: true, unexpanded: 0 },
      images: [
        { screenshot: page.screenshot!, x: 0, y: 0, width: 1000, height: 700 },
        { screenshot: page.screenshot!, x: 0, y: 600, width: 1000, height: 700 },
      ],
    };
    const evidence = pageEvidence(observation);
    expect(evidence.content.filter((item) => item.type === 'input_image')).toHaveLength(2);
    expect(evidence.content[2]).toMatchObject({
      type: 'input_text',
      text: expect.stringContaining('(0, 600)') as unknown,
    });
    expect(JSON.stringify(evidence.page)).not.toContain('data:image');
    expect(evidence.page.controls).toEqual(page.controls);
    expect(evidence.page.capture?.complete).toBe(true);
  });
});
