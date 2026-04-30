import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function detectCommitSha(): string {
  return (
    process.env["LANTERN_COMMIT_SHA"] ??
    process.env["GITHUB_SHA"] ??
    process.env["CI_COMMIT_SHA"] ??
    git("rev-parse HEAD")
  );
}

export function detectGitBranch(): string {
  return (
    process.env["LANTERN_BRANCH"] ??
    process.env["GITHUB_REF_NAME"] ??
    process.env["CI_COMMIT_REF_NAME"] ??
    git("rev-parse --abbrev-ref HEAD")
  );
}

export function detectRepoRoot(): string {
  const fromGit = git("rev-parse --show-toplevel");
  if (fromGit) return fromGit;

  // Walk up from cwd looking for .git
  let dir = process.cwd();
  while (true) {
    if (existsSync(resolve(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
