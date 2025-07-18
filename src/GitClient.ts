import { Command, CommandExecutor } from "@effect/platform";
import { Effect } from "effect";

export class GitClient extends Effect.Service<GitClient>()("GitClient", {
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    const getStagedDiff = Effect.gen(function* () {
      const getDiffCommand = Command.make("git", "diff", "--staged");
      const diff = yield* executor
        .string(getDiffCommand)
        .pipe(Effect.orDieWith(() => "Failed to get staged diff. Is git installed?"));
      return diff.trim();
    }).pipe(Effect.withSpan("GitClient.getStagedDiff"));

    const commit = (message: string) =>
      Effect.gen(function* () {
        const commitCommand = Command.make("git", "commit", "-m", message);
        const exitCode = yield* executor.exitCode(commitCommand);
        if (exitCode === 0) {
          yield* Effect.log("✅ Successfully committed changes!");
        } else {
          return yield* Effect.dieMessage(
            `Failed to commit. 'git' command exited with code: ${exitCode}`,
          );
        }
      }).pipe(Effect.withSpan("GitClient.commit"));

    return {
      getStagedDiff,
      commit,
    } as const;
  }),
}) {}
