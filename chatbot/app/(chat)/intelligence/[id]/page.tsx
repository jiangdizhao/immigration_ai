import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PolicyIntelligenceProductDetail } from "@/components/policy-intelligence-product-page";
import { getPolicyIntelligenceProductBySlug } from "@/lib/policy-intelligence-server";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await connection();
  const entry = await getPolicyIntelligenceProductBySlug(id);
  if (!entry) {
    notFound();
  }
  return <PolicyIntelligenceProductDetail entry={entry} />;
}
