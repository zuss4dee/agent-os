import {
  CapabilityExecutionNotImplemented,
  CapabilityNotDeclared,
  PermissionDenied,
} from "./runtime-errors.ts";
import type { CapabilityDecision, CapabilityRequest, RuntimeContext, RuntimeSkill } from "./runtime-types.ts";

function skillFor(ctx: RuntimeContext, skillId?: string): RuntimeSkill | undefined {
  if (!skillId) return undefined;
  return ctx.skills.find((s) => s.id === skillId);
}

export function decideCapability(ctx: RuntimeContext, request: CapabilityRequest): CapabilityDecision {
  const skill = skillFor(ctx, request.skillId);
  if (request.skillId && !skill) {
    return { allowed: false, reason: `skill ${request.skillId} is not in the verified context`, kind: request.kind };
  }

  const tools = skill ? skill.capabilities.tools : ctx.capabilities.tools;
  const connectors = skill ? skill.capabilities.connectors : ctx.capabilities.connectors;
  const permissions = skill ? skill.capabilities.permissions : ctx.capabilities.permissions;

  switch (request.kind) {
    case "tool": {
      const name = request.name ?? "";
      if (!name || !tools.includes(name)) {
        return { allowed: false, reason: `tool "${name || "(missing)"}" is not declared`, kind: request.kind };
      }
      return { allowed: true, reason: "declared tool", kind: request.kind };
    }
    case "connector": {
      const name = request.name ?? "";
      if (!name || !connectors.includes(name)) {
        return { allowed: false, reason: `connector "${name || "(missing)"}" is not declared`, kind: request.kind };
      }
      return { allowed: true, reason: "declared connector", kind: request.kind };
    }
    case "network":
    case "filesystem":
    case "execution":
    case "destructive": {
      if (!permissions[request.kind]) {
        return { allowed: false, reason: `${request.kind} is false in the verified envelope`, kind: request.kind };
      }
      return { allowed: true, reason: `declared ${request.kind}`, kind: request.kind };
    }
    default:
      return { allowed: false, reason: "unknown capability kind", kind: request.kind };
  }
}

/** Verifies the request against the envelope, then refuses to execute. This is not a sandbox. */
export function executeCapability(ctx: RuntimeContext, request: CapabilityRequest): never {
  const decision = decideCapability(ctx, request);
  if (!decision.allowed) {
    if (request.kind === "tool" || request.kind === "connector") {
      throw new CapabilityNotDeclared(request.kind, request.name, [decision.reason]);
    }
    throw new PermissionDenied(request.kind, [decision.reason]);
  }
  throw new CapabilityExecutionNotImplemented();
}

export type CapabilityGateway = {
  decide: typeof decideCapability;
  execute: typeof executeCapability;
};

export const capabilityGateway: CapabilityGateway = {
  decide: decideCapability,
  execute: executeCapability,
};
