import "server-only";

import { policyEditorialRepository } from "./editorial-repository";
import { createPolicyEditorialService } from "./editorial-service";
import { createOperatorSubmissionService } from "./operator-submission";
import { operatorSubmissionRepository } from "./operator-submission-repository";

/**
 * Server runtime singletons for the Stage 3 editorial surface. Both services
 * are deterministic and provider-free: nothing here can call an LLM, a
 * verifier or a research tool.
 */
export const policyEditorialService = createPolicyEditorialService(
  policyEditorialRepository
);

export const operatorSubmissionService = createOperatorSubmissionService(
  operatorSubmissionRepository
);
