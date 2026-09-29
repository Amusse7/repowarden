import type {
  BranchProtection,
  GitHubClientLike,
  RepoData,
  WorkflowPermissions,
} from '../../src/core/github-client.js';

/**
 * A "clean" repo by default: protected default branch, reviews required,
 * admins enforced, no force pushes, status checks required, security
 * features enabled. Individual tests override only the fields they're
 * exercising.
 */
export function makeFakeRepoData(overrides: Partial<RepoData> = {}): RepoData {
  return {
    default_branch: 'main',
    private: false,
    permissions: { admin: true, push: true, pull: true },
    security_and_analysis: {
      secret_scanning: { status: 'enabled' },
      secret_scanning_push_protection: { status: 'enabled' },
    },
    ...overrides,
  } as RepoData;
}

interface FakeBranchProtectionOverrides {
  required_status_checks?: BranchProtection['required_status_checks'];
  required_pull_request_reviews?: Partial<NonNullable<BranchProtection['required_pull_request_reviews']>>;
  enforce_admins?: Partial<NonNullable<BranchProtection['enforce_admins']>>;
  allow_force_pushes?: Partial<NonNullable<BranchProtection['allow_force_pushes']>>;
}

/** Nested settings objects (enforce_admins, etc.) are shallow-merged with the defaults, so overrides only need the field(s) under test — not the whole nested shape (e.g. its `url`). */
export function makeFakeBranchProtection(overrides: FakeBranchProtectionOverrides = {}): BranchProtection {
  return {
    required_status_checks:
      'required_status_checks' in overrides
        ? overrides.required_status_checks
        : { strict: true, contexts: ['ci'], checks: [{ context: 'ci', app_id: null }] },
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      ...overrides.required_pull_request_reviews,
    },
    enforce_admins: { enabled: true, ...overrides.enforce_admins },
    allow_force_pushes: { enabled: false, ...overrides.allow_force_pushes },
  } as BranchProtection;
}

export function makeFakeWorkflowPermissions(overrides: Partial<WorkflowPermissions> = {}): WorkflowPermissions {
  return {
    default_workflow_permissions: 'read',
    can_approve_pull_request_reviews: false,
    ...overrides,
  } as WorkflowPermissions;
}

export function makeFakeClient(overrides: Partial<GitHubClientLike> = {}): GitHubClientLike {
  return {
    getRepo: () => Promise.resolve(makeFakeRepoData()),
    getBranchProtection: () => Promise.resolve(makeFakeBranchProtection()),
    getVulnerabilityAlertsEnabled: () => Promise.resolve(true),
    getWorkflowPermissions: () => Promise.resolve(makeFakeWorkflowPermissions()),
    getContentExists: () => Promise.resolve(true),
    ...overrides,
  };
}
