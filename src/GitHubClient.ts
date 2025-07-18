import { Command, CommandExecutor } from "@effect/platform";
import { Effect, Schema } from "effect";
import { constant } from "effect/Function";

const PrComment = Schema.Struct({
  id: Schema.String,
  body: Schema.String,
});

const PrCommentArray = Schema.Array(PrComment);

export class GitHubClient extends Effect.Service<GitHubClient>()("GitHubClient", {
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    const getLocalRepo = Effect.gen(function* () {
      yield* Effect.log("Detecting current repository...");
      const getRepoCommand = Command.make("gh", "repo", "view", "--json", "nameWithOwner");
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
    }).pipe(Effect.withSpan("GitHubClient.getLocalRepo"));

    const getPrDiff = (prNumber: string, repo: string) =>
      Effect.gen(function* () {
        yield* Effect.log(`Fetching diff for PR #${prNumber}...`);
        const getDiffCommand = Command.make("gh", "pr", "diff", prNumber, "-R", repo);
        const diff = yield* executor
          .string(getDiffCommand)
          .pipe(
            Effect.orDieWith(
              () => "Failed to fetch PR diff. Is `gh` installed and are you logged in?",
            ),
          );
        return diff.trim();
      }).pipe(Effect.withSpan("GitHubClient.getPrDiff"));

    const updatePr = (args: {
      readonly prNumber: string;
      readonly repo: string;
      readonly title?: string;
      readonly body?: string;
    }) =>
      Effect.gen(function* () {
        yield* Effect.log(`Updating PR #${args.prNumber} on GitHub...`);
        const commandArgs = ["pr", "edit", args.prNumber, "-R", args.repo];
        if (args.title) {
          commandArgs.push("--title", args.title);
        }
        if (args.body) {
          commandArgs.push("--body", args.body);
        }

        const updatePrCommand = Command.make("gh", ...commandArgs);
        const exitCode = yield* executor.exitCode(updatePrCommand);

        if (exitCode === 0) {
          yield* Effect.log(`✅ Successfully updated PR #${args.prNumber} on ${args.repo}!`);
        } else {
          return yield* Effect.dieMessage(
            `Failed to update PR. 'gh' command exited with code: ${exitCode}`,
          );
        }
      }).pipe(Effect.withSpan("GitHubClient.updatePr"));

    const listPrComments = (prNumber: string, repo: string) =>
      Effect.gen(function* () {
        yield* Effect.log(`Listing comments for PR #${prNumber}...`);
        const listCommentsCommand = Command.make(
          "gh",
          "pr",
          "view",
          prNumber,
          "-R",
          repo,
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
      }).pipe(Effect.withSpan("GitHubClient.listPrComments"));

    const addPrComment = (args: {
      readonly prNumber: string;
      readonly repo: string;
      readonly body: string;
    }) =>
      Effect.gen(function* () {
        yield* Effect.log(`Adding new review comment to PR #${args.prNumber}...`);
        const addCommentCommand = Command.make(
          "gh",
          "pr",
          "comment",
          args.prNumber,
          "-R",
          args.repo,
          "--body",
          args.body,
        );

        const exitCode = yield* executor.exitCode(addCommentCommand);
        if (exitCode === 0) {
          yield* Effect.log(
            `✅ Successfully added review comment to PR #${args.prNumber} on ${args.repo}!`,
          );
        } else {
          return yield* Effect.dieMessage(
            `Failed to add comment. 'gh' command exited with code: ${exitCode}`,
          );
        }
      }).pipe(Effect.withSpan("GitHubClient.addPrComment"));

    const deletePrComment = (commentId: string, _repo: string) =>
      Effect.gen(function* () {
        yield* Effect.log(`Deleting stale review comment...`);
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
          yield* Effect.log(
            `Could not delete comment ${commentId}. It might have been already deleted.`,
          );
        }
      }).pipe(Effect.withSpan("GitHubClient.deletePrComment"));

    return {
      getLocalRepo,
      getPrDiff,
      updatePr,
      listPrComments,
      addPrComment,
      deletePrComment,
    } as const;
  }),
}) {}
