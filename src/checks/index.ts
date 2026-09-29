import type { Check } from '../core/types.js';
import { adminBypassAllowedCheck } from './repo-settings/admin-bypass-allowed.js';
import { branchProtectionMissingCheck } from './repo-settings/branch-protection-missing.js';
import { forcePushAllowedCheck } from './repo-settings/force-push-allowed.js';
import { noRequiredReviewsCheck } from './repo-settings/no-required-reviews.js';
import { noRequiredStatusChecksCheck } from './repo-settings/no-required-status-checks.js';
import { noSecurityPolicyCheck } from './repo-settings/no-security-policy.js';
import { permissiveWorkflowPermissionsCheck } from './repo-settings/permissive-workflow-permissions.js';
import { secretScanningDisabledCheck } from './repo-settings/secret-scanning-disabled.js';
import { staleReviewsNotDismissedCheck } from './repo-settings/stale-reviews-not-dismissed.js';
import { vulnerabilityAlertsDisabledCheck } from './repo-settings/vulnerability-alerts-disabled.js';

/** The real check registry. */
export const checks: Check[] = [
  branchProtectionMissingCheck,
  noRequiredReviewsCheck,
  adminBypassAllowedCheck,
  staleReviewsNotDismissedCheck,
  forcePushAllowedCheck,
  noRequiredStatusChecksCheck,
  vulnerabilityAlertsDisabledCheck,
  secretScanningDisabledCheck,
  permissiveWorkflowPermissionsCheck,
  noSecurityPolicyCheck,
];
