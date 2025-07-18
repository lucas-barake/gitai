import { Command as CliCommand, Options, Prompt } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Effect, Logger, Option } from "effect";
import { AiGenerator, PrDetails, PrReviewDetails } from "./AiGenerator.js";
import { cliLogger } from "./CliLogger.js";
import { GitHubClient } from "./GitHubClient.js";

const repoOption = Options.text("repo").pipe(
  Options.optional,
  Options.withDescription(
    "Specify a custom repository (e.g., 'owner/repo'). Defaults to local detection.",
  ),
);

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

const main = CliCommand.make("pr-gen", { repoOption }, ({ repoOption }) =>
  Effect.gen(function* () {
    const ai = yield* AiGenerator;
    const github = yield* GitHubClient;

    const nameWithOwner = yield* Option.match(repoOption, {
      onNone: () => github.getLocalRepo,
      onSome: (repo) => Effect.succeed(repo),
    });

    yield* Effect.log(`Using repository: ${nameWithOwner}`);

    const prNumber = yield* Prompt.text({
      message: "Please enter the PR number:",
    });

    const diff = yield* github.getPrDiff(prNumber, nameWithOwner);
    if (diff.trim() === "") {
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
        yield* Effect.log("Generating PR title and description...");

        const details = yield* ai.generatePrDetails(diff);

        yield* Effect.log(`\nGenerated PR details:\n${JSON.stringify(details, null, 2)}`);

        yield* github.updatePr({
          prNumber,
          repo: nameWithOwner,
          title: details.title,
          body: formatPrDescription(details),
        });
        break;
      }
      case "review": {
        yield* Effect.log("Generating review...");

        const comments = yield* github.listPrComments(prNumber, nameWithOwner);

        const previousComment = comments.find((comment) =>
          comment.body.includes("<!-- pr-github-bot-review -->"),
        );

        if (previousComment) {
          yield* github.deletePrComment(previousComment.id, nameWithOwner);
        }

        const review = yield* ai.generateReview(diff);

        const markdown = formatReviewAsMarkdown(review);
        yield* Effect.log(`\nGenerated Review:\n${markdown}`);

        yield* github.addPrComment({ prNumber, repo: nameWithOwner, body: markdown });
        break;
      }
      case "title": {
        yield* Effect.log("Generating PR title...");

        const title = yield* ai.generateTitle(diff);
        yield* Effect.log(`\nGenerated PR Title:\n\n${title}\n`);

        yield* github.updatePr({ prNumber, repo: nameWithOwner, title });
        break;
      }
    }
  }),
);

const cli = CliCommand.run(main, {
  name: "AI PR Generator",
  version: "1.0.0",
});

const loggerLayer = Logger.replace(Logger.defaultLogger, cliLogger);

cli(process.argv).pipe(
  Effect.provide(AiGenerator.Default),
  Effect.provide(GitHubClient.Default),
  Effect.provide(BunContext.layer),
  Effect.provide(loggerLayer),
  BunRuntime.runMain({
    disablePrettyLogger: true,
  }),
);
