import { Command, CommandExecutor } from "@effect/platform";
import { Effect, Schema } from "effect";

const PrComment = Schema.Struct({
  id: Schema.String,
  body: Schema.String,
});

const PrCommentArray = Schema.Array(PrComment);

export class GitHubClient extends Effect.Service<GitHubClient>()("GitHubClient", {
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    const getLocalRepo = Effect.gen(function* () {
      yield* Effect.logInfo("Detecting current repository...");

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
        yield* Effect.logInfo(`Fetching diff for PR #${prNumber}...`);
        const getDiffCommand = Command.make("gh", "pr", "diff", prNumber, "-R", repo);
        const diff = yield* executor
          .string(getDiffCommand)
          .pipe(
            Effect.orDieWith(
              () => "Failed to fetch PR diff. Is `gh` installed and are you logged in?",
            ),
          );
        return diff;
      }).pipe(Effect.withSpan("GitHubClient.getPrDiff"));

    const updatePr = (args: {
      readonly prNumber: string;
      readonly repo: string;
      readonly title?: string;
      readonly body?: string;
    }) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`Updating PR #${args.prNumber} on GitHub...`);
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
          yield* Effect.logInfo(`✅ Successfully updated PR #${args.prNumber} on ${args.repo}!`);
        } else {
          return yield* Effect.dieMessage(
            `Failed to update PR. 'gh' command exited with code: ${exitCode}`,
          );
        }
      }).pipe(Effect.withSpan("GitHubClient.updatePr"));

    const listPrComments = (prNumber: string, repo: string) =>
      Effect.gen(function* () {
        const listCommentsCommand = Command.make(
          "gh",
          "pr",
          "comment",
          prNumber,
          "-R",
          repo,
          "--json",
          "id,body",
        );

        return yield* executor.string(listCommentsCommand).pipe(
          Effect.flatMap(Schema.decode(Schema.parseJson(PrCommentArray))),
          Effect.catchAll(() => Effect.succeed([])),
        );
      }).pipe(Effect.withSpan("GitHubClient.listPrComments"));

    const addPrComment = (args: {
      readonly prNumber: string;
      readonly repo: string;
      readonly body: string;
    }) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`Adding review comment to PR #${args.prNumber} on GitHub...`);
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
          yield* Effect.logInfo(
            `✅ Successfully added review comment to PR #${args.prNumber} on ${args.repo}!`,
          );
        } else {
          return yield* Effect.dieMessage(
            `Failed to add comment. 'gh' command exited with code: ${exitCode}`,
          );
        }
      }).pipe(Effect.withSpan("GitHubClient.addPrComment"));

    const deletePrComment = (commentId: string, repo: string) =>
      Effect.gen(function* () {
        yield* Effect.logInfo(`Deleting previous review comment...`);
        const deleteCommentCommand = Command.make(
          "gh",
          "pr",
          "comment",
          "--delete",
          commentId,
          "-R",
          repo,
        );
        const exitCode = yield* executor.exitCode(deleteCommentCommand);

        if (exitCode !== 0) {
          yield* Effect.logWarning(
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
