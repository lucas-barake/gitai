import { Command as CliCommand, Options, Prompt } from "@effect/cli";
import { Command as PlatformCommand, CommandExecutor } from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect, Option, Schema } from "effect";
import { AiGenerator, PrDetails, PrReviewDetails } from "./AiGenerator.js";

const repoOption = Options.text("repo").pipe(
  Options.optional,
  Options.withDescription(
    "Specify a custom repository (e.g., 'owner/repo'). Defaults to local detection.",
  ),
);

const getLocalRepo = Effect.gen(function* () {
  yield* Effect.logInfo("Detecting current repository...");

  const executor = yield* CommandExecutor.CommandExecutor;
  const getRepoCommand = PlatformCommand.make("gh", "repo", "view", "--json", "nameWithOwner");
  return yield* executor.string(getRepoCommand).pipe(
    Effect.filterOrFail(
      (s) => s.trim() !== "",
      () => new Error(),
    ),
    Effect.flatMap(
      Schema.decode(Schema.parseJson(Schema.Struct({ nameWithOwner: Schema.String }))),
    ),
    Effect.orDieWith(
      () => "Failed to detect repository. Are you inside a Git repository directory?",
    ),
    Effect.map(({ nameWithOwner }) => nameWithOwner),
  );
});

const formatPrDescription = (details: PrDetails) => {
  const fileSummaries = details.fileSummaries
    .map((summary) => `| ${summary.file} | ${summary.description} |`)
    .join("\n");

  return `${details.description}

<details>
<summary>Show a summary per file</summary>

| File | Description |
| ---- | ----------- |
${fileSummaries}
</details>`;
};

const formatReviewAsMarkdown = (review: PrReviewDetails) => {
  const reviewItems = review.review
    .map(
      (item) =>
        `**${item.file}:${item.line}**\n* [${item.category}] ${item.comment}\n\`\`\`\n${item.codeSnippet}\n\`\`\``,
    )
    .join("\n\n");

  return `<!-- pr-github-bot-review -->
<details>
<summary>Review</summary>

${reviewItems}
</details>`;
};

const PrComment = Schema.Struct({
  id: Schema.String,
  body: Schema.String,
});

const main = CliCommand.make("pr-gen", { repoOption }, ({ repoOption }) =>
  Effect.gen(function* () {
    const ai = yield* AiGenerator;
    const executor = yield* CommandExecutor.CommandExecutor;

    const nameWithOwner = yield* Option.match(repoOption, {
      onNone: () => getLocalRepo,
      onSome: (repo) => Effect.succeed(repo),
    });

    yield* Effect.logInfo(`Using repository: ${nameWithOwner}`);

    const prNumber = yield* Prompt.text({
      message: "Please enter the PR number:",
    });

    yield* Effect.logInfo(`Fetching diff for PR #${prNumber}...`);
    const getDiffCommand = PlatformCommand.make("gh", "pr", "diff", prNumber, "-R", nameWithOwner);
    const diff = yield* executor
      .string(getDiffCommand)
      .pipe(
        Effect.orDieWith(() => "Failed to fetch PR diff. Is `gh` installed and are you logged in?"),
      );

    if (diff.trim() === "") {
      yield* Effect.logInfo("PR diff is empty. Nothing to generate.");
      return;
    }

    const action = yield* Prompt.select({
      message: "What would you like to do?",
      choices: [
        { title: "Generate PR details (title and description)", value: "details" as const },
        { title: "Generate a review and post as a comment", value: "review" as const },
      ],
    });

    if (action === "details") {
      yield* Effect.logInfo("Generating PR title and description...");
      const details = yield* ai
        .generatePrDetails(diff)
        .pipe(
          Effect.orDieWith(() => "Failed to generate PR details. Check logs for more details."),
        );

      yield* Effect.logInfo(`\nGenerated PR details:\n${JSON.stringify(details, null, 2)}`);

      yield* Effect.logInfo(`Updating PR #${prNumber} on GitHub...`);
      const updatePrCommand = PlatformCommand.make(
        "gh",
        "pr",
        "edit",
        String(prNumber),
        "-R",
        nameWithOwner,
        "--title",
        details.title,
        "--body",
        formatPrDescription(details),
      );
      const exitCode = yield* executor.exitCode(updatePrCommand);

      if (exitCode === 0) {
        yield* Effect.logInfo(`✅ Successfully updated PR #${prNumber} on ${nameWithOwner}!`);
      } else {
        return yield* Effect.dieMessage(
          `Failed to update PR. 'gh' command exited with code: ${exitCode}`,
        );
      }
    } else {
      yield* Effect.logInfo("Generating review...");

      const listCommentsCommand = PlatformCommand.make(
        "gh",
        "pr",
        "comment",
        prNumber,
        "-R",
        nameWithOwner,
        "--json",
        "id,body",
      );

      const comments = yield* executor.string(listCommentsCommand).pipe(
        Effect.flatMap(Schema.decode(Schema.parseJson(Schema.Array(PrComment)))),
        Effect.catchAll(() => Effect.succeed([])),
      );

      const previousComment = comments.find((comment) =>
        comment.body.includes("<!-- pr-github-bot-review -->"),
      );

      if (previousComment) {
        yield* Effect.logInfo(`Deleting previous review comment...`);
        const deleteCommentCommand = PlatformCommand.make(
          "gh",
          "pr",
          "comment",
          "--delete",
          previousComment.id,
          "-R",
          nameWithOwner,
        );
        yield* executor.exitCode(deleteCommentCommand);
      }

      const review = yield* ai
        .generateReview(diff)
        .pipe(Effect.orDieWith(() => "Failed to generate review. Check logs for more details."));

      const markdown = formatReviewAsMarkdown(review);
      yield* Effect.logInfo(`\nGenerated Review:\n${markdown}`);

      yield* Effect.logInfo(`Adding review comment to PR #${prNumber} on GitHub...`);
      const addCommentCommand = PlatformCommand.make(
        "gh",
        "pr",
        "comment",
        prNumber,
        "-R",
        nameWithOwner,
        "--body",
        markdown,
      );

      const exitCode = yield* executor.exitCode(addCommentCommand);
      if (exitCode === 0) {
        yield* Effect.logInfo(
          `✅ Successfully added review comment to PR #${prNumber} on ${nameWithOwner}!`,
        );
      } else {
        return yield* Effect.dieMessage(
          `Failed to add comment. 'gh' command exited with code: ${exitCode}`,
        );
      }
    }
  }),
);

const cli = CliCommand.run(main, {
  name: "AI PR Generator",
  version: "1.0.0",
});

cli(process.argv).pipe(
  Effect.provide(AiGenerator.Default),
  Effect.provide(BunContext.layer),
  BunRuntime.runMain,
);
