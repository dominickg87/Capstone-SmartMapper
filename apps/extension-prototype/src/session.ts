import { JobViewSchema } from '@smartmapper/contracts';
import { z } from 'zod';

export const SessionSchema = z.object({
  job: JobViewSchema,
  token: z.string(),
  windowId: z.number(),
  mappingSelection: z
    .object({
      mode: z.literal('testable'),
      mappingId: z.string().uuid(),
      mappingVersion: z.number().int().positive(),
      preview: z.boolean().optional(),
      formType: z.enum(['home', 'auto']).optional(),
    })
    .strict()
    .optional(),
});
export type JobSession = z.infer<typeof SessionSchema>;

export async function trustedStorage(): Promise<void> {
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}

export async function jobSession(): Promise<JobSession | null> {
  await trustedStorage();
  const stored: Record<string, unknown> = await chrome.storage.session.get('job');
  return stored.job ? SessionSchema.parse(stored.job) : null;
}

export async function saveSession(session: z.input<typeof SessionSchema>): Promise<void> {
  await trustedStorage();
  await chrome.storage.session.set({ job: SessionSchema.parse(session) });
}

export async function connectionDetails(): Promise<{
  connected: boolean;
  principal: string | null;
}> {
  await trustedStorage();
  const stored: Record<string, unknown> = await chrome.storage.session.get([
    'miaToken',
    'principal',
  ]);
  return {
    connected: typeof stored.miaToken === 'string',
    principal: typeof stored.principal === 'string' ? stored.principal : null,
  };
}

export async function miaToken(): Promise<string | null> {
  await trustedStorage();
  const stored: Record<string, unknown> = await chrome.storage.session.get('miaToken');
  return typeof stored.miaToken === 'string' ? stored.miaToken : null;
}
