import type { SkillPin } from "./semver.ts";

export type AgentStatus = "draft" | "candidate" | "production" | "deprecated" | "fixture";

export type AgentManifest = {
  id: string;
  name: string;
  version: string;
  prompt: {
    profile: string;
    system: string;
    operating_manual: string;
  };
  skills: Array<string | SkillPin>;
  tools?: string[];
  knowledge: string[];
  shared_policies?: string[];
  runtime: {
    loader: string;
    sync?: "on-session-start" | "on-demand" | "pinned-release";
  };
  evaluation: {
    suite: string;
  };
  metadata: {
    status: AgentStatus;
    owners?: string[];
  };
};

export type SkillOrigin = {
  type: "internal" | "third-party";
  source_url?: string | null;
  author?: string | null;
  imported_at?: string | null;
  license?: string | null;
  original_version?: string | null;
  original_id?: string | null;
};

export type SkillLifecycle =
  | "discovered"
  | "imported"
  | "review"
  | "adapted"
  | "evaluated"
  | "approved"
  | "production"
  | "deprecated"
  | "fixture";

export type SkillManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  origin: SkillOrigin;
  runtime: {
    type: "instruction" | "executable" | "hybrid";
    entrypoint: string;
    code_paths?: string[];
  };
  requirements: {
    tools: string[];
    connectors: string[];
    credentials?: string[];
    dependencies?: string[];
  };
  permissions: {
    network: boolean;
    filesystem: boolean;
    execution: boolean;
    destructive?: boolean;
  };
  risk: {
    level: "low" | "medium" | "high" | "critical";
    notes?: string;
  };
  status: {
    lifecycle: SkillLifecycle;
    reviewer?: string | null;
    review_status?: "unreviewed" | "in-review" | "approved" | "rejected" | null;
    trusted?: boolean;
  };
  evaluation: {
    suite: string;
    score?: number | null;
    last_evaluated_at?: string | null;
  };
  compatibility: {
    agents: string[];
  };
};

export type EvalCase = {
  id: string;
  task: string;
  context?: string;
  expected_properties: string[];
  failure_conditions: string[];
  scoring: {
    type: "rubric" | "outcome";
    criteria: Array<{ name: string; weight: number; description?: string }>;
  };
};

export type PermissionEnvelope = {
  network: boolean;
  filesystem: boolean;
  execution: boolean;
  destructive: boolean;
};

export type CompiledSkillRef = {
  id: string;
  version: string;
  pin: string;
  path: string;
  lifecycle: SkillLifecycle;
  runtime_type: SkillManifest["runtime"]["type"];
  entrypoint: string;
  artifact_hash: string;
  permissions: PermissionEnvelope;
  requirements: { tools: string[]; connectors: string[] };
  origin_type: SkillManifest["origin"]["type"];
  trusted: boolean;
};

export type CompiledAgentPacket = {
  schema: "agent-os.compiled-agent.v1";
  agent: { id: string; name: string; version: string; status: AgentStatus };
  source: {
    commit: string | null;
    dirty: boolean;
    generated_at: string;
  };
  hashes: {
    contract: string;
  };
  identity: { path: string; sha256: string };
  instructions: {
    system: { path: string; sha256: string };
    operating_manual: { path: string; sha256: string };
    shared_policies: Array<{ id: string; path: string; sha256: string }>;
  };
  skills: CompiledSkillRef[];
  tools: string[];
  knowledge: Array<{ path: string; sha256: string | null; kind: "dir" | "file" }>;
  evaluation: { suite: string; cases: string[] };
  runtime: {
    loader: string;
    sync: string;
    stale_check: {
      contract_hash: string;
      commit: string | null;
    };
    skill_retrieval: "reference-only";
  };
};

export type CompiledSkillPacket = {
  schema: "agent-os.compiled-skill.v1";
  skill: { id: string; name: string; version: string; lifecycle: SkillLifecycle };
  source: {
    commit: string | null;
    dirty: boolean;
    generated_at: string;
  };
  hashes: { artifact: string };
  entrypoint: { path: string; sha256: string };
  origin_type: SkillManifest["origin"]["type"];
  permissions: PermissionEnvelope;
  requirements: { tools: string[]; connectors: string[] };
  runtime: { type: SkillManifest["runtime"]["type"]; entrypoint: string };
  trusted: boolean;
};
