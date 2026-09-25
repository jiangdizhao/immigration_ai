"use client";

import { useCallback, useEffect, useState } from "react";
import { DetailDisposition } from "@/components/lawyer-workspace/detail-disposition";
import { DetailEvidence } from "@/components/lawyer-workspace/detail-evidence";
import { DetailHeader } from "@/components/lawyer-workspace/detail-header";
import { DetailSnapshots } from "@/components/lawyer-workspace/detail-snapshots";
import { DetailThread } from "@/components/lawyer-workspace/detail-thread";
import { useSiteLocale } from "@/components/site-locale-provider";
import {
  availableLawyerActions,
  type LawyerWorkspaceDetail as LawyerWorkspaceDetailData,
} from "@/lib/lawyer-workspace/types";

export function LawyerWorkspaceDetail({ id }: { id: string }) {
  const { locale } = useSiteLocale();
  const chinese = locale !== "en";
  const [detail, setDetail] = useState<LawyerWorkspaceDetailData | null>(null);
  const [learningAvailable, setLearningAvailable] = useState(false);
  const [lawyerResponse, setLawyerResponse] = useState("");
  const [correctedAnswer, setCorrectedAnswer] = useState("");
  const [approach, setApproach] = useState("");
  const [createCandidate, setCreateCandidate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/lawyer-portal/requests/${id}`);
    const data = (await response.json()) as LawyerWorkspaceDetailData & {
      learningAvailable?: boolean;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "load failed");
    }
    setDetail(data);
    setLearningAvailable(data.learningAvailable === true);
    setLawyerResponse(data.lawyerDisposition.lawyerResponse ?? "");
    setCorrectedAnswer(data.lawyerDisposition.correctedAnswer ?? "");
    setApproach(
      data.lawyerDisposition.preferredReasoningOrResearchApproach ?? ""
    );
    setCreateCandidate(data.lawyerDisposition.createReasoningLessonCandidate);
  }, [id]);

  useEffect(() => {
    load().catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : "load failed");
    });
  }, [load]);

  async function update(status: string) {
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/lawyer-portal/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          lawyerResponse,
          correctedAnswer,
          preferredReasoningOrResearchApproach: approach,
          createReasoningLessonCandidate: createCandidate,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "update failed");
      }
      await load();
      setNotice(chinese ? "请求已更新。" : "Request updated.");
    } catch (error: unknown) {
      setNotice(error instanceof Error ? error.message : "update failed");
    } finally {
      setLoading(false);
    }
  }

  if (!detail) {
    return (
      <p className="mt-6 text-sm text-slate-600">
        {notice ?? (chinese ? "正在加载请求。" : "Loading request.")}
      </p>
    );
  }

  const actions = availableLawyerActions(detail.request.status);
  return (
    <div className="mt-6 space-y-5">
      <DetailHeader detail={detail} locale={locale} />
      <DetailSnapshots detail={detail} locale={locale} />
      <DetailEvidence detail={detail} locale={locale} />
      <DetailThread detail={detail} locale={locale} />
      <DetailDisposition
        actions={actions}
        approach={approach}
        correctedAnswer={correctedAnswer}
        createCandidate={createCandidate}
        lawyerResponse={lawyerResponse}
        learningAvailable={learningAvailable}
        loading={loading}
        locale={locale}
        notice={notice}
        onApproach={setApproach}
        onCorrectedAnswer={setCorrectedAnswer}
        onCreateCandidate={setCreateCandidate}
        onLawyerResponse={setLawyerResponse}
        onUpdate={update}
      />
    </div>
  );
}
