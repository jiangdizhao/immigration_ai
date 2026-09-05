function safeErrorToken(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(value)
    ? value
    : undefined;
}

export function getSafeEmailErrorMetadata(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const metadata =
    record.$metadata && typeof record.$metadata === "object"
      ? (record.$metadata as Record<string, unknown>)
      : {};
  const status = metadata.httpStatusCode ?? record.statusCode;

  return {
    ...(safeErrorToken(error instanceof Error ? error.name : record.name)
      ? {
          errorName: safeErrorToken(
            error instanceof Error ? error.name : record.name
          ),
        }
      : {}),
    ...(safeErrorToken(record.type)
      ? { errorType: safeErrorToken(record.type) }
      : {}),
    ...(safeErrorToken(record.code ?? record.Code)
      ? { awsErrorCode: safeErrorToken(record.code ?? record.Code) }
      : {}),
    ...(typeof status === "number" && Number.isInteger(status) && status > 0
      ? { httpStatus: status }
      : {}),
  };
}
