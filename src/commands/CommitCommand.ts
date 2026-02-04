import { AiGenerator } from "@/services/AiGenerator/AiGenerator.js";
import { contextLinesOption, contextOption, provideCliOption, provideModel } from "@/services/CliOptions.js";
import { GitClient } from "@/services/GitClient.js";
import { Command, Prompt } from "@effect/cli";
import { Effect, String } from "effect";

export const CommitCommand = Command.make(
  "commit",
  { contextOption, contextLinesOption },
  (opts) =>
    Effect.gen(function* () {
      const ai = yield* AiGenerator;
      const git = yield* GitClient;

      const diff = yield* git.getStagedDiff;
      if (String.isEmpty(diff)) {
        yield* Effect.log("No staged changes found. Nothing to commit.");
        return;
      }

      const message = yield* ai.generateCommitMessage(diff);
      yield* Effect.log(message);
      const confirm = yield* Prompt.confirm({
        message: "Would you like to commit with this message?",
      });

      if (confirm) {
        yield* git.commit(message);
        yield* Effect.log("✅ Successfully committed changes!");
      }
    }).pipe(
      provideCliOption("contextLines", opts.contextLinesOption),
      provideCliOption("context", opts.contextOption),
      provideModel("commit"),
    ),
);
