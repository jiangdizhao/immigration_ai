import { ImmigrationServiceHome } from "@/components/immigration-service-home";
import { getPublishedPolicyPreviewProjections } from "@/lib/policy-intelligence-server";

export default function Page() {
  return (
    <ImmigrationServiceHome
      publishedPolicyPreviews={getPublishedPolicyPreviewProjections()}
    />
  );
}
