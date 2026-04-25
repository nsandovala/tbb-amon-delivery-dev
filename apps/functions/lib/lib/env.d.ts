/**
 * Environment variables required at runtime.
 * Fails fast if any mandatory variable is missing.
 */
export declare const env: {
    readonly projectId: string;
    readonly nodeEnv: string;
    readonly isEmulator: boolean;
    readonly emulatorHost: string;
};
