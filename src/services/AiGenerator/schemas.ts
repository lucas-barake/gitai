import { Schema } from "effect";

export class PrDetails extends Schema.Class<PrDetails>("PrDetails")(
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

export class PrTitle extends Schema.Class<PrTitle>("PrTitle")(
  Schema.Struct({
    title: Schema.String.annotations({
      description: "The PR title",
    }),
  }),
) {}
