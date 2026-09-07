import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type GitSource = {
  commit: string | null;
  dirty: boolean;
  describe: string;
};

export function readGitSource(repoRoot: string): GitSource {
  if (!existsSync(join(repoRoot, ".git"))) {
    return { commit: null, dirty: true, describe: "no-git" };
  }
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      commit,
      dirty: status.trim().length > 0,
      describe: commit,
    };
  } catch {
    return { commit: null, dirty: true, describe: "no-commits" };
  }
}
