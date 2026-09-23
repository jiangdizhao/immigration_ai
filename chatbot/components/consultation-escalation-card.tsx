"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  warnings?: string[] | null;
  onBookConsultation?: () => void;
  responseLanguage?: string | null;
};

export function ConsultationEscalationCard({
  warnings,
  onBookConsultation,
  responseLanguage,
}: Props) {
  const zh = (responseLanguage ?? "").toLowerCase().startsWith("zh");
  return (
    <Alert className="border-amber-300/60 bg-amber-50/60">
      <AlertTitle>
        {zh ? "建议由律师审阅" : "Lawyer review recommended"}
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-sm">
          {zh
            ? "此事项可能取决于关键日期、当前签证状态和相关材料。"
            : "This may depend on key dates, current visa status, and documents."}
        </p>

        {warnings?.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}

        <Button onClick={onBookConsultation} size="sm">
          {zh ? "预约流程筹备中" : "Appointment workflow planned"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
