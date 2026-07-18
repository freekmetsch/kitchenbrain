import { z } from 'zod';
import { isIsoDate } from '$lib/week';

/** Shared request/tool schema for a real YYYY-MM-DD calendar date. */
export const isoDateSchema = z.string().refine(isIsoDate, 'Expected a valid date in YYYY-MM-DD format');
