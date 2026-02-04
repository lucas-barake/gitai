import { FileSystem, Path } from "@effect/platform";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodePath from "node:path";
import { makeMockCommandExecutor } from "@/test-utils/MockCommandExecutor.js";
import { GitHubClient, RepoWithOwner } from "./GitHubClient.js";

const testRepo: RepoWithOwner = {
  string: "owner/repo" as const,
  owner: "owner",
  repo: "repo",
};

const MockPathLayer = Layer.succeed(Path.Path, NodePath as unknown as Path.Path);

const makeMockFileSystem = () =>
  Layer.succeed(FileSystem.FileSystem, {
    writeFileString: () => Effect.void,
    remove: () => Effect.void,
  } as unknown as FileSystem.FileSystem);

describe("GitHubClient", () => {
  describe("getLocalRepo", () => {
    it.effect("parses repo view JSON correctly", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        const repo = yield* gh.getLocalRepo();
        expect(repo.string).toBe("owner/repo");
        expect(repo.owner).toBe("owner");
        expect(repo.repo).toBe("repo");
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("repo") && args.includes("view")) {
                return JSON.stringify({ nameWithOwner: "owner/repo" });
              }
              return "";
            },
          }),
        ),
      ),
    );

    it.effect("dies on empty output", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        const result = yield* gh.getLocalRepo().pipe(Effect.exit);
        expect(result._tag).toBe("Failure");
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: () => "",
          }),
        ),
      ),
    );
  });

  describe("getPrDiff", () => {
    it.effect("returns trimmed diff", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        const diff = yield* gh.getPrDiff("123", testRepo);
        expect(diff).toBe("diff content here");
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("pr") && args.includes("diff")) {
                expect(args).toContain("123");
                expect(args).toContain("-R");
                expect(args).toContain("owner/repo");
                return "  diff content here  \n";
              }
              return "";
            },
          }),
        ),
      ),
    );
  });

  describe("listOpenPrs", () => {
    it.effect("parses PR list JSON", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        const prs = yield* gh.listOpenPrs(testRepo);

        expect(prs).toHaveLength(2);
        expect(prs[0]?.number).toBe(1);
        expect(prs[0]?.title).toBe("First PR");
        expect(prs[0]?.author.login).toBe("user1");
        expect(prs[1]?.number).toBe(2);
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("pr") && args.includes("list")) {
                return JSON.stringify([
                  { number: 1, title: "First PR", author: { login: "user1" } },
                  { number: 2, title: "Second PR", author: { login: "user2" } },
                ]);
              }
              return "";
            },
          }),
        ),
      ),
    );
  });

  describe("listPrComments", () => {
    it.effect("parses comments JSON", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        const comments = yield* gh.listPrComments("123", testRepo);

        expect(comments).toHaveLength(1);
        expect(comments[0]?.id).toBe("IC_1");
        expect(comments[0]?.body).toBe("Test comment");
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("pr") && args.includes("view") && args.includes("comments")) {
                return JSON.stringify({
                  comments: [{ id: "IC_1", body: "Test comment" }],
                });
              }
              return "";
            },
          }),
        ),
      ),
    );

    it.effect("returns empty array on failure", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        const comments = yield* gh.listPrComments("123", testRepo);
        expect(comments).toEqual([]);
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: () => "invalid json",
          }),
        ),
      ),
    );
  });

  describe("listPrReviews", () => {
    it.effect("parses reviews JSON", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        const reviews = yield* gh.listPrReviews("123", testRepo);

        expect(reviews).toHaveLength(1);
        expect(reviews[0]?.id).toBe("R_1");
        expect(reviews[0]?.author.login).toBe("reviewer");
        expect(reviews[0]?.state).toBe("COMMENTED");
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("pr") && args.includes("view") && args.includes("reviews")) {
                return JSON.stringify({
                  reviews: [
                    { id: "R_1", body: "LGTM", author: { login: "reviewer" }, state: "COMMENTED" },
                  ],
                });
              }
              return "";
            },
          }),
        ),
      ),
    );

    it.effect("returns empty array on failure", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        const reviews = yield* gh.listPrReviews("123", testRepo);
        expect(reviews).toEqual([]);
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: () => "invalid json",
          }),
        ),
      ),
    );
  });

  describe("updatePr", () => {
    it.effect("constructs correct gh pr edit command with title and body", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        yield* gh.updatePr({
          prNumber: "123",
          repo: testRepo,
          title: "New Title",
          body: "New Body",
        });
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            exitCode: (args) => {
              if (args.includes("pr") && args.includes("edit")) {
                expect(args).toContain("123");
                expect(args).toContain("-R");
                expect(args).toContain("owner/repo");
                expect(args).toContain("--title");
                expect(args).toContain("New Title");
                expect(args).toContain("--body");
                expect(args).toContain("New Body");
                return 0;
              }
              return 0;
            },
          }),
        ),
      ),
    );

    it.effect("dies on non-zero exit code", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        const result = yield* gh
          .updatePr({ prNumber: "123", repo: testRepo, title: "Test" })
          .pipe(Effect.exit);
        expect(result._tag).toBe("Failure");
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            exitCode: () => 1,
          }),
        ),
      ),
    );
  });

  describe("addPrComment", () => {
    it.effect("constructs correct gh pr comment command", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        yield* gh.addPrComment({
          prNumber: "123",
          repo: testRepo,
          body: "Comment body",
        });
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            exitCode: (args) => {
              if (args.includes("pr") && args.includes("comment")) {
                expect(args).toContain("123");
                expect(args).toContain("-R");
                expect(args).toContain("owner/repo");
                expect(args).toContain("--body");
                expect(args).toContain("Comment body");
                return 0;
              }
              return 0;
            },
          }),
        ),
      ),
    );
  });

  describe("deletePrComment", () => {
    it.effect("calls GraphQL mutation", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        yield* gh.deletePrComment("IC_123");
      }).pipe(
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            exitCode: (args) => {
              if (args.includes("api") && args.includes("graphql")) {
                expect(args.some((a) => a.includes("IC_123"))).toBe(true);
                expect(args.some((a) => a.includes("deleteIssueComment"))).toBe(true);
                return 0;
              }
              return 0;
            },
          }),
        ),
      ),
    );
  });

  describe("submitPrReview", () => {
    it.effect("writes temp file and calls gh api", () =>
      Effect.gen(function* () {
        const gh = yield* GitHubClient;
        yield* gh.submitPrReview({
          prNumber: "123",
          repo: testRepo,
          comments: [{ path: "src/file.ts", line: 10, body: "Review comment" }],
          reviewBody: "Overall review",
        });
      }).pipe(
        Effect.scoped,
        Effect.provide(GitHubClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            exitCode: (args) => {
              if (args.includes("api") && args.includes("repos/owner/repo/pulls/123/reviews")) {
                expect(args).toContain("--method");
                expect(args).toContain("POST");
                expect(args).toContain("--input");
                return 0;
              }
              return 0;
            },
          }),
        ),
        Effect.provide(makeMockFileSystem()),
        Effect.provide(MockPathLayer),
      ),
    );
  });
});
