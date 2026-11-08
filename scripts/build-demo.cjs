process.env.NEXT_PUBLIC_DEMO = "1";
const { spawnSync } = require("node:child_process");
const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
