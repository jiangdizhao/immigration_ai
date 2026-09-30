import { PolicyIntelligenceProductPage } from "@/components/policy-intelligence-product-page";
import { getPolicyIntelligenceProductState } from "@/lib/policy-intelligence-server";

export default async function Page() {
  const state = await getPolicyIntelligenceProductState();
  return <PolicyIntelligenceProductPage state={state} />;
}
