export const MATTER_DOCUMENT_MIME = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  markdown: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
} as const;

export type MatterDocumentMimeType =
  (typeof MATTER_DOCUMENT_MIME)[keyof typeof MATTER_DOCUMENT_MIME];

export const MATTER_DOCUMENT_MIME_TYPES = [
  ...new Set(Object.values(MATTER_DOCUMENT_MIME)),
] as [MatterDocumentMimeType, ...MatterDocumentMimeType[]];

export type MatterDocumentFormatId = keyof typeof MATTER_DOCUMENT_MIME;
type ValidationStrategy =
  | "signature"
  | "ooxml_zip"
  | "ole_cfb"
  | "utf8_text"
  | "json";
type FormatCategory = "binary" | "container" | "text" | "structured_text";

export type MatterDocumentFormat = {
  id: MatterDocumentFormatId;
  canonicalMimeType: MatterDocumentMimeType;
  acceptedMimeTypes: readonly string[];
  extensions: readonly string[];
  validationStrategy: ValidationStrategy;
  category: FormatCategory;
  processorHint: "pdf" | "image" | "word" | "text" | "spreadsheet";
  allowOctetStream?: boolean;
};

export const MATTER_DOCUMENT_FORMATS: readonly MatterDocumentFormat[] = [
  {
    id: "pdf",
    canonicalMimeType: MATTER_DOCUMENT_MIME.pdf,
    acceptedMimeTypes: ["application/pdf", "application/x-pdf"],
    extensions: [".pdf"],
    validationStrategy: "signature",
    category: "binary",
    processorHint: "pdf",
  },
  {
    id: "jpeg",
    canonicalMimeType: MATTER_DOCUMENT_MIME.jpeg,
    acceptedMimeTypes: ["image/jpeg", "image/pjpeg"],
    extensions: [".jpg", ".jpeg"],
    validationStrategy: "signature",
    category: "binary",
    processorHint: "image",
  },
  {
    id: "png",
    canonicalMimeType: MATTER_DOCUMENT_MIME.png,
    acceptedMimeTypes: ["image/png", "image/x-png"],
    extensions: [".png"],
    validationStrategy: "signature",
    category: "binary",
    processorHint: "image",
  },
  {
    id: "docx",
    canonicalMimeType: MATTER_DOCUMENT_MIME.docx,
    acceptedMimeTypes: [
      MATTER_DOCUMENT_MIME.docx,
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
    ],
    extensions: [".docx"],
    validationStrategy: "ooxml_zip",
    category: "container",
    processorHint: "word",
    allowOctetStream: true,
  },
  {
    id: "doc",
    canonicalMimeType: MATTER_DOCUMENT_MIME.doc,
    acceptedMimeTypes: [
      "application/msword",
      "application/x-msword",
      "application/octet-stream",
    ],
    extensions: [".doc"],
    validationStrategy: "ole_cfb",
    category: "container",
    processorHint: "word",
    allowOctetStream: true,
  },
  {
    id: "txt",
    canonicalMimeType: MATTER_DOCUMENT_MIME.txt,
    acceptedMimeTypes: ["text/plain"],
    extensions: [".txt"],
    validationStrategy: "utf8_text",
    category: "text",
    processorHint: "text",
  },
  {
    id: "markdown",
    canonicalMimeType: MATTER_DOCUMENT_MIME.markdown,
    acceptedMimeTypes: ["text/markdown", "text/x-markdown", "text/plain"],
    extensions: [".md"],
    validationStrategy: "utf8_text",
    category: "text",
    processorHint: "text",
  },
  {
    id: "json",
    canonicalMimeType: MATTER_DOCUMENT_MIME.json,
    acceptedMimeTypes: [
      "application/json",
      "text/json",
      "application/x-json",
      "text/plain",
    ],
    extensions: [".json"],
    validationStrategy: "json",
    category: "structured_text",
    processorHint: "text",
  },
  {
    id: "csv",
    canonicalMimeType: MATTER_DOCUMENT_MIME.csv,
    acceptedMimeTypes: [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "text/plain",
    ],
    extensions: [".csv"],
    validationStrategy: "utf8_text",
    category: "text",
    processorHint: "spreadsheet",
  },
  {
    id: "xlsx",
    canonicalMimeType: MATTER_DOCUMENT_MIME.xlsx,
    acceptedMimeTypes: [
      MATTER_DOCUMENT_MIME.xlsx,
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
    ],
    extensions: [".xlsx"],
    validationStrategy: "ooxml_zip",
    category: "container",
    processorHint: "spreadsheet",
    allowOctetStream: true,
  },
  {
    id: "xls",
    canonicalMimeType: MATTER_DOCUMENT_MIME.xls,
    acceptedMimeTypes: [
      MATTER_DOCUMENT_MIME.xls,
      "application/msexcel",
      "application/x-msexcel",
      "application/xls",
      "application/octet-stream",
    ],
    extensions: [".xls"],
    validationStrategy: "ole_cfb",
    category: "container",
    processorHint: "spreadsheet",
    allowOctetStream: true,
  },
] as const;

export const MAX_MATTER_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_JSON_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_OOXML_ENTRIES = 4096;
export const MAX_OOXML_CONTENT_TYPES_BYTES = 256 * 1024;
export const MAX_OOXML_EXPANDED_BYTES = 200 * 1024 * 1024;
