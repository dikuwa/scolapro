export declare function loadEnvFile(file: string): Record<string, string>;
export declare function loadProjectEnv(projectRoot: string): Record<string, string>;
export declare function mergedProjectEnv(
  projectRoot: string,
): Record<string, string | undefined>;
