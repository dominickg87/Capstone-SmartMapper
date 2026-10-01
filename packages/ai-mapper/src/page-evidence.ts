import type { PageObservation } from '@smartmapper/contracts';
import type OpenAI from 'openai';

export function pageEvidence(observation: PageObservation) {
  const { screenshot, images, ...page } = observation;
  if (!screenshot) throw new Error('screenshot_required');
  const content: OpenAI.Responses.ResponseInputContent[] = images?.length
    ? images.flatMap((image, index): OpenAI.Responses.ResponseInputContent[] => [
        {
          type: 'input_text',
          text: `Page image ${index + 1}: document offset (${image.x}, ${image.y}), viewport ${image.width} x ${image.height}. Control rectangles use document coordinates.`,
        },
        { type: 'input_image', image_url: image.screenshot, detail: 'high' },
      ])
    : [{ type: 'input_image', image_url: screenshot, detail: 'high' }];
  return { page, content };
}
