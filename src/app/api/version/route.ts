import { connection } from "next/server";
import pkg from "../../../../package.json";

/** Aktuell laufende Version – nützlich für den Updater bzw. Hermes. */
export async function GET() {
  await connection();
  return Response.json({
    version: pkg.version,
    commit: process.env.NEXTQUEST_COMMIT || "dev",
    builtAt: process.env.NEXTQUEST_BUILT_AT || null,
  });
}
