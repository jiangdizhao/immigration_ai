import { requireAdminUser } from "@/lib/lawyer-requests/admin-access";
import { attemptLearningBridge } from "@/lib/lawyer-requests/learning-bridge";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const admin = await requireAdminUser();
  if (admin instanceof Response) {
    return admin;
  }
  const id = (await context.params).id;
  const result = await attemptLearningBridge(id);
  if (!result) {
    return Response.json(
      { error: "Learning bridge not found." },
      { status: 404 }
    );
  }
  return Response.json({ learningBridge: result });
}
