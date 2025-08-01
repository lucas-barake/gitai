import { AiGenerator, makeReviewCommentTag } from "@/services/AiGenerator/AiGenerator.js";
import {
  contextOption,
  modelOption,
  provideCliOption,
  provideModel,
  repoOption,
} from "@/services/CliOptions.js";
import { GitHubClient, RepoWithOwner } from "@/services/GitHubClient.js";
import { LocalConfig } from "@/services/LocalConfig.js";
import { Command, Options, Prompt } from "@effect/cli";
import { Effect, Option, Schema, String } from "effect";

const prNumber = Options.integer("pr").pipe(
  Options.map((num) => num.toString()),
  Options.withDescription("The PR number"),
);

export const GhCommand = Command.make(
  "gh",
  { repoOption, contextOption, modelOption, prNumber },
  (opts) =>
    Effect.gen(function* () {
      const ai = yield* AiGenerator;
      const github = yield* GitHubClient;
      const localConfig = yield* LocalConfig;

      const repo = yield* Option.match(opts.repoOption, {
        onNone: () =>
          Effect.log("Detecting current repository...").pipe(
            Effect.zipRight(github.getLocalRepo()),
          ),
        onSome: Schema.decodeUnknown(RepoWithOwner),
      });

      yield* Effect.log(`Using repository: ${repo.string}`);

      yield* Effect.log(`Fetching diff for PR #${opts.prNumber}...`);
      const diff = yield* github.getPrDiff(opts.prNumber, repo);
      yield* Effect.logDebug(`Diff for PR #${opts.prNumber}: ${diff}`);

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
          { title: "Submit a real PR review with line comments", value: "pr-review" as const },
        ],
      });

      switch (action) {
        case "details": {
          yield* Effect.log(`Generating PR title and description for PR #${opts.prNumber}...`);
          const details = yield* ai.generatePrDetails(diff);
          yield* Effect.log(`Generated PR details:\n${JSON.stringify(details, null, 2)}`);

          yield* Effect.log(`Updating PR #${opts.prNumber} on GitHub...`);
          yield* github.updatePr({
            prNumber: opts.prNumber,
            repo,
            title: details.title,
            body: details.body,
          });
          yield* Effect.log(`✅ Successfully updated PR #${opts.prNumber} on GitHub!`);
          break;
        }
        case "review": {
          yield* Effect.log(`Listing comments for PR #${opts.prNumber}...`);
          const comments = yield* github.listPrComments(opts.prNumber, repo);

          const previousComment = comments.find((comment) =>
            comment.body.includes(makeReviewCommentTag(localConfig.username)),
          );
          yield* Effect.logDebug(`Found ${comments.length} comments for PR #${opts.prNumber}`);

          yield* Effect.log(`Generating review for PR #${opts.prNumber}...`);
          const markdown = yield* ai.generateReviewComment(diff);
          yield* Effect.log(`\nGenerated Review:\n${markdown}`);

          yield* Effect.log(`Adding new review comment to PR #${opts.prNumber}...`);
          yield* github.addPrComment({
            prNumber: opts.prNumber,
            repo,
            body: markdown,
          });
          yield* Effect.log(`✅ Successfully added review comment to PR #${opts.prNumber}!`);

          if (previousComment) {
            yield* Effect.log(`Deleting previous review comment...`);
            yield* github.deletePrComment(previousComment.id);
          }

          break;
        }
        case "pr-review": {
          yield* Effect.log(`Listing existing reviews for PR #${opts.prNumber}...`);
          const reviews = yield* github.listPrReviews(opts.prNumber, repo);

          const previousReview = reviews.find((review) =>
            review.body.includes(makeReviewCommentTag(localConfig.username)),
          );
          yield* Effect.logDebug(`Found ${reviews.length} reviews for PR #${opts.prNumber}`);

          yield* Effect.log(`Generating PR review for PR #${opts.prNumber}...`);
          const reviewData = yield* ai.generatePrLineReview(diff);
          yield* Effect.logDebug(`Generated ${reviewData.review.length} review comments`);

          if (reviewData.review.length === 0) {
            yield* Effect.log("No review comments generated. The code looks good!");
            return;
          }

          const reviewComments = reviewData.review.map((item) => ({
            path: item.file,
            line: item.line,
            body: `**[${item.category}]** ${item.comment}\n\n\`\`\`suggestion\n${item.codeSnippet}\n\`\`\``,
          }));

          const reviewBody = `${makeReviewCommentTag(localConfig.username)}

## AI Code Review

This review was automatically generated by [gitai](https://github.com/lucas-barake/gitai).

### Summary
Generated ${reviewComments.length} review comment${reviewComments.length === 1 ? "" : "s"} focusing on security, bugs, performance, and code improvements.`;

          yield* Effect.log(`Submitting PR review with ${reviewComments.length} line comments...`);
          yield* github.submitPrReview({
            prNumber: opts.prNumber,
            repo,
            comments: reviewComments,
            reviewBody,
          });
          yield* Effect.log(`✅ Successfully submitted PR review for PR #${opts.prNumber}!`);

          if (previousReview) {
            yield* Effect.log(
              `Note: Previous review by gitai may still be visible. GitHub doesn't allow deleting reviews, only dismissing them.`,
            );
          }

          break;
        }
        case "title": {
          yield* Effect.log("Generating PR title...");
          const title = yield* ai.generateTitle(diff);
          yield* Effect.log(`\nGenerated PR Title:\n\n${title}\n`);

          yield* github.updatePr({ prNumber: opts.prNumber, repo, title });
          yield* Effect.log(`✅ Successfully updated PR #${opts.prNumber} on GitHub!`);
          break;
        }
      }
    }).pipe(provideCliOption("context", opts.contextOption), provideModel(opts.modelOption)),
);
