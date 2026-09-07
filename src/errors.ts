export class AgentOsError extends Error {
  readonly code: string;
  readonly details: string[];

  constructor(code: string, message: string, details: string[] = []) {
    super(details.length ? `${message}\n${details.map((d) => `  - ${d}`).join("\n")}` : message);
    this.name = "AgentOsError";
    this.code = code;
    this.details = details;
  }
}

export class ValidationFailed extends AgentOsError {
  constructor(target: string, details: string[]) {
    super("VALIDATION_FAILED", `Validation failed for ${target}`, details);
    this.name = "ValidationFailed";
  }
}
