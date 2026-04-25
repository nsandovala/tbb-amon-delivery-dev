"use strict";
/**
 * Structured error classes used across routes, services, and repositories.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictError = exports.NotFoundError = exports.ValidationError = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = "AppError";
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 400, "VALIDATION_ERROR");
        this.details = details;
        this.name = "ValidationError";
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends AppError {
    constructor(resource) {
        super(`${resource} not found`, 404, "NOT_FOUND");
        this.name = "NotFoundError";
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message) {
        super(message, 409, "CONFLICT");
        this.name = "ConflictError";
    }
}
exports.ConflictError = ConflictError;
//# sourceMappingURL=errors.js.map