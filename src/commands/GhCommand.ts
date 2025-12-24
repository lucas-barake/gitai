import { AiGenerator, makeReviewCommentTag } from "@/services/AiGenerator/AiGenerator.js";
import { contextOption, provideCliOption, provideModel, repoOption } from "@/services/CliOptions.js";
import { GitHubClient, type OpenPr, RepoWithOwner } from "@/services/GitHubClient.js";
import { LocalConfig } from "@/services/LocalConfig.js";
import { Command, Prompt } from "@effect/cli";
import { Effect, Option, Schema, String } from "effect";

const formatPrChoice = (pr: OpenPr): string => {
  const title = pr.title.length > 60 ? pr.title.slice(0, 57) + "..." : pr.title;
  return `#${pr.number} ${title} (${pr.author.login})`;
};

export const GhCommand = Command.make(
  "gh",
  { repoOption, contextOption },
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

      // Fetch and display open PRs for selection
      yield* Effect.log("Fetching open PRs...");
      const openPrs = yield* github.listOpenPrs(repo);

      if (openPrs.length === 0) {
        yield* Effect.log("No open PRs found in this repository.");
        return;
      }

      const prChoices = openPrs.map((pr) => ({
        title: formatPrChoice(pr),
        value: pr,
      }));

      const selectedPr = yield* Prompt.select({
        message: "Select a PR to work with",
        choices: prChoices,
        maxPerPage: 10,
      });

      const prNumber = selectedPr.number.toString();

      yield* Effect.log(`Fetching diff for PR #${prNumber}...`);
      const diff = yield* github.getPrDiff(prNumber, repo);
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
          { title: "Submit a real PR review with line comments", value: "pr-review" as const },
        ],
      });

      switch (action) {
        case "details": {
          yield* Effect.log(`Generating PR title and description for PR #${prNumber}...`);
          const details = yield* ai.generatePrDetails(diff);
          yield* Effect.log(`Generated PR details:\n${JSON.stringify(details, null, 2)}`);

          yield* Effect.log(`Updating PR #${prNumber} on GitHub...`);
          yield* github.updatePr({
            prNumber: prNumber,
            repo,
            title: details.title,
            body: details.body,
          });
          yield* Effect.log(`✅ Successfully updated PR #${prNumber} on GitHub!`);
          break;
        }
        case "review": {
          yield* Effect.log(`Listing comments for PR #${prNumber}...`);
          const comments = yield* github.listPrComments(prNumber, repo);

          const previousComment = comments.find((comment) =>
            comment.body.includes(makeReviewCommentTag(localConfig.username)),
          );
          yield* Effect.logDebug(`Found ${comments.length} comments for PR #${prNumber}`);

          yield* Effect.log(`Generating review for PR #${prNumber}...`);
          const markdown = yield* ai.generateReviewComment(diff);
          yield* Effect.log(`\nGenerated Review:\n${markdown}`);

          yield* Effect.log(`Adding new review comment to PR #${prNumber}...`);
          yield* github.addPrComment({
            prNumber: prNumber,
            repo,
            body: markdown,
          });
          yield* Effect.log(`✅ Successfully added review comment to PR #${prNumber}!`);

          if (previousComment) {
            yield* Effect.log(`Deleting previous review comment...`);
            yield* github.deletePrComment(previousComment.id);
          }

          break;
        }
        case "pr-review": {
          yield* Effect.log(`Listing existing reviews for PR #${prNumber}...`);
          const reviews = yield* github.listPrReviews(prNumber, repo);

          const previousReview = reviews.find((review) =>
            review.body.includes(makeReviewCommentTag(localConfig.username)),
          );
          yield* Effect.logDebug(`Found ${reviews.length} reviews for PR #${prNumber}`);

          yield* Effect.log(`Generating PR review for PR #${prNumber}...`);
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
            prNumber: prNumber,
            repo,
            comments: reviewComments,
            reviewBody,
          });
          yield* Effect.log(`✅ Successfully submitted PR review for PR #${prNumber}!`);

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

          yield* github.updatePr({ prNumber: prNumber, repo, title });
          yield* Effect.log(`✅ Successfully updated PR #${prNumber} on GitHub!`);
          break;
        }
      }
    }).pipe(provideCliOption("context", opts.contextOption), provideModel()),
);
