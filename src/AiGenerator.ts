import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { Config, Effect, Redacted, Schema } from "effect";

const makeSchemaFromResponse = <A, I>(schema: Schema.Schema<A, I>) =>
  Schema.Struct({
    candidates: Schema.Tuple(
      Schema.Struct({
        content: Schema.Struct({
          parts: Schema.Tuple(
            Schema.Struct({
              parsed: Schema.parseJson(schema).pipe(
                Schema.propertySignature,
                Schema.fromKey("text"),
              ),
            }),
          ),
        }),
      }),
    ),
  });

export class PrDetails extends Schema.Class<PrDetails>("PrDetails")(
  Schema.Struct({
    title: Schema.String.annotations({
      description: "The PR title",
    }),
    description: Schema.String.annotations({
      description: "The PR description",
    }),
  }),
) {}

export class PrReviewDetails extends Schema.Class<PrReviewDetails>("PrReviewDetails")(
  Schema.Struct({
    fileSummaries: Schema.Array(
      Schema.Struct({
        file: Schema.String.annotations({ description: "The file path" }),
        description: Schema.String.annotations({
          description: "A one-sentence summary of the changes in the file",
        }),
      }),
    ),
    review: Schema.Array(
      Schema.Struct({
        file: Schema.String.annotations({ description: "The file path for the comment" }),
        line: Schema.Number.annotations({ description: "The line number for the comment" }),
        category: Schema.String.annotations({
          description:
            "The category of the feedback (e.g., 'Security', 'Bug', 'Optimization', 'Improvement')",
        }),
        comment: Schema.String.annotations({ description: "The review comment" }),
        codeSnippet: Schema.String.annotations({ description: "The relevant code snippet" }),
      }),
    ),
  }),
) {}

const prDetailsResponseSchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "The PR title",
    },
    description: {
      type: "string",
      description: "The PR description",
    },
  },
  required: ["title", "description"],
};

const prReviewResponseSchema = {
  type: "object",
  properties: {
    fileSummaries: {
      type: "array",
      description: "A one-sentence summary for each changed file.",
      items: {
        type: "object",
        properties: {
          file: { type: "string", description: "The file path" },
          description: {
            type: "string",
            description: "A one-sentence summary of the changes in the file",
          },
        },
        required: ["file", "description"],
      },
    },
    review: {
      type: "array",
      description:
        "A list of considerations and potential improvements. Only include feedback that is constructive and actionable.",
      items: {
        type: "object",
        properties: {
          file: { type: "string", description: "The file path for the feedback" },
          line: { type: "number", description: "The line number for the feedback" },
          category: {
            type: "string",
            description:
              "Category of the feedback (e.g., 'Security', 'Bug', 'Optimization', 'Improvement')",
          },
          comment: { type: "string", description: "The detailed feedback" },
          codeSnippet: { type: "string", description: "The relevant code snippet" },
        },
        required: ["file", "line", "category", "comment", "codeSnippet"],
      },
    },
  },
  required: ["fileSummaries", "review"],
};

export class AiGenerator extends Effect.Service<AiGenerator>()("AiGenerator", {
  dependencies: [FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    const apiKey = yield* Config.redacted("GOOGLE_AI_API_KEY");
    const httpClient = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(HttpClientRequest.setHeader("x-goog-api-key", Redacted.value(apiKey))),
      ),
    );

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
        const prompt = `You are an expert software engineer writing a commit message. Your task is to analyze the provided git diff and generate a concise, professional PR title and description that will be used as the squashed commit message.\n\nYour response should be succinct but thorough—include all important information, but avoid unnecessary verbosity.\n\n## Format Requirements\n\n### Title (Subject Line)\n- **Follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification:** \`type(scope): subject\`.\n  - \`type\`: Must be one of \`feat\`, \`fix\`, \`refactor\`, \`docs\`, \`style\`, \`test\`, or \`chore\`.\n  - \`scope\` (optional): The module or component affected (e.g., \`api\`, \`auth\`, \`ui\`).\n  - \`subject\`: A short, imperative-mood summary (e.g., "add user login endpoint"). Do **not** capitalize or end with a period.\n\n### Description (Body)\n- Begin with a brief paragraph explaining the **why** behind the change. What problem does it solve or what feature does it add?\n- Follow with a bulleted list under a \`Changes:\` heading that details the specific modifications. **Group related changes together by relevance or semantics, rather than listing all changes as a flat list.** You must reference the specific files affected, which can be found in the \`diff --git a/...\` lines of the provided diff.\n- Include a section titled \`How to Test / What to Expect\` that provides an overview of how to test or use the changes. Clearly describe what was seen before and what should be expected now, so reviewers know how to verify the change.\n\n## Constraints\n- The tone must be professional and direct.\n- Do **not** use emojis.\n- The title must **not** contain redundant phrases like "This PR" or "This commit".\n\n---\n\n## [Begin Task]\nAnalyze the following git diff and generate the PR title and description:\n${diff}`;

        const response = yield* httpClient
          .post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
            {
              body: HttpBody.unsafeJson({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  response_mime_type: "application/json",
                  response_schema: prDetailsResponseSchema,
                },
              }),
            },
          )
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(makeSchemaFromResponse(PrDetails))),
          );

        return response.candidates[0].content.parts[0].parsed;
      }).pipe(Effect.withSpan("AiGenerator.generatePrDetailsFromDiff"));

    const generateReview = (diff: string) =>
      Effect.gen(function* () {
        const prompt = `You are an expert code reviewer with a keen eye for detail. Your task is to analyze the provided git diff and generate a constructive review.

## Review Focus
Your feedback must be focused on the following areas:
- **Security Vulnerabilities**: Identify potential security risks.
- **Bugs**: Find potential bugs or logical errors.
- **Performance & Efficiency**: Suggest optimizations for performance, memory usage, or efficiency.
- **Code Improvements**: Offer suggestions for improving code structure, readability, or maintainability.

## Important Constraints
- **No Praise**: Do not include praise or positive affirmations. Focus solely on constructive, actionable feedback.
- **Be Specific**: If you don't find any issues in a file or section of code, do not comment on it. Only provide feedback where there is a clear issue or room for improvement.
- **JSON Output**: Your response must be in JSON format.

## Output Structure
- **fileSummaries**: Provide a concise, one-sentence summary for each changed file.
- **review**: A list of considerations and potential improvements. For each item, provide:
  - \`file\`: The file path.
  - \`line\`: The line number.
  - \`category\`: The category of feedback (e.g., 'Security', 'Bug', 'Optimization', 'Improvement').
  - \`comment\`: A detailed, constructive comment explaining the issue and suggesting a fix.
  - \`codeSnippet\`: The relevant code snippet.

## [Begin Task]
Analyze the following git diff and generate the review in the specified JSON format:\n${diff}`;

        const response = yield* httpClient
          .post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
            {
              body: HttpBody.unsafeJson({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  response_mime_type: "application/json",
                  response_schema: prReviewResponseSchema,
                },
              }),
            },
          )
          .pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(makeSchemaFromResponse(PrReviewDetails)),
            ),
          );

        return response.candidates[0].content.parts[0].parsed;
      }).pipe(Effect.withSpan("AiGenerator.generateReviewFromDiff"));

    return {
      generatePrDetails: (diff: string) => filterDiff(diff).pipe(Effect.andThen(generatePrDetails)),
      generateReview: (diff: string) => filterDiff(diff).pipe(Effect.andThen(generateReview)),
    } as const;
  }),
}) {}
