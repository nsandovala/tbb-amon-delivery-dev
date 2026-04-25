/**
 * API-layer types. Separate from domain types in packages/shared.
 */
export interface ApiResponse<T = unknown> {
    ok: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}
export interface RequestContext {
    tenantId: string;
}
