import { notFound } from "next/navigation";
import { PolicyIntelligenceDetail } from "@/components/policy-intelligence-page";
import { getPublishedPolicyProjectionBySlug } from "@/lib/policy-intelligence-server";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = getPublishedPolicyProjectionBySlug(id);

  if (!entry) {
    notFound();
  }

  return <PolicyIntelligenceDetail entry={entry} />;
}
