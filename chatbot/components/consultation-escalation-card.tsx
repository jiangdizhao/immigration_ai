"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  warnings?: string[] | null;
  onBookConsultation?: () => void;
};

export function ConsultationEscalationCard({
  warnings,
  onBookConsultation,
}: Props) {
  return (
    <Alert className="border-amber-300/60 bg-amber-50/60">
      <AlertTitle>Consultation recommended</AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-sm">
          This matter may need lawyer review before giving a specific answer.
        </p>

        {warnings?.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}

        <Button size="sm" onClick={onBookConsultation}>
          Book a consultation
        </Button>
      </AlertDescription>
    </Alert>
  );
}