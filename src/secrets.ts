import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SECRET_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "pem-private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { id: "github-pat", re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { id: "github-fine-grained", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { id: "xai-key-literal", re: /\bxai-[A-Za-z0-9]{20,}\b/ },
  { id: "generic-bearer", re: /\bBearer [A-Za-z0-9\-._~+/]+=*\b/ },
];

const PLACEHOLDER = /(YOUR_|CHANGE_ME|REDACTED|EXAMPLE|placeholder|<[^>]+>|dummy)/i;

export function scanPathForSecrets(root: string): string[] {
  const findings: string[] = [];
  walk(root, (file) => {
    if (shouldSkip(file)) return;
    const text = readFileSync(file, "utf8");
    for (const pattern of SECRET_PATTERNS) {
      const match = pattern.re.exec(text);
      if (match && !PLACEHOLDER.test(match[0])) {
        findings.push(`${relative(root, file)}: possible secret (${pattern.id})`);
      }
    }
  });
  return findings;
}

function shouldSkip(file: string): boolean {
  return (
    file.includes("/node_modules/") ||
    file.includes("/.git/") ||
    file.endsWith(".png") ||
    file.endsWith(".jpg") ||
    file.endsWith(".webp")
  );
}

function walk(dir: string, visit: (file: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, visit);
    else visit(full);
  }
}
