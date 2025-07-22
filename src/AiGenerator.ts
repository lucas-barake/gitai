import type { Option } from "effect";
import { Effect } from "effect";
import { AiLanguageModel } from "./AiLanguageModel.js";
import { CommitMessage, PrDetails, PrReviewDetails, PrTitle } from "./internal/schemas.js";
import {
  makeCommitMessagePrompt,
  makePrDetailsPrompt,
  makeReviewPrompt,
  makeTitlePrompt,
} from "./internal/prompts.js";

const orDie =
  (message: string) =>
  <A, E extends { message: string }, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(Effect.orDieWith((error) => `${message}: ${error.message}`));

export const REVIEW_COMMENT_TAG = "<!-- [gitai-review](https://github.com/lucas-barake/gitai) -->";

export class AiGenerator extends Effect.Service<AiGenerator>()("AiGenerator", {
  dependencies: [AiLanguageModel.Default],
  effect: Effect.gen(function* () {
    const ai = yield* AiLanguageModel;

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

      return `${REVIEW_COMMENT_TAG}\n<details>\n<summary>Review</summary>\n\n${reviewItems}\n</details>`;
    };

    /**
     * Removes configuration files from diff to focus AI analysis on code changes
     */
    const filterDiff = Effect.fn("filterDiff")((rawDiff: string) =>
      Effect.sync(() =>
        rawDiff
          .split("diff --git")
          .filter((part) => {
            if (!part.trim()) {
              return false;
            }
            const firstLine = part.substring(0, part.indexOf("\n"));
            if (/\.(json|ya?ml)\s/.test(firstLine)) {
              return false;
            }
            return true;
          })
          .map((part) => `diff --git${part}`)
          .join(""),
      ),
    );

    const generatePrDetails = Effect.fn("AiGenerator.generatePrDetails")(
      (diff: string, context: Option.Option<string>) =>
        filterDiff(diff).pipe(
          Effect.flatMap((diff) =>
            ai.generateObject({
              prompt: makePrDetailsPrompt(diff, context),
              schema: PrDetails,
            }),
          ),
          Effect.map((details) => ({
            title: details.title,
            body: formatPrDescription(details),
          })),
          orDie("Failed to generate PR details"),
        ),
    );

    const generateCommitMessage = Effect.fn("AiGenerator.generateCommitMessage")(
      (diff: string, context: Option.Option<string>) =>
        filterDiff(diff).pipe(
          Effect.flatMap((diff) =>
            ai.generateObject({
              prompt: makeCommitMessagePrompt(diff, context),
              schema: CommitMessage,
            }),
          ),
          Effect.map((generated) => generated.message),
          orDie("Failed to generate commit message"),
        ),
    );

    const generateTitle = Effect.fn("AiGenerator.generateTitle")(
      (diff: string, context: Option.Option<string>) =>
        filterDiff(diff).pipe(
          Effect.flatMap((diff) =>
            ai.generateObject({
              prompt: makeTitlePrompt(diff, context),
              schema: PrTitle,
            }),
          ),
          Effect.map((generated) => generated.title),
          orDie("Failed to generate PR title"),
        ),
    );

    const generateReview = Effect.fn("AiGenerator.generateReview")(
      (diff: string, context: Option.Option<string>) =>
        filterDiff(diff).pipe(
          Effect.flatMap((diff) =>
            ai.generateObject({
              prompt: makeReviewPrompt(diff, context),
              schema: PrReviewDetails,
            }),
          ),
          Effect.map(formatReviewAsMarkdown),
          orDie("Failed to generate review"),
        ),
    );

    return {
      generatePrDetails,
      generateCommitMessage,
      generateTitle,
      generateReview,
    } as const;
  }),
}) {}
