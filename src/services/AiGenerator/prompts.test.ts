import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { GitCommit } from "@/services/GitClient.js";
import {
  makeChangelogPrompt,
  makeCommitMessagePrompt,
  makePrDetailsPrompt,
  makePrLineReviewPrompt,
  makeReviewPrompt,
  makeTitlePrompt,
} from "./prompts.js";

describe("prompts", () => {
  const testDiff = "+ added line\n- removed line";
  const testContext = "This is additional context for the AI";

  describe("makePrDetailsPrompt", () => {
    it("includes diff in the prompt", () => {
      const prompt = makePrDetailsPrompt(testDiff, Option.none());
      expect(prompt).toContain(testDiff);
    });

    it("includes context snippet when provided", () => {
      const prompt = makePrDetailsPrompt(testDiff, Option.some(testContext));
      expect(prompt).toContain("User-Provided Context");
      expect(prompt).toContain(testContext);
    });

    it("excludes context section when None", () => {
      const prompt = makePrDetailsPrompt(testDiff, Option.none());
      expect(prompt).not.toContain("User-Provided Context");
    });

    it("includes format requirements for title and description", () => {
      const prompt = makePrDetailsPrompt(testDiff, Option.none());
      expect(prompt).toContain("imperative mood");
      expect(prompt).toContain("under 72 characters");
      expect(prompt).toContain("fileSummaries");
    });
  });

  describe("makeCommitMessagePrompt", () => {
    it("includes diff in the prompt", () => {
      const prompt = makeCommitMessagePrompt(testDiff, Option.none());
      expect(prompt).toContain(testDiff);
    });

    it("includes context snippet when provided", () => {
      const prompt = makeCommitMessagePrompt(testDiff, Option.some(testContext));
      expect(prompt).toContain("User-Provided Context");
      expect(prompt).toContain(testContext);
    });

    it("includes commit message format requirements", () => {
      const prompt = makeCommitMessagePrompt(testDiff, Option.none());
      expect(prompt).toContain("subject line");
      expect(prompt).toContain("imperative");
      expect(prompt).toContain("BREAKING CHANGE");
    });
  });

  describe("makeTitlePrompt", () => {
    it("includes diff in the prompt", () => {
      const prompt = makeTitlePrompt(testDiff, Option.none());
      expect(prompt).toContain(testDiff);
    });

    it("includes context snippet when provided", () => {
      const prompt = makeTitlePrompt(testDiff, Option.some(testContext));
      expect(prompt).toContain("User-Provided Context");
      expect(prompt).toContain(testContext);
    });

    it("includes title format requirements", () => {
      const prompt = makeTitlePrompt(testDiff, Option.none());
      expect(prompt).toContain("under 72 characters");
      expect(prompt).toContain("imperative mood");
    });
  });

  describe("makeReviewPrompt", () => {
    it("includes diff in the prompt", () => {
      const prompt = makeReviewPrompt(testDiff, Option.none());
      expect(prompt).toContain(testDiff);
    });

    it("includes context snippet when provided", () => {
      const prompt = makeReviewPrompt(testDiff, Option.some(testContext));
      expect(prompt).toContain("User-Provided Context");
      expect(prompt).toContain(testContext);
    });

    it("includes review focus areas", () => {
      const prompt = makeReviewPrompt(testDiff, Option.none());
      expect(prompt).toContain("Security");
      expect(prompt).toContain("Bugs");
      expect(prompt).toContain("Performance");
    });
  });

  describe("makePrLineReviewPrompt", () => {
    it("includes diff in the prompt", () => {
      const prompt = makePrLineReviewPrompt(testDiff, Option.none());
      expect(prompt).toContain(testDiff);
    });

    it("includes context snippet when provided", () => {
      const prompt = makePrLineReviewPrompt(testDiff, Option.some(testContext));
      expect(prompt).toContain("User-Provided Context");
      expect(prompt).toContain(testContext);
    });

    it("includes line-by-line review instructions", () => {
      const prompt = makePrLineReviewPrompt(testDiff, Option.none());
      expect(prompt).toContain("line-by-line");
      expect(prompt).toContain("NEW line number");
    });
  });

  describe("makeChangelogPrompt", () => {
    const testCommits: ReadonlyArray<GitCommit> = [
      {
        hash: "abc123def456",
        shortHash: "abc123",
        subject: "Add new feature",
        body: "This adds a great new feature",
        author: "Test Author",
        date: "2024-01-15",
      },
      {
        hash: "def456ghi789",
        shortHash: "def456",
        subject: "Fix bug in login",
        body: "",
        author: "Another Author",
        date: "2024-01-14",
      },
    ];

    it("formats commits correctly", () => {
      const prompt = makeChangelogPrompt(testCommits, Option.none());
      expect(prompt).toContain("**Commit abc123**");
      expect(prompt).toContain("Add new feature");
      expect(prompt).toContain("This adds a great new feature");
      expect(prompt).toContain("Test Author");
      expect(prompt).toContain("2024-01-15");
    });

    it("includes all commits", () => {
      const prompt = makeChangelogPrompt(testCommits, Option.none());
      expect(prompt).toContain("**Commit abc123**");
      expect(prompt).toContain("**Commit def456**");
    });

    it("includes context snippet when provided", () => {
      const prompt = makeChangelogPrompt(testCommits, Option.some(testContext));
      expect(prompt).toContain("User-Provided Context");
      expect(prompt).toContain(testContext);
    });

    it("includes changelog formatting guidelines", () => {
      const prompt = makeChangelogPrompt(testCommits, Option.none());
      expect(prompt).toContain("Under the Hood");
      expect(prompt).toContain("How to Test");
      expect(prompt).toContain("user value");
    });
  });
});
