"use client";

type Props = {
  facts?: Record<string, string | number | boolean | null> | null;
};

export function KnownFactsSummary({ facts }: Props) {
  const entries = Object.entries(facts ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );

  if (!entries.length) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="mb-2 text-sm font-medium">Known facts so far</div>
      <div className="space-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{key.replaceAll("_", " ")}</span>
            <span className="text-right font-medium">{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}