/**
 * Environment variables required at runtime.
 * Resolves project id from emulator/runtime-provided vars first.
 */
export declare const env: {
    readonly projectId: string;
    readonly nodeEnv: string;
    readonly isEmulator: boolean;
    readonly emulatorHost: string;
};
