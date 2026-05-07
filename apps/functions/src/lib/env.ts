/**
 * Environment variables required at runtime.
 * Fails fast if any mandatory variable is missing.
 */

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function resolveProjectId(): string {
  const candidates = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.GCLOUD_PROJECT,
    process.env.PROJECT_ID,
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }

  throw new Error(
    "Missing required project ID env. Tried FIREBASE_PROJECT_ID, GCLOUD_PROJECT, PROJECT_ID, NEXT_PUBLIC_FIREBASE_PROJECT_ID."
  );
}

export const env = {
  projectId: resolveProjectId(),
  nodeEnv: process.env.NODE_ENV || "development",
  isEmulator: process.env.FIRESTORE_EMULATOR_HOST !== undefined,
  emulatorHost: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080",
} as const;
