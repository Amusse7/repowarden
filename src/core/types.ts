import { z } from 'zod';
import type { GitHubClient } from './github-client.js';

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

/** Lower weight sorts first (most severe first). */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const CategorySchema = z.enum(['secrets', 'dependencies', 'repo-settings', 'actions']);
export type Category = z.infer<typeof CategorySchema>;

export const FileLocationSchema = z.object({
  path: z.string(),
  line: z.number().int().positive().optional(),
});
export type FileLocation = z.infer<typeof FileLocationSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: SeveritySchema,
  category: CategorySchema,
  description: z.string(),
  location: FileLocationSchema.optional(),
  remediation: z.string(),
  cweId: z.string().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

/**
 * Deterministic Finding ID: `${checkId}:${path}:${line}` when a line is known,
 * `${checkId}:${path}` when only the path is known, else just the check ID.
 * Keeps re-runs of the same check on the same repo producing stable IDs.
 */
export function buildFindingId(checkId: string, location?: FileLocation): string {
  if (!location) return checkId;
  if (location.line !== undefined) return `${checkId}:${location.path}:${location.line}`;
  return `${checkId}:${location.path}`;
}

export interface CheckContext {
  owner: string;
  repo: string;
  client: GitHubClient;
}

export interface Check {
  id: string;
  name: string;
  category: Category;
  run(context: CheckContext): Promise<Finding[]>;
}
