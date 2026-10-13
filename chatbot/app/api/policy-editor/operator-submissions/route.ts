import { editorialActorResolver } from "@/lib/policy-intelligence/editorial-access";
import {
  handleOperatorSubmissionCreate,
  handleOperatorSubmissionList,
} from "@/lib/policy-intelligence/editorial-api";
import { operatorSubmissionService } from "@/lib/policy-intelligence/editorial-runtime";

export async function GET() {
  return await handleOperatorSubmissionList({
    resolveActor: editorialActorResolver,
    service: operatorSubmissionService,
  });
}

export async function POST(request: Request) {
  return await handleOperatorSubmissionCreate({
    resolveActor: editorialActorResolver,
    service: operatorSubmissionService,
    request,
  });
}
