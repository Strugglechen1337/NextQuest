import { connection } from "next/server";
import { runtime } from "@/lib/runtime";
import pkg from "../../../../package.json";

/** Aktuell laufende Version – nützlich für den Updater bzw. Hermes. */
export async function GET() {
  await connection();
  return Response.json({
    version: pkg.version,
    runtime: runtime(),
    commit: process.env.NEXTQUEST_COMMIT || "dev",
    builtAt: process.env.NEXTQUEST_BUILT_AT || null,
  });
}
