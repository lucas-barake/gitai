import { AiGenerator } from "@/services/AiGenerator/AiGenerator.js";
import {
  contextOption,
  modelOption,
  provideCliOption,
  provideModel,
} from "@/services/CliOptions.js";
import { GitClient } from "@/services/GitClient.js";
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";

const fromOption = Options.text("from").pipe(
  Options.withDescription("Starting commit hash for the changelog range"),
);

const toOption = Options.text("to").pipe(
  Options.withDescription("Ending commit hash for the changelog range (defaults to HEAD)"),
  Options.withDefault("HEAD"),
);

export const ChangelogCommand = Command.make(
  "changelog",
  {
    from: fromOption,
    to: toOption,
    contextOption,
    modelOption,
  },
  (opts) =>
    Effect.gen(function* () {
      const gitClient = yield* GitClient;
      const aiGenerator = yield* AiGenerator;

      const fromHash = opts.from;
      const toHash = opts.to;

      console.log(`Generating changelog for range: ${fromHash}..${toHash}`);

      const commits = yield* gitClient.getCommitRange(fromHash, toHash);

      if (commits.length === 0) {
        return yield* Effect.dieMessage(
          `No commits found in range ${fromHash}..${toHash}. Please check your commit hashes.`,
        );
      }

      console.log(`Found ${commits.length} commits. Generating changelog...`);

      const changelog = yield* aiGenerator.generateChangelog(commits);

      console.log("\n" + "=".repeat(80));
      console.log("GENERATED CHANGELOG");
      console.log("=".repeat(80) + "\n");
      console.log(changelog.changelog);
    }).pipe(provideCliOption("context", opts.contextOption), provideModel(opts.modelOption)),
);
