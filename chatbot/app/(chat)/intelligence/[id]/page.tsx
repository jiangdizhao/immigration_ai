import { notFound } from "next/navigation";
import { PolicyIntelligenceDetail } from "@/components/policy-intelligence-page";
import { getPublishedPolicyBySlug } from "@/lib/policy-intelligence";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = getPublishedPolicyBySlug(id);

  if (!entry) {
    notFound();
  }

  return <PolicyIntelligenceDetail entry={entry} />;
}
