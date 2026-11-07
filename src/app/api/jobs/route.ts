import { connection } from "next/server";
import { handle } from "@/lib/api";
import { jobsStatus, startJob } from "@/lib/jobs";
import { JOB_KINDS, type JobKind } from "@/lib/job-types";

export async function GET() {
  await connection();
  return handle(() => jobsStatus());
}
export async function POST(req: Request) {
  return handle(async () => {
    const { kind } = await req.json();
    if (!JOB_KINDS.includes(kind)) throw new Error("Unbekannte Job-Art");
    return startJob(kind as JobKind);
  });
}
