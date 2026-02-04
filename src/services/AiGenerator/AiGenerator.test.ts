import { describe, expect, it } from "vitest";
import {
  filterDiff,
  formatPrDescription,
  formatReviewAsMarkdown,
  makeReviewCommentTag,
} from "./AiGenerator.js";
import type { PrDetails, PrReviewDetails } from "./schemas.js";

describe("AiGenerator", () => {
  describe("makeReviewCommentTag", () => {
    it("generates correct tag format with username", () => {
      const tag = makeReviewCommentTag("testuser");
      expect(tag).toBe(
        "<!-- [gitai-review:testuser](https://github.com/lucas-barake/gitai) -->",
      );
    });

    it("handles special characters in username", () => {
      const tag = makeReviewCommentTag("user-with-dashes");
      expect(tag).toContain("gitai-review:user-with-dashes");
    });

    it("includes github link", () => {
      const tag = makeReviewCommentTag("anyuser");
      expect(tag).toContain("https://github.com/lucas-barake/gitai");
    });
  });

  describe("filterDiff", () => {
    it("removes pnpm-lock.yaml files", () => {
      const diff = `diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -1,3 +1,3 @@
-old
+new
diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,3 @@
-old
+new`;

      const result = filterDiff(diff);
      expect(result).not.toContain("pnpm-lock.yaml");
      expect(result).toContain("src/index.ts");
    });

    it("removes yarn.lock files", () => {
      const diff = `diff --git a/yarn.lock b/yarn.lock
--- a/yarn.lock
+++ b/yarn.lock
@@ -1,3 +1,3 @@
-old
+new`;

      const result = filterDiff(diff);
      expect(result).not.toContain("yarn.lock");
    });

    it("removes coverage files", () => {
      const diff = `diff --git a/coverage/coverage.json b/coverage/coverage.json
--- a/coverage/coverage.json
+++ b/coverage/coverage.json
@@ -1,3 +1,3 @@
-{}
+{}`;

      const result = filterDiff(diff);
      expect(result).not.toContain("coverage/coverage.json");
    });

    it("removes build artifacts (dist/)", () => {
      const diff = `diff --git a/dist/bundle.js b/dist/bundle.js
--- a/dist/bundle.js
+++ b/dist/bundle.js
@@ -1,3 +1,3 @@
-old
+new`;

      const result = filterDiff(diff);
      expect(result).not.toContain("dist/bundle.js");
    });

    it("removes .next/ build artifacts", () => {
      const diff = `diff --git a/.next/cache/data.json b/.next/cache/data.json
--- a/.next/cache/data.json
+++ b/.next/cache/data.json
@@ -1,3 +1,3 @@
-{}
+{}`;

      const result = filterDiff(diff);
      expect(result).not.toContain(".next/cache");
    });

    it("keeps regular source files", () => {
      const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,3 @@
-old
+new`;

      const result = filterDiff(diff);
      expect(result).toContain("src/index.ts");
      expect(result).toContain("-old");
      expect(result).toContain("+new");
    });

    it("handles empty diff", () => {
      const result = filterDiff("");
      expect(result).toBe("");
    });
  });

  describe("formatPrDescription", () => {
    it("formats details with file summaries table", () => {
      const details: PrDetails = {
        title: "Test PR",
        description: "This is the PR description.",
        fileSummaries: [
          { file: "src/a.ts", description: "Changed module A" },
          { file: "src/b.ts", description: "Added module B" },
        ],
      };

      const result = formatPrDescription(details);

      expect(result).toContain("This is the PR description.");
      expect(result).toContain("<details>");
      expect(result).toContain("Show a summary per file");
      expect(result).toContain("| File | Description |");
      expect(result).toContain("| src/a.ts | Changed module A |");
      expect(result).toContain("| src/b.ts | Added module B |");
    });

    it("handles empty file summaries", () => {
      const details: PrDetails = {
        title: "Test",
        description: "Description",
        fileSummaries: [],
      };

      const result = formatPrDescription(details);
      expect(result).toContain("Description");
      expect(result).toContain("<details>");
    });
  });

  describe("formatReviewAsMarkdown", () => {
    it("includes review tag and details block", () => {
      const review: PrReviewDetails = {
        review: [
          {
            file: "src/index.ts",
            line: 10,
            category: "Bug",
            comment: "Potential null reference",
            codeSnippet: "const x = obj.value;",
          },
        ],
      };

      const result = formatReviewAsMarkdown(review, "testuser");

      expect(result).toContain("<!-- [gitai-review:testuser]");
      expect(result).toContain("<details>");
      expect(result).toContain("<summary>Review</summary>");
      expect(result).toContain("**src/index.ts:10**");
      expect(result).toContain("[Bug] Potential null reference");
      expect(result).toContain("const x = obj.value;");
    });

    it("formats multiple review items", () => {
      const review: PrReviewDetails = {
        review: [
          { file: "a.ts", line: 1, category: "Security", comment: "Issue 1", codeSnippet: "code1" },
          { file: "b.ts", line: 2, category: "Performance", comment: "Issue 2", codeSnippet: "code2" },
        ],
      };

      const result = formatReviewAsMarkdown(review, "user");

      expect(result).toContain("**a.ts:1**");
      expect(result).toContain("**b.ts:2**");
      expect(result).toContain("[Security] Issue 1");
      expect(result).toContain("[Performance] Issue 2");
    });

    it("handles empty review", () => {
      const review: PrReviewDetails = { review: [] };
      const result = formatReviewAsMarkdown(review, "user");

      expect(result).toContain("<!-- [gitai-review:user]");
      expect(result).toContain("<details>");
    });
  });
});
