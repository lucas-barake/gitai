import { Command, CommandExecutor } from "@effect/platform";
import { Effect, Option } from "effect";
import { OptionsContext } from "@/Options.js";
import { BunContext } from "@effect/platform-bun";

export class GitClient extends Effect.Service<GitClient>()("@gitai/GitClient", {
  dependencies: [BunContext.layer],
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    const getStagedDiff = Effect.fn("getStagedDiff")(function* () {
      const opts = yield* OptionsContext;
      const getDiffCommand = Command.make(
        "git",
        ...["diff", "--staged", `-U${Option.getOrElse(opts.contextLines, () => 3)}`],
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

    return {
      getStagedDiff,
      commit,
    } as const;
  }),
}) {}
