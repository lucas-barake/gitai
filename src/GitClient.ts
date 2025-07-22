import { Command, CommandExecutor } from "@effect/platform";
import { Effect } from "effect";

export class GitClient extends Effect.Service<GitClient>()("GitClient", {
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    const getStagedDiff = Effect.fn("getStagedDiff")(function* (contextLines?: number) {
      const args = ["diff", "--staged"];
      if (typeof contextLines === "number") args.push(`-U${contextLines}`);
      const getDiffCommand = Command.make("git", ...args);
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

    return {
      getStagedDiff,
      commit,
    } as const;
  }),
}) {}
