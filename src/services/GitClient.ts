import { CliOption } from "@/services/CliOptions.js";
import { Command, CommandExecutor } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect, Option } from "effect";

export interface GitCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly subject: string;
  readonly body: string;
  readonly author: string;
  readonly date: string;
}

export class GitClient extends Effect.Service<GitClient>()("@gitai/GitClient", {
  dependencies: [BunContext.layer],
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    const getStagedDiff = Effect.gen(function* () {
      const contextLines = yield* CliOption("contextLines");
      const getDiffCommand = Command.make(
        "git",
        ...["diff", "--staged", `-U${Option.getOrElse(contextLines, () => 3)}`],
      );
      const diff = yield* executor
        .string(getDiffCommand)
        .pipe(Effect.orDieWith(() => "Failed to get staged diff. Is git installed?"));
      return diff.trim();
    });

    const commit = Effect.fn("commit")(function* (message: string) {
      const commitCommand = Command.make("git", "commit", "-m", message);
      const exitCode = yield* executor.exitCode(commitCommand);
      if (exitCode !== 0) {
        return yield* Effect.dieMessage(
          `Failed to commit. 'git' command exited with code: ${exitCode}`,
        );
      }
    });

    const getCommitRange = Effect.fn("getCommitRange")(function* (
      fromHash: string,
      toHash: string = "HEAD",
    ) {
      const logCommand = Command.make(
        "git",
        "log",
        "--format=%H%n%h%n%s%n%b%n%an%n%ad%n---COMMIT-END---",
        "--date=iso",
        `${fromHash}..${toHash}`,
      );

      const output = yield* executor
        .string(logCommand)
        .pipe(
          Effect.orDieWith(
            () => `Failed to get commit range ${fromHash}..${toHash}. Check if commits exist.`,
          ),
        );

      if (output.trim() === "") {
        return [];
      }

      const commits = output
        .split("---COMMIT-END---")
        .filter((chunk) => chunk.trim() !== "")
        .map((chunk) => {
          const lines = chunk.trim().split("\n");
          const hash = lines[0] || "";
          const shortHash = lines[1] || "";
          const subject = lines[2] || "";
          const bodyLines = lines.slice(3, -2);
          const body = bodyLines.join("\n").trim();
          const author = lines[lines.length - 2] || "";
          const date = lines[lines.length - 1] || "";

          return {
            hash,
            shortHash,
            subject,
            body,
            author,
            date,
          } satisfies GitCommit;
        });

      return commits;
    });

    const getAllCommits = Effect.fn("getAllCommits")(function* (limit: number = 50) {
      const logCommand = Command.make(
        "git",
        "log",
        "--format=%H%n%h%n%s%n%b%n%an%n%ad%n---COMMIT-END---",
        "--date=iso",
        `-n${limit}`,
      );

      const output = yield* executor
        .string(logCommand)
        .pipe(Effect.orDieWith(() => "Failed to get commit history. Is git installed?"));

      const commits = output
        .split("---COMMIT-END---")
        .filter((chunk) => chunk.trim() !== "")
        .map((chunk) => {
          const lines = chunk.trim().split("\n");
          const hash = lines[0] || "";
          const shortHash = lines[1] || "";
          const subject = lines[2] || "";
          const bodyLines = lines.slice(3, -2);
          const body = bodyLines.join("\n").trim();
          const author = lines[lines.length - 2] || "";
          const date = lines[lines.length - 1] || "";

          return {
            hash,
            shortHash,
            subject,
            body,
            author,
            date,
          } satisfies GitCommit;
        });

      return commits;
    });

    return {
      getStagedDiff,
      commit,
      getCommitRange,
      getAllCommits,
    } as const;
  }),
}) {}
