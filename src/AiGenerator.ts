import type { Schema, Record } from "effect";
import { Effect, JSONSchema, SchemaAST } from "effect";
import { AiLanguageModel } from "./AiLanguageModel.js";
import { CommitMessage, PrDetails, PrReviewDetails, PrTitle } from "./internal/schemas.js";
import {
  makeCommitMessagePrompt,
  makePrDetailsPrompt,
  makeReviewPrompt,
  makeTitlePrompt,
} from "./internal/prompts.js";
import type { JsonSchema7Object, JsonSchema7Root } from "effect/JSONSchema";

export const REVIEW_COMMENT_TAG = "<!-- git-gen-review -->";

const removeAdditionalProperties = (schema: unknown): unknown => {
  if (Array.isArray(schema)) {
    return schema.map(removeAdditionalProperties);
  }
  if (schema !== null && typeof schema === "object") {
    const newSchema = { ...(schema as object) };
    delete (newSchema as Partial<JsonSchema7Object>).additionalProperties;

    for (const key in newSchema) {
      (newSchema as any)[key] = removeAdditionalProperties((newSchema as any)[key]);
    }
    return newSchema;
  }
  return schema;
};

const isParseJsonTransformation = (ast: SchemaAST.AST): boolean =>
  ast.annotations[SchemaAST.SchemaIdAnnotationId] === SchemaAST.ParseJsonSchemaId;

const makeOpenApiSchema = <A, I, R>(schema: Schema.Schema<A, I, R>): JsonSchema7Root => {
  const definitions: Record<string, any> = {};

  const ast =
    SchemaAST.isTransformation(schema.ast) && isParseJsonTransformation(schema.ast.from)
      ? schema.ast.to
      : schema.ast;

  const jsonSchema = JSONSchema.fromAST(ast, {
    definitions,
    target: "openApi3.1",
    topLevelReferenceStrategy: "skip",
  });

  return removeAdditionalProperties(jsonSchema) as JsonSchema7Root;
};

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
    const filterDiff = (rawDiff: string) =>
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
      ).pipe(Effect.withSpan("AiGenerator.filterDiff"));

    const generatePrDetails = (diff: string) =>
      Effect.gen(function* () {
        const prompt = makePrDetailsPrompt(diff);

        return yield* ai.generateObject({
          prompt,
          schema: PrDetails,
          responseSchema: makeOpenApiSchema(PrDetails),
        });
      }).pipe(Effect.withSpan("AiGenerator.generatePrDetailsFromDiff"));

    const generateCommitMessage = (diff: string) =>
      Effect.gen(function* () {
        const prompt = makeCommitMessagePrompt(diff);

        const result = yield* ai.generateObject({
          prompt,
          schema: CommitMessage,
          responseSchema: makeOpenApiSchema(CommitMessage),
        });

        return result.message;
      }).pipe(Effect.withSpan("AiGenerator.generateCommitMessageFromDiff"));

    const generateTitle = (diff: string) =>
      Effect.gen(function* () {
        const prompt = makeTitlePrompt(diff);

        const result = yield* ai.generateObject({
          prompt,
          schema: PrTitle,
          responseSchema: makeOpenApiSchema(PrTitle),
        });

        return result.title;
      }).pipe(Effect.withSpan("AiGenerator.generateTitleFromDiff"));

    const generateReview = (diff: string) =>
      Effect.gen(function* () {
        yield* Effect.log("Generating review...");
        const prompt = makeReviewPrompt(diff);

        const result = yield* ai.generateObject({
          prompt,
          schema: PrReviewDetails,
          responseSchema: makeOpenApiSchema(PrReviewDetails),
        });

        return result;
      }).pipe(Effect.withSpan("AiGenerator.generateReviewFromDiff"));

    return {
      generatePrDetails: (diff: string) =>
        filterDiff(diff).pipe(
          Effect.andThen(generatePrDetails),
          Effect.orDieWith((error) => `Failed to generate PR details: ${error.message}`),
          Effect.map((details) => ({
            title: details.title,
            body: formatPrDescription(details),
          })),
        ),
      generateCommitMessage: (diff: string) =>
        filterDiff(diff).pipe(
          Effect.andThen(generateCommitMessage),
          Effect.orDieWith((error) => `Failed to generate commit message: ${error.message}`),
        ),
      generateTitle: (diff: string) =>
        filterDiff(diff).pipe(
          Effect.andThen(generateTitle),
          Effect.orDieWith((error) => `Failed to generate PR title: ${error.message}`),
        ),
      generateReview: (diff: string) =>
        filterDiff(diff).pipe(
          Effect.andThen(generateReview),
          Effect.orDieWith((error) => `Failed to generate review: ${error.message}`),
          Effect.map(formatReviewAsMarkdown),
        ),
    } as const;
  }),
}) {}
