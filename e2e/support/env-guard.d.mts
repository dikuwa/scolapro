export declare const PRODUCTION_PROJECT_REF: "jhgumnvhoxmapmgotchu";
export declare const PRODUCTION_HOSTS: readonly string[];
export declare const LOOPBACK_HOSTS: readonly string[];
export declare const E2E_TARGETS: readonly ("local" | "staging")[];

export declare class E2EEnvironmentError extends Error {
  constructor(message: string);
  name: "E2EEnvironmentError";
}

export declare function isLoopbackHost(hostname: string | null | undefined): boolean;
export declare function isProductionHost(hostname: string | null | undefined): boolean;
export declare function supabaseProjectRefFromUrl(value: string | null | undefined): string | null;

export type ResolvedE2EEnvironment = {
  baseUrl: string;
  host: string;
  target: "local" | "staging";
  loopback: boolean;
  supabaseProjectRef: string | null;
  production: false;
};

export declare function resolveE2EEnvironment(
  env?: Record<string, string | undefined>,
): ResolvedE2EEnvironment;

export declare function e2eEnvironmentRejection(
  env?: Record<string, string | undefined>,
): string | null;
