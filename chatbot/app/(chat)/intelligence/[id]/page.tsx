import { notFound } from "next/navigation";
import { PolicyIntelligenceProductDetail } from "@/components/policy-intelligence-product-page";
import { getPolicyIntelligenceProductBySlug } from "@/lib/policy-intelligence-server";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = await getPolicyIntelligenceProductBySlug(id);
  if (!entry) {
    notFound();
  }
  return <PolicyIntelligenceProductDetail entry={entry} />;
}
