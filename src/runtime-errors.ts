import { AgentOsError } from "./errors.ts";

export class RuntimeError extends AgentOsError {
  readonly agentId?: string;
  readonly version?: string;
  readonly skillId?: string;
  readonly skillVersion?: string;

  constructor(
    code: string,
    message: string,
    details: string[] = [],
    meta: { agentId?: string; version?: string; skillId?: string; skillVersion?: string } = {},
  ) {
    super(code, message, details);
    this.name = "RuntimeError";
    this.agentId = meta.agentId;
    this.version = meta.version;
    this.skillId = meta.skillId;
    this.skillVersion = meta.skillVersion;
  }
}

export class ReleaseNotFound extends RuntimeError {
  constructor(agentId: string, version: string, path: string) {
    super("RELEASE_NOT_FOUND", `Release not found for ${agentId}@${version}`, [`expected packet: ${path}`], {
      agentId,
      version,
    });
    this.name = "ReleaseNotFound";
  }
}

export class ReleaseSchemaInvalid extends RuntimeError {
  constructor(agentId: string, version: string, details: string[]) {
    super("RELEASE_SCHEMA_INVALID", `Release packet schema invalid for ${agentId}@${version}`, details, {
      agentId,
      version,
    });
    this.name = "ReleaseSchemaInvalid";
  }
}

export class ReleaseHashMismatch extends RuntimeError {
  constructor(agentId: string, version: string, expected: string, actual: string) {
    super(
      "RELEASE_HASH_MISMATCH",
      `Release contract hash mismatch for ${agentId}@${version}`,
      [`recorded ${expected}`, `recomputed ${actual}`],
      { agentId, version },
    );
    this.name = "ReleaseHashMismatch";
  }
}

export class AgentContractMismatch extends RuntimeError {
  constructor(agentId: string, version: string, details: string[]) {
    super("AGENT_CONTRACT_MISMATCH", `Agent identity/contract mismatch for ${agentId}@${version}`, details, {
      agentId,
      version,
    });
    this.name = "AgentContractMismatch";
  }
}

export class SkillNotFound extends RuntimeError {
  constructor(skillId: string, skillVersion: string, details: string[] = []) {
    super("SKILL_NOT_FOUND", `Skill ${skillId}@${skillVersion} is not registered`, details, {
      skillId,
      skillVersion,
    });
    this.name = "SkillNotFound";
  }
}

export class SkillVersionMismatch extends RuntimeError {
  constructor(skillId: string, expected: string, actual: string) {
    super(
      "SKILL_VERSION_MISMATCH",
      `Skill ${skillId} version mismatch`,
      [`packet ${expected}`, `resolved ${actual}`],
      { skillId, skillVersion: expected },
    );
    this.name = "SkillVersionMismatch";
  }
}

export class SkillArtifactHashMismatch extends RuntimeError {
  constructor(skillId: string, version: string, details: string[]) {
    super("SKILL_ARTIFACT_HASH_MISMATCH", `Skill artifact hash mismatch for ${skillId}@${version}`, details, {
      skillId,
      skillVersion: version,
    });
    this.name = "SkillArtifactHashMismatch";
  }
}

export class SkillNotTrusted extends RuntimeError {
  constructor(skillId: string, version: string, details: string[] = []) {
    super("SKILL_NOT_TRUSTED", `Skill ${skillId}@${version} is not trusted for this runtime mode`, details, {
      skillId,
      skillVersion: version,
    });
    this.name = "SkillNotTrusted";
  }
}

export class SkillNotProduction extends RuntimeError {
  constructor(skillId: string, version: string, lifecycle: string) {
    super(
      "SKILL_NOT_PRODUCTION",
      `Skill ${skillId}@${version} lifecycle "${lifecycle}" is not allowed in production`,
      [],
      { skillId, skillVersion: version },
    );
    this.name = "SkillNotProduction";
  }
}

export class CapabilityNotDeclared extends RuntimeError {
  constructor(kind: string, name: string | undefined, details: string[] = []) {
    super("CAPABILITY_NOT_DECLARED", `Capability not declared: ${kind}${name ? ` ${name}` : ""}`, details);
    this.name = "CapabilityNotDeclared";
  }
}

export class PermissionDenied extends RuntimeError {
  constructor(kind: string, details: string[] = []) {
    super("PERMISSION_DENIED", `Permission denied for ${kind}`, details);
    this.name = "PermissionDenied";
  }
}

export class RegistryResolutionError extends RuntimeError {
  constructor(message: string, details: string[] = []) {
    super("REGISTRY_RESOLUTION_ERROR", message, details);
    this.name = "RegistryResolutionError";
  }
}

export class ImplicitVersionError extends RuntimeError {
  constructor(value: string) {
    super("IMPLICIT_VERSION", "Implicit or latest version resolution is not allowed", [
      `received "${value}"`,
      "pass an exact id@semver, e.g. gate-agent@1.0.0",
    ]);
    this.name = "ImplicitVersionError";
  }
}

export class CapabilityExecutionNotImplemented extends RuntimeError {
  constructor() {
    super(
      "CAPABILITY_EXECUTION_NOT_IMPLEMENTED",
      "Capability execution is not implemented. The loader verifies envelopes; it does not sandbox or execute tools.",
    );
    this.name = "CapabilityExecutionNotImplemented";
  }
}

export class EnvelopeMismatch extends RuntimeError {
  constructor(skillId: string, version: string, details: string[]) {
    super("ENVELOPE_MISMATCH", `Permission/tool envelope mismatch for ${skillId}@${version}`, details, {
      skillId,
      skillVersion: version,
    });
    this.name = "EnvelopeMismatch";
  }
}
