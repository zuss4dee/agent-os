import { readFileSync } from "node:fs";
import yaml from "js-yaml";

export function loadYamlFile<T>(path: string): T {
  const raw = readFileSync(path, "utf8");
  const parsed = yaml.load(raw, { filename: path });
  if (parsed === undefined || parsed === null) {
    throw new Error(`YAML file is empty: ${path}`);
  }
  return parsed as T;
}

export function dumpYaml(value: unknown): string {
  return yaml.dump(value, { noRefs: true, lineWidth: 100 });
}
