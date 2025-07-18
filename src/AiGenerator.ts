import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { Config, Effect, Redacted, Schedule, Schema } from "effect";

export const REVIEW_COMMENT_TAG = "<!-- git-gen-review -->";

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

class PrDetails extends Schema.Class<PrDetails>("PrDetails")(
  Schema.Struct({
    title: Schema.String.annotations({
      description: "The PR title",
    }),
    description: Schema.String.annotations({
      description: "The PR description",
    }),
    fileSummaries: Schema.Array(
      Schema.Struct({
        file: Schema.String.annotations({ description: "The file path" }),
        description: Schema.String.annotations({
          description: "A one-sentence summary of the changes in the file",
        }),
      }),
    ),
  }),
) {}

export class CommitMessage extends Schema.Class<CommitMessage>("CommitMessage")(
  Schema.Struct({
    message: Schema.String.annotations({
      description: "The commit message",
    }),
  }),
) {}

export class PrReviewDetails extends Schema.Class<PrReviewDetails>("PrReviewDetails")(
  Schema.Struct({
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
  },
  required: ["title", "description", "fileSummaries"],
};

const commitMessageResponseSchema = {
  type: "object",
  properties: {
    message: {
      type: "string",
      description: "The commit message",
    },
  },
  required: ["message"],
};

const prReviewResponseSchema = {
  type: "object",
  properties: {
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
  required: ["review"],
};

const TITLE_PROMPT_SECTION = `### Title (Subject Line)
- **Follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification:** \`type(scope): subject\`.
  - **\`type\`**: Must be one of \`feat\`, \`fix\`, \`refactor\`, \`docs\`, \`style\`, \`test\`, or \`chore\`.
    - **Prioritize \`feat\`**: If the changes introduce a new user-facing capability, even if it's part of a refactor, use \`feat\`. A \`refactor\` should only be used when the primary purpose is improving internal code structure without changing observable behavior.
  - **\`scope\` (optional)**: Be specific. Derive the scope from the primary feature or area affected. Look at the file paths in the diff (e.g., \`packages/server/src/public/experiments/...\`) to determine the most relevant scope (e.g., \`experiments\`, \`auth\`, \`billing\`). Avoid generic scopes like \`server\` or \`client\` if a more specific one is available.
  - **\`subject\`**: A short, imperative-mood summary of the *most impactful change*. For a \`feat\`, describe the new capability. For a \`fix\`, describe what was fixed. Avoid generic verbs like "update" or "improve" if possible. Focus on what the change *does* for the user or the system.
`;

const prTitleResponseSchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "The PR title",
    },
  },
  required: ["title"],
};

export class AiGenerator extends Effect.Service<AiGenerator>()("AiGenerator", {
  dependencies: [FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    const apiKey = yield* Config.redacted("GOOGLE_AI_API_KEY");
    const httpClient = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(HttpClientRequest.setHeader("x-goog-api-key", Redacted.value(apiKey))),
      ),
      HttpClient.retryTransient({
        times: 3,
        schedule: Schedule.exponential("1 second", 2),
      }),
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
        const prompt = `You are an expert software engineer writing a commit message. Your task is to analyze the provided git diff and generate a concise, professional PR title and description that will be used as the squashed commit message.

Your response should be succinct but thorough—include all important information, but avoid unnecessary verbosity.

## Format Requirements

${TITLE_PROMPT_SECTION}

### Description (Body)
- Begin with a brief paragraph explaining the **why** behind the change. What problem does it solve or what feature does it add?
- **Follow with a bulleted list under a \`Changes:\` heading that tells the story of the PR.** This section should explain the changes from a feature or conceptual perspective. Group related changes semantically (e.g., "Refactored Authentication Flow," "Updated User Profile UI"). Explain *what* was done at a high level, not just what each file was changed for. This should provide a human-centric overview.
- Include a section titled \`How to Test / What to Expect\` that provides an overview of how to test or use the changes. Clearly describe what was seen before and what should be expected now, so reviewers know how to verify the change.

## Constraints
- The tone must be professional and direct.
- Do **not** use emojis.
- The title must **not** contain redundant phrases like "This PR" or "This commit".

## Output Structure (JSON)
- **title**: A string for the PR title.
- **description**: A string for the main body of the PR description, which **must include the high-level, narrative-style \`Changes:\` list** described above.
- **fileSummaries**: A separate, granular list. For each object, provide a one-sentence summary of the *specific* changes within that file. This is for a detailed file-by-file view, distinct from the main description.
  - \`file\`: The file path.
  - \`description\`: A one-sentence summary of the changes in the file.

---

## [Begin Task]
Analyze the following git diff and generate the PR title, description, and file summaries in the specified JSON format:\n${diff}`;

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

    const generateCommitMessage = (diff: string) =>
      Effect.gen(function* () {
        const prompt = `You are an expert software engineer writing a commit message. Your task is to analyze the provided git diff and generate a concise, professional commit message following the Conventional Commits specification.

Your response should be succinct but thorough—include all important information, but avoid unnecessary verbosity.

## Format Requirements

${TITLE_PROMPT_SECTION}

### Body (optional)
- **Separation**: MUST be separated from the subject line by a blank line.
- **Content**: Explain the "why" of the change: What problem was solved? What was the motivation? What is the impact?
- **Bulleted List**: For more complex changes, you MAY use a bulleted list to detail what was changed. Explain *what* was done at a high level, not just a summary of file changes.
- **BREAKING CHANGE**: If the commit introduces breaking changes, the body MUST start a new paragraph with \`BREAKING CHANGE: \` followed by a description of the change.

## Constraints
- The tone must be professional and direct.
- Do **not** use emojis.
- The entire commit message (subject + body) will be provided in the "message" field.

## Output Structure (JSON)
- **message**: A string for the full commit message (subject and body).

---

## [Begin Task]
Analyze the following git diff and generate the commit message in the specified JSON format:\n${diff}`;

        const response = yield* httpClient
          .post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
            {
              body: HttpBody.unsafeJson({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  response_mime_type: "application/json",
                  response_schema: commitMessageResponseSchema,
                },
              }),
            },
          )
          .pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(makeSchemaFromResponse(CommitMessage)),
            ),
          );

        return response.candidates[0].content.parts[0].parsed.message;
      }).pipe(Effect.withSpan("AiGenerator.generateCommitMessageFromDiff"));

    const generateTitle = (diff: string) =>
      Effect.gen(function* () {
        const prompt = `You are an expert software engineer writing a commit message. Your task is to analyze the provided git diff and generate a concise, professional PR title.

## Format Requirements

${TITLE_PROMPT_SECTION}

## Constraints
- The tone must be professional and direct.
- Do **not** use emojis.
- The title must **not** contain redundant phrases like "This PR" or "This commit".

## Output Structure (JSON)
- **title**: A string for the PR title.

---

## [Begin Task]
Analyze the following git diff and generate the PR title in the specified JSON format:\n${diff}`;

        const response = yield* httpClient
          .post(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
            {
              body: HttpBody.unsafeJson({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  response_mime_type: "application/json",
                  response_schema: prTitleResponseSchema,
                },
              }),
            },
          )
          .pipe(
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(
                makeSchemaFromResponse(Schema.Struct({ title: Schema.String })),
              ),
            ),
          );

        return response.candidates[0].content.parts[0].parsed.title;
      }).pipe(Effect.withSpan("AiGenerator.generateTitleFromDiff"));

    const generateReview = (diff: string) =>
      Effect.gen(function* () {
        yield* Effect.log("Generating review...");
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
