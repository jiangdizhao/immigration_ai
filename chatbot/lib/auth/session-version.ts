export function isSessionVersionValid({
  type,
  tokenAuthVersion,
  currentAuthVersion,
}: {
  type: "guest" | "regular" | undefined;
  tokenAuthVersion: number | null | undefined;
  currentAuthVersion: number | null;
}) {
  if (type === "guest") {
    return true;
  }

  return (
    type === "regular" &&
    Number.isInteger(tokenAuthVersion) &&
    tokenAuthVersion === currentAuthVersion
  );
}
