/**
 * Environment variables required at runtime.
 * Resolves project id from emulator/runtime-provided vars first.
 */

function resolveProjectId(): string {
  const candidates = [
    process.env.GCLOUD_PROJECT,
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.PROJECT_ID,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }

  throw new Error(
    "Missing project id. Set PROJECT_ID or rely on GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT."
  );
}

export const env = {
  projectId: resolveProjectId(),
  nodeEnv: process.env.NODE_ENV || "development",
  isEmulator: process.env.FIRESTORE_EMULATOR_HOST !== undefined,
  emulatorHost: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080",
} as const;
