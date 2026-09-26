import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function localSupabaseStatus() {
  try {
    return JSON.parse(
      execFileSync("supabase", ["status", "-o", "json"], {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    throw new Error("Local Supabase is not running. Start it with `supabase start`, then retry `pnpm dev`.");
  }
}

function syncLocalSchema() {
  try {
    execFileSync("supabase", ["migration", "up", "--local"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr ?? "").trim() : "";
    throw new Error(
      [
        "Local Supabase migrations are not current, so the app cannot safely start.",
        "Run `pnpm local:sync-db` and resolve the reported migration error before retrying `pnpm dev`.",
        stderr ? `Supabase: ${stderr}` : null,
      ].filter(Boolean).join("\n"),
    );
  }
}

const status = localSupabaseStatus();
const apiUrl = new URL(status.API_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname)) {
  throw new Error("Refusing to use a non-loopback Supabase URL for the default local dev command.");
}
if (!status.PUBLISHABLE_KEY || !status.SERVICE_ROLE_KEY) {
  throw new Error("Local Supabase did not report the required application keys.");
}

syncLocalSchema();

const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
