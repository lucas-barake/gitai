import { Command, CommandExecutor, FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect, Schema } from "effect";
import { constant } from "effect/Function";

const PrComment = Schema.Struct({
  id: Schema.String,
  body: Schema.String,
});

const PrCommentArray = Schema.Array(PrComment);

export const RepoWithOwner = Schema.TemplateLiteral(Schema.String, "/", Schema.String).pipe(
  Schema.transform(
    Schema.Struct({
      string: Schema.TemplateLiteral(Schema.String, "/", Schema.String),
      owner: Schema.String,
      repo: Schema.String,
    }),
    {
      decode: (a) => {
        const [owner, repo] = a.split("/");
        return {
          string: a,
          owner,
          repo,
        };
      },
      encode: (i) => i.string,
    },
  ),
);
export type RepoWithOwner = typeof RepoWithOwner.Type;

export class GitHubClient extends Effect.Service<GitHubClient>()("@gitai/GitHubClient", {
  dependencies: [BunContext.layer],
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    const getLocalRepo = Effect.fn("GitHubClient.getLocalRepo")(function* () {
      const getRepoCommand = Command.make("gh", "repo", "view", "--json", "nameWithOwner");
      return yield* executor.string(getRepoCommand).pipe(
        Effect.filterOrFail(
          (s) => s.trim() !== "",
          () => new Error(),
        ),
        Effect.flatMap(
          Schema.decode(Schema.parseJson(Schema.Struct({ nameWithOwner: RepoWithOwner }))),
        ),
        Effect.orDieWith(
          () => "Failed to detect repository. Are you inside a Git repository directory?",
        ),
        Effect.map(({ nameWithOwner }) => nameWithOwner),
      );
    });

    const getPrDiff = Effect.fn("GitHubClient.getPrDiff")(function* (
      prNumber: string,
      repo: RepoWithOwner,
    ) {
      const getDiffCommand = Command.make("gh", "pr", "diff", prNumber, "-R", repo.string);
      const diff = yield* executor
        .string(getDiffCommand)
        .pipe(
          Effect.orDieWith(
            () => "Failed to fetch PR diff. Is `gh` installed and are you logged in?",
          ),
        );
      return diff.trim();
    });

    const updatePr = Effect.fn("GitHubClient.updatePr")(function* (args: {
      readonly prNumber: string;
      readonly repo: RepoWithOwner;
      readonly title?: string;
      readonly body?: string;
    }) {
      const commandArgs = ["pr", "edit", args.prNumber, "-R", args.repo.string];
      if (args.title) {
        commandArgs.push("--title", args.title);
      }
      if (args.body) {
        commandArgs.push("--body", args.body);
      }

      const updatePrCommand = Command.make("gh", ...commandArgs);
      const exitCode = yield* executor.exitCode(updatePrCommand);

      if (exitCode !== 0) {
        return yield* Effect.dieMessage(
          `Failed to update PR. 'gh' command exited with code: ${exitCode}`,
        );
      }
    });

    const listPrComments = Effect.fn("GitHubClient.listPrComments")(function* (
      prNumber: string,
      repo: RepoWithOwner,
    ) {
      const listCommentsCommand = Command.make(
        "gh",
        "pr",
        "view",
        prNumber,
        "-R",
        repo.string,
        "--json",
        "comments",
      );

      return yield* executor.string(listCommentsCommand).pipe(
        Effect.flatMap(
          Schema.decode(Schema.parseJson(Schema.Struct({ comments: PrCommentArray }))),
        ),
        Effect.map((_) => _.comments),
        Effect.tapError((error) =>
          Effect.logWarning(`Failed to list comments for PR #${prNumber}: ${error.message}`),
        ),
        Effect.orElseSucceed(constant([])),
      );
    });

    const addPrComment = Effect.fn("GitHubClient.addPrComment")(function* (args: {
      readonly prNumber: string;
      readonly repo: RepoWithOwner;
      readonly body: string;
    }) {
      const addCommentCommand = Command.make(
        "gh",
        "pr",
        "comment",
        args.prNumber,
        "-R",
        args.repo.string,
        "--body",
        args.body,
      );

      const exitCode = yield* executor.exitCode(addCommentCommand);
      if (exitCode !== 0) {
        return yield* Effect.dieMessage(
          `Failed to add comment. 'gh' command exited with code: ${exitCode}`,
        );
      }
    });

    const deletePrComment = Effect.fn("GitHubClient.deletePrComment")(function* (
      commentId: string,
    ) {
      const deleteCommentCommand = Command.make(
        "gh",
        "api",
        "graphql",
        "-f",
        `id=${commentId}`,
        "-f",
        "query=mutation($id: ID!) { deleteIssueComment(input: {id: $id}) { clientMutationId } }",
      );
      const exitCode = yield* executor.exitCode(deleteCommentCommand);

      if (exitCode !== 0) {
        yield* Effect.logWarning(
          `Could not delete comment ${commentId}. It might have been already deleted.`,
        );
      }
    });

    const submitPrReview = Effect.fn("GitHubClient.submitPrReview")(function* (args: {
      readonly prNumber: string;
      readonly repo: RepoWithOwner;
      readonly comments: ReadonlyArray<{
        readonly path: string;
        readonly line: number;
        readonly body: string;
      }>;
      readonly reviewBody?: string;
    }) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const tempFile = path.join("/tmp", `gitai-review-${args.prNumber}-${Date.now()}.json`);

      const reviewData = {
        body: args.reviewBody || "AI-generated code review",
        event: "COMMENT" as const,
        comments: args.comments.map((comment) => ({
          path: comment.path,
          line: comment.line,
          body: comment.body,
        })),
      };

      yield* fs.writeFileString(tempFile, JSON.stringify(reviewData, null, 2));
      yield* Effect.addFinalizer(() => fs.remove(tempFile).pipe(Effect.ignore));

      yield* Effect.log(`Debug: Review data being sent:`);
      yield* Effect.log(JSON.stringify(reviewData, null, 2));

      const apiCommand = Command.make(
        "gh",
        "api",
        `repos/${args.repo.owner}/${args.repo.repo}/pulls/${args.prNumber}/reviews`,
        "--method",
        "POST",
        "--input",
        tempFile,
      );

      const exitCode = yield* executor.exitCode(apiCommand);

      if (exitCode !== 0) {
        return yield* Effect.dieMessage(
          `Failed to submit PR review. Command exited with code ${exitCode}.`,
        );
      }

      yield* Effect.log(`✅ PR review submitted successfully!`);
    });

    const listPrReviews = Effect.fn("GitHubClient.listPrReviews")(function* (
      prNumber: string,
      repo: RepoWithOwner,
    ) {
      const listReviewsCommand = Command.make(
        "gh",
        "pr",
        "view",
        prNumber,
        "-R",
        repo.string,
        "--json",
        "reviews",
      );

      return yield* executor.string(listReviewsCommand).pipe(
        Effect.flatMap(
          Schema.decode(
            Schema.parseJson(
              Schema.Struct({
                reviews: Schema.Array(
                  Schema.Struct({
                    id: Schema.String,
                    body: Schema.String,
                    author: Schema.Struct({
                      login: Schema.String,
                    }),
                    state: Schema.String,
                  }),
                ),
              }),
            ),
          ),
        ),
        Effect.map((_) => _.reviews),
        Effect.tapError((error) =>
          Effect.logWarning(`Failed to list reviews for PR #${prNumber}: ${error.message}`),
        ),
        Effect.orElseSucceed(constant([])),
      );
    });

    return {
      getLocalRepo,
      getPrDiff,
      updatePr,
      listPrComments,
      addPrComment,
      deletePrComment,
      submitPrReview,
      listPrReviews,
    } as const;
  }),
}) {}
