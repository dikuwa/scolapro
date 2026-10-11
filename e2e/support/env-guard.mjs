// Fail-closed environment guard for authenticated end-to-end runs.
//
// The attendance release closed its authenticated QA gap with a browser
// harness, but that harness must never be able to point a real browser at
// production learner data. Every E2E entry point (Playwright config, the local
// runner, CI and the synthetic seed script) resolves its target through this
// module and refuses to continue when the target could touch production.
//
// The guard is intentionally dependency-free plain JavaScript so it can be
// unit tested with `node --test` and imported from TypeScript via the
// companion `env-guard.d.mts` declaration.

export const PRODUCTION_PROJECT_REF = "jhgumnvhoxmapmgotchu";

export const PRODUCTION_HOSTS = Object.freeze(["scola-pro.vercel.app"]);

export const LOOPBACK_HOSTS = Object.freeze(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export const E2E_TARGETS = Object.freeze(["local", "staging"]);

/** Raised when the requested E2E target could reach production or is otherwise unsafe. */
export class E2EEnvironmentError extends Error {
  constructor(message) {
    super(message);
    this.name = "E2EEnvironmentError";
  }
}

/** True for hosts that can only resolve to the developer's own machine. */
export function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.includes(String(hostname ?? "").toLowerCase());
}

/** True for any host that could be serving the ScolaPro production application. */
export function isProductionHost(hostname) {
  const host = String(hostname ?? "").toLowerCase();
  if (!host) return false;
  // Every Vercel-served host is refused: preview deployments of this project are
  // disabled in vercel.json, and the only live alias is production.
  return host.endsWith(".vercel.app") || PRODUCTION_HOSTS.includes(host);
}

/** Extracts a Supabase project ref from a hosted Supabase URL, or null. */
export function supabaseProjectRefFromUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const match = /^([a-z0-9]{20})\.supabase\.(co|in|net)$/.exec(url.hostname.toLowerCase());
  return match ? match[1] : null;
}

/**
 * Resolves and validates the E2E target. Throws {@link E2EEnvironmentError}
 * when the environment is unsafe. Returns the validated environment otherwise.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function resolveE2EEnvironment(env = process.env) {
  // `localhost` (not 127.0.0.1) because Next.js dev origin protection rejects
  // 127.0.0.1 as a dev origin with 403, which would block hydration.
  const rawBaseUrl = (env.PLAYWRIGHT_BASE_URL ?? "").trim() || "http://localhost:3000";

  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new E2EEnvironmentError(`PLAYWRIGHT_BASE_URL is not a valid URL: ${rawBaseUrl}`);
  }
  const host = baseUrl.hostname.toLowerCase();

  if (isProductionHost(host)) {
    throw new E2EEnvironmentError(
      `Refusing E2E: PLAYWRIGHT_BASE_URL host "${host}" is a production Vercel host. ` +
        "Authenticated E2E must never run against production.",
    );
  }

  const requestedTarget = (env.SCOLAPRO_E2E_TARGET ?? "").trim().toLowerCase();
  const loopback = isLoopbackHost(host);
  const target = requestedTarget || (loopback ? "local" : "staging");

  if (!E2E_TARGETS.includes(target)) {
    throw new E2EEnvironmentError(
      `Refusing E2E: unknown SCOLAPRO_E2E_TARGET "${target}". Expected one of ${E2E_TARGETS.join(", ")}.`,
    );
  }

  if (target === "local" && !loopback) {
    throw new E2EEnvironmentError(
      `Refusing E2E: target "local" requires a loopback host, got "${host}".`,
    );
  }

  // The application's configured Supabase URL is the strongest signal that a
  // local browser would actually be reading production data.
  const appRef = supabaseProjectRefFromUrl((env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim());
  const explicitRef = (env.SCOLAPRO_E2E_SUPABASE_PROJECT_REF ?? "").trim() || null;
  const resolvedRef = explicitRef ?? appRef;

  if (resolvedRef === PRODUCTION_PROJECT_REF || appRef === PRODUCTION_PROJECT_REF) {
    throw new E2EEnvironmentError(
      `Refusing E2E: Supabase project ref "${PRODUCTION_PROJECT_REF}" is the production project.`,
    );
  }

  if (target === "local") {
    // A local browser must be backed by the local Supabase stack, never a hosted
    // project the guard cannot prove is synthetic.
    if (appRef) {
      throw new E2EEnvironmentError(
        `Refusing E2E: the local target must use the local Supabase stack, but ` +
          `NEXT_PUBLIC_SUPABASE_URL points at hosted project "${appRef}".`,
      );
    }
  } else {
    if (!explicitRef) {
      throw new E2EEnvironmentError(
        "Refusing E2E: the staging target requires SCOLAPRO_E2E_SUPABASE_PROJECT_REF so the guard " +
          "can prove the target is not the production project.",
      );
    }
    if (env.SCOLAPRO_E2E_SYNTHETIC_ONLY !== "1") {
      throw new E2EEnvironmentError(
        "Refusing E2E: hosted staging runs must set SCOLAPRO_E2E_SYNTHETIC_ONLY=1 to confirm that " +
          "only synthetic accounts and learners are in scope.",
      );
    }
    if (appRef && appRef !== explicitRef) {
      throw new E2EEnvironmentError(
        `Refusing E2E: NEXT_PUBLIC_SUPABASE_URL project ref "${appRef}" does not match the declared ` +
          `staging ref "${explicitRef}".`,
      );
    }
  }

  return {
    baseUrl: baseUrl.origin,
    host,
    target,
    loopback,
    supabaseProjectRef: resolvedRef,
    production: false,
  };
}

/** Returns the reason a candidate environment is unsafe, or null when it is safe. */
export function e2eEnvironmentRejection(env = process.env) {
  try {
    resolveE2EEnvironment(env);
    return null;
  } catch (error) {
    return error instanceof E2EEnvironmentError ? error.message : String(error);
  }
}
