/**
 * Structured error classes used across routes, services, and repositories.
 */
export declare class AppError extends Error {
    statusCode: number;
    code: string;
    constructor(message: string, statusCode: number, code: string);
}
export declare class ValidationError extends AppError {
    details?: unknown[] | undefined;
    constructor(message: string, details?: unknown[] | undefined);
}
export declare class NotFoundError extends AppError {
    constructor(resource: string);
}
export declare class ConflictError extends AppError {
    constructor(message: string);
}
