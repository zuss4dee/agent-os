import type { AgentStatus, PermissionEnvelope, SkillLifecycle } from "./types.ts";

export type RuntimeMode = "production" | "development" | "lab";

export type RuntimeCapability = {
  tools: string[];
  connectors: string[];
  permissions: PermissionEnvelope;
};

export type RuntimeSkill = {
  id: string;
  version: string;
  pin: string;
  artifact_hash: string;
  lifecycle: SkillLifecycle;
  trusted: boolean;
  origin_type: "internal" | "third-party";
  capabilities: RuntimeCapability;
  registry_path: string;
};

export type RuntimeAgent = {
  id: string;
  name: string;
  version: string;
  status: AgentStatus;
  contract_hash: string;
  tools: string[];
};

export type RuntimeContext = {
  mode: RuntimeMode;
  verified: true;
  agent: RuntimeAgent;
  release: {
    path: string;
    version: string;
    commit: string | null;
    generated_at: string;
    dirty: boolean;
  };
  skills: RuntimeSkill[];
  capabilities: RuntimeCapability;
  provenance: {
    loader: string;
    sync: string;
    registry_agent_id: string;
  };
  /** Integrity/control checks only. This is not a sandbox. */
  isolation: "none";
};

export type CapabilityKind = "tool" | "connector" | "network" | "filesystem" | "execution" | "destructive";

export type CapabilityRequest = {
  kind: CapabilityKind;
  name?: string;
  skillId?: string;
};

export type CapabilityDecision = {
  allowed: boolean;
  reason: string;
  kind: CapabilityKind;
};
