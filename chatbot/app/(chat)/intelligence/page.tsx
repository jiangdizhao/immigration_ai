import { PolicyIntelligencePage } from "@/components/policy-intelligence-page";
import { getPublishedPolicyProjections } from "@/lib/policy-intelligence-server";

export default function Page() {
  return <PolicyIntelligencePage policies={getPublishedPolicyProjections()} />;
}
