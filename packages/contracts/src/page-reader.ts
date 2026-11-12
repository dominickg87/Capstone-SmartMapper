import { z } from 'zod';

export const ReadPageFieldSchema = z
  .object({
    key: z.string().uuid(),
    number: z.number().int().positive(),
    label: z.string().max(500),
    type: z.string().max(40),
    section: z.string().max(500),
    name: z.string().max(240),
    id: z.string().max(240),
    required: z.boolean(),
    disabled: z.boolean(),
    readOnly: z.boolean(),
    visible: z.boolean(),
    frame: z.number().int().nonnegative(),
    choices: z
      .array(z.object({ label: z.string().max(500), disabled: z.boolean() }).strict())
      .max(500),
    choicesIncomplete: z.boolean(),
  })
  .strict();
export type ReadPageField = z.infer<typeof ReadPageFieldSchema>;

export const ReadPageDataSchema = z
  .object({
    pageOrigin: z.string().max(2000),
    fields: z.array(ReadPageFieldSchema).max(1500),
    inaccessibleFrames: z.number().int().nonnegative(),
    unreadableControls: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict();
export type ReadPageData = z.infer<typeof ReadPageDataSchema>;
