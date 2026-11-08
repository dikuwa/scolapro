export function localSupabaseStatus(options: {
  projectRoot: string;
  execImpl?: typeof import("node:child_process").execFileSync;
}): { API_URL: string; SERVICE_ROLE_KEY: string };
