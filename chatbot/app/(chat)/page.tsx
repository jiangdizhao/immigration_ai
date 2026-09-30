import { connection } from "next/server";
import { ImmigrationServiceHome } from "@/components/immigration-service-home";
import { getPolicyIntelligenceHomePreview } from "@/lib/policy-intelligence-server";

export default async function Page() {
  await connection();
  const policyState = await getPolicyIntelligenceHomePreview();
  return <ImmigrationServiceHome policyState={policyState} />;
}
