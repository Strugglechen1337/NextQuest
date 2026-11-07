import { handle } from "@/lib/api";
import { clearDemo, loadDemo } from "@/lib/demo";

export async function POST() {
  return handle(() => loadDemo());
}

export async function DELETE() {
  return handle(() => clearDemo());
}
