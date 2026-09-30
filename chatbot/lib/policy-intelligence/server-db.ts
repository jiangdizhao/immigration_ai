import "server-only";
import { getLazyDatabase } from "@/lib/db/runtime-client";

export const db = getLazyDatabase();
