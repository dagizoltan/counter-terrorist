/**
 * Centralized error management for Security Orchestrator.
 */

export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR",
    public details?: any
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.code,
        details: this.details,
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class SidecarError extends AppError {
  constructor(message: string, sidecar: string, details?: any) {
    super(message, 502, "SIDECAR_ERROR", { sidecar, ...details });
    this.name = "SidecarError";
  }
}

export class InfrastructureError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, "INFRASTRUCTURE_ERROR", details);
    this.name = "InfrastructureError";
  }
}

export class SecurityError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 403, "SECURITY_VIOLATION", details);
    this.name = "SecurityError";
  }
}

export class ConsensusError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, "CONSENSUS_FAILURE", details);
    this.name = "ConsensusError";
  }
}

export class ResourceExhaustedError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 429, "RESOURCE_EXHAUSTED", details);
    this.name = "ResourceExhaustedError";
  }
}
