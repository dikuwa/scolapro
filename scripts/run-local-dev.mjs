import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function localAuthSeedEnv() {
  const selected = {};
  const envPath = path.join(projectRoot, ".env.local");
  if (existsSync(envPath)) {
    for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      if (!["SCOLAPRO_LOCAL_ADMIN_EMAIL", "SCOLAPRO_LOCAL_ADMIN_PASSWORD"].includes(key)) continue;
      selected[key] = unquoteEnvValue(line.slice(separator + 1));
    }
  }
  return {
    SCOLAPRO_LOCAL_ADMIN_EMAIL:
      process.env.SCOLAPRO_LOCAL_ADMIN_EMAIL || selected.SCOLAPRO_LOCAL_ADMIN_EMAIL,
    SCOLAPRO_LOCAL_ADMIN_PASSWORD:
      process.env.SCOLAPRO_LOCAL_ADMIN_PASSWORD || selected.SCOLAPRO_LOCAL_ADMIN_PASSWORD,
  };
}

function seedLocalAuthIfConfigured() {
  const authEnv = localAuthSeedEnv();
  if (!authEnv.SCOLAPRO_LOCAL_ADMIN_PASSWORD) {
    console.warn(
      "Local Auth seed skipped: set SCOLAPRO_LOCAL_ADMIN_PASSWORD in .env.local or the shell, then run pnpm dev again.",
    );
    return;
  }

  execFileSync(process.execPath, [path.join(projectRoot, "scripts", "seed-local-auth.mjs")], {
    cwd: projectRoot,
    env: { ...process.env, ...authEnv },
    stdio: "inherit",
  });
}

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
seedLocalAuthIfConfigured();

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
