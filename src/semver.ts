export const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;
export const SKILL_PIN = /^([a-z][a-z0-9-]*)@([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)$/;
export const AGENT_ID = /^[a-z][a-z0-9-]*$/;

export type SkillPin = { id: string; version: string };

export function isSemver(value: string): boolean {
  return SEMVER.test(value);
}

export function parseSkillPin(value: string | SkillPin): SkillPin {
  if (typeof value === "object") {
    if (!value.id || !value.version) {
      throw new Error("Skill pin object requires id and version");
    }
    return { id: value.id, version: value.version };
  }
  const match = SKILL_PIN.exec(value);
  if (!match) {
    throw new Error(`Malformed skill pin "${value}". Expected id@semver, e.g. source-verification@1.0.0`);
  }
  return { id: match[1], version: match[2] };
}

export function formatSkillPin(pin: SkillPin): string {
  return `${pin.id}@${pin.version}`;
}
