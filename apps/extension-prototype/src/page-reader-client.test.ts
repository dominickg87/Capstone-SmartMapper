import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadPageDataSchema } from '@smartmapper/contracts';
import { readActivePage } from './page-reader-client.js';

afterEach(() => vi.unstubAllGlobals());
const empty = {
  pageOrigin: 'https://carrier.example.test',
  fields: [],
  inaccessibleFrames: 0,
  unreadableControls: 0,
  truncated: false,
};
function browser() {
  const query = vi.fn(() =>
    Promise.resolve([{ id: 3, url: 'https://carrier.example.test/quote' }]),
  );
  const executeScript = vi.fn(() => Promise.resolve([{ frameId: 0, result: empty }]));
  vi.stubGlobal('chrome', { tabs: { query }, scripting: { executeScript } });
  return { query, executeScript };
}
describe('local page reader', () => {
  it('reads only the bound active tab in the isolated world', async () => {
    const { executeScript } = browser();
    await expect(readActivePage(3)).resolves.toEqual(empty);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 3, frameIds: [0] },
        world: 'ISOLATED',
        args: [true],
      }),
    );
  });
  it('rejects an inactive tab without injecting a script', async () => {
    const { executeScript } = browser();
    await expect(readActivePage(8)).rejects.toThrow(/toolbar/);
    expect(executeScript).not.toHaveBeenCalled();
  });
  it('rejects restricted pages without injecting a script', async () => {
    const { query, executeScript } = browser();
    query.mockResolvedValue([{ id: 3, url: 'chrome://extensions' }]);
    await expect(readActivePage(3)).rejects.toThrow(/website page/);
    expect(executeScript).not.toHaveBeenCalled();
  });
  it('discards results after navigation', async () => {
    const { query } = browser();
    query.mockResolvedValueOnce([{ id: 3, url: 'https://carrier.example.test/quote' }]);
    query.mockResolvedValue([{ id: 3, url: 'https://carrier.example.test/changed' }]);
    await expect(readActivePage(3)).rejects.toThrow(/changed while reading/);
  });
  it('reports permission failures without exposing browser error details', async () => {
    const { executeScript } = browser();
    executeScript.mockRejectedValue(new Error('synthetic-private-browser-detail'));
    await expect(readActivePage(3)).rejects.toThrow(/Chrome could not read/);
    await expect(readActivePage(3)).rejects.not.toThrow(/synthetic-private/);
  });
  it('rejects answer-bearing results instead of displaying them', () => {
    expect(ReadPageDataSchema.safeParse({ ...empty, token: 'synthetic' }).success).toBe(false);
    expect(
      ReadPageDataSchema.safeParse({ ...empty, fields: [{ number: 1, value: 'synthetic-answer' }] })
        .success,
    ).toBe(false);
  });
});
