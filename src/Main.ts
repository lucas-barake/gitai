#!/usr/bin/env bun
import { Command, Options, Prompt } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Cause, Effect, Layer, Logger, Option, String } from "effect";
import { AiGenerator, REVIEW_COMMENT_TAG } from "./AiGenerator.js";
import { AiLanguageModel } from "./AiLanguageModel.js";
import { cliLogger } from "./CliLogger.js";
import { GitClient } from "./GitClient.js";
import { GitHubClient } from "./GitHubClient.js";

const repoOption = Options.text("repo").pipe(
  Options.optional,
  Options.withDescription(
    "Specify a custom repository (e.g., 'owner/repo'). Defaults to local detection.",
  ),
);

const prCommand = Command.make(
  "gh",
  { repoOption },
  Effect.fn(function* ({ repoOption }) {
    const ai = yield* AiGenerator;
    const github = yield* GitHubClient;

    const nameWithOwner = yield* Option.match(repoOption, {
      onNone: () =>
        Effect.log("Detecting current repository...").pipe(Effect.zipRight(github.getLocalRepo())),
      onSome: (repo) => Effect.succeed(repo),
    });
    yield* Effect.log(`Using repository: ${nameWithOwner}`);

    const prNumber = yield* Prompt.text({
      message: "Please enter the PR number:",
    });

    yield* Effect.log(`Fetching diff for PR #${prNumber}...`);
    const diff = yield* github.getPrDiff(prNumber, nameWithOwner);
    yield* Effect.logDebug(`Diff for PR #${prNumber}: ${diff}`);

    if (String.isEmpty(diff)) {
      yield* Effect.log("PR diff is empty. Nothing to generate.");
      return;
    }

    const action = yield* Prompt.select({
      message: "What would you like to do?",
      choices: [
        { title: "Generate title and description", value: "details" as const },
        { title: "Generate title only", value: "title" as const },
        { title: "Generate a review and post as a comment", value: "review" as const },
      ],
    });

    switch (action) {
      case "details": {
        yield* Effect.log(`Generating PR title and description for PR #${prNumber}...`);
        const details = yield* ai.generatePrDetails(diff);
        yield* Effect.log(`Generated PR details:\n${JSON.stringify(details, null, 2)}`);

        yield* Effect.log(`Updating PR #${prNumber} on GitHub...`);
        yield* github.updatePr({
          prNumber,
          repo: nameWithOwner,
          title: details.title,
          body: details.body,
        });
        yield* Effect.log(`✅ Successfully updated PR #${prNumber} on GitHub!`);
        break;
      }
      case "review": {
        yield* Effect.log(`Listing comments for PR #${prNumber}...`);
        const comments = yield* github.listPrComments(prNumber, nameWithOwner);

        const previousComment = comments.find((comment) =>
          comment.body.includes(REVIEW_COMMENT_TAG),
        );
        yield* Effect.logDebug(`Found ${comments.length} comments for PR #${prNumber}`);

        yield* Effect.log(`Generating review for PR #${prNumber}...`);
        const markdown = yield* ai.generateReview(diff);
        yield* Effect.log(`\nGenerated Review:\n${markdown}`);

        yield* Effect.log(`Adding new review comment to PR #${prNumber}...`);
        yield* github.addPrComment({ prNumber, repo: nameWithOwner, body: markdown });
        yield* Effect.log(`✅ Successfully added review comment to PR #${prNumber}!`);

        if (previousComment) {
          yield* Effect.log(`Deleting previous review comment...`);
          yield* github.deletePrComment(previousComment.id);
        }

        break;
      }
      case "title": {
        yield* Effect.log("Generating PR title...");
        const title = yield* ai.generateTitle(diff);
        yield* Effect.log(`\nGenerated PR Title:\n\n${title}\n`);

        yield* github.updatePr({ prNumber, repo: nameWithOwner, title });
        yield* Effect.log(`✅ Successfully updated PR #${prNumber} on GitHub!`);
        break;
      }
    }
  }),
);

const commitCommand = Command.make(
  "commit",
  {},
  Effect.fn(function* () {
    const ai = yield* AiGenerator;
    const git = yield* GitClient;

    const diff = yield* git.getStagedDiff();
    if (String.isEmpty(diff)) {
      yield* Effect.log("No staged changes found. Nothing to commit.");
      return;
    }

    yield* Effect.log("Generating commit message...");
    const message = yield* ai.generateCommitMessage(diff);
    yield* Effect.log(`Generated commit message:\n\n${message}\n`);

    const confirm = yield* Prompt.confirm({
      message: "Would you like to commit with this message?",
    });

    if (confirm) {
      yield* git.commit(message);
      yield* Effect.log("✅ Successfully committed changes!");
    }
  }),
);

const mainCommand = Command.make("gitai").pipe(Command.withSubcommands([prCommand, commitCommand]));

const cli = Command.run(mainCommand, {
  name: "AI Git Assistant",
  version: "2.0.0",
});

const MainLayer = Layer.mergeAll(
  AiGenerator.Default,
  AiLanguageModel.Default,
  GitHubClient.Default,
  GitClient.Default,
  Logger.replace(Logger.defaultLogger, cliLogger),
).pipe(Layer.provideMerge(BunContext.layer));

cli(process.argv).pipe(
  Effect.tapErrorCause((cause) => {
    if (Cause.isInterruptedOnly(cause)) {
      return Effect.void;
    }
    return Effect.logError(cause);
  }),
  Effect.provide(MainLayer),
  BunRuntime.runMain({
    disablePrettyLogger: true,
    disableErrorReporting: true,
  }),
);
