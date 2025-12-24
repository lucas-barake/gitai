import { describe, expect, it } from "vitest";
import {
  formatDiffForLLM,
  parseDiff,
  transformDiffForLLM,
  type ParsedFileDiff,
} from "../src/services/DiffParser.js";

describe("DiffParser", () => {
  describe("parseDiff", () => {
    it("should parse a simple file modification", () => {
      const diff = `diff --git a/src/helper.ts b/src/helper.ts
index abc123..def456 100644
--- a/src/helper.ts
+++ b/src/helper.ts
@@ -10,7 +10,7 @@ import { foo } from "bar";

 export function helper() {
-  return "old";
+  return "new";
 }
`;

      const result = parseDiff(diff);

      expect(result).toHaveLength(1);
      expect(result[0]!.filePath).toBe("src/helper.ts");
      expect(result[0]!.status).toBe("modified");
      expect(result[0]!.oldPath).toBeNull();
      expect(result[0]!.hunks).toHaveLength(1);

      const hunk = result[0]!.hunks[0]!;
      expect(hunk.oldStart).toBe(10);
      expect(hunk.newStart).toBe(10);

      const adds = hunk.changes.filter((c) => c.type === "add");
      const removes = hunk.changes.filter((c) => c.type === "remove");
      const context = hunk.changes.filter((c) => c.type === "context");

      expect(adds).toHaveLength(1);
      expect(removes).toHaveLength(1);
      expect(context.length).toBeGreaterThan(0);
      expect(adds[0]!.content).toBe('  return "new";');
      expect(removes[0]!.content).toBe('  return "old";');
    });

    it("should parse file with multiple hunks", () => {
      const diff = `diff --git a/src/utils.ts b/src/utils.ts
index abc123..def456 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -5,3 +5,3 @@ const a = 1;
 const b = 2;
-const c = 3;
+const c = 30;
 const d = 4;
@@ -20,3 +20,3 @@ const x = 10;
 const y = 20;
-const z = 30;
+const z = 300;
 const w = 40;
`;

      const result = parseDiff(diff);

      expect(result).toHaveLength(1);
      expect(result[0]!.hunks).toHaveLength(2);
      expect(result[0]!.hunks[0]!.oldStart).toBe(5);
      expect(result[0]!.hunks[1]!.oldStart).toBe(20);
    });

    it("should parse a new file (added)", () => {
      const diff = `diff --git a/src/newFile.ts b/src/newFile.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/newFile.ts
@@ -0,0 +1,3 @@
+export const newThing = () => {
+  return "hello";
+};
`;

      const result = parseDiff(diff);

      expect(result).toHaveLength(1);
      expect(result[0]!.filePath).toBe("src/newFile.ts");
      expect(result[0]!.status).toBe("added");
      expect(result[0]!.oldPath).toBeNull();

      const adds = result[0]!.hunks[0]!.changes.filter((c) => c.type === "add");
      expect(adds).toHaveLength(3);
    });

    it("should parse a deleted file", () => {
      const diff = `diff --git a/src/oldFile.ts b/src/oldFile.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/oldFile.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export const oldThing = () => {
-  return "goodbye";
-};
`;

      const result = parseDiff(diff);

      expect(result).toHaveLength(1);
      expect(result[0]!.filePath).toBe("src/oldFile.ts");
      expect(result[0]!.status).toBe("deleted");

      const removes = result[0]!.hunks[0]!.changes.filter((c) => c.type === "remove");
      expect(removes).toHaveLength(3);
    });

    it("should parse a renamed file", () => {
      const diff = `diff --git a/src/oldName.ts b/src/newName.ts
similarity index 95%
rename from src/oldName.ts
rename to src/newName.ts
index abc123..def456 100644
--- a/src/oldName.ts
+++ b/src/newName.ts
@@ -1,3 +1,3 @@
 export const thing = () => {
-  return "old";
+  return "new";
 };
`;

      const result = parseDiff(diff);

      expect(result).toHaveLength(1);
      expect(result[0]!.filePath).toBe("src/newName.ts");
      expect(result[0]!.status).toBe("renamed");
      expect(result[0]!.oldPath).toBe("src/oldName.ts");
    });

    it("should skip binary files", () => {
      const diff = `diff --git a/image.png b/image.png
new file mode 100644
index 0000000..abc1234
Binary files /dev/null and b/image.png differ
`;

      const result = parseDiff(diff);
      expect(result).toHaveLength(0);
    });

    it("should handle empty diff", () => {
      expect(parseDiff("")).toHaveLength(0);
      expect(parseDiff("   ")).toHaveLength(0);
    });

    it("should parse multiple files", () => {
      const diff = `diff --git a/src/a.ts b/src/a.ts
index abc..def 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
-const a = 1;
+const a = 10;
diff --git a/src/b.ts b/src/b.ts
index abc..def 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,3 +1,3 @@
-const b = 2;
+const b = 20;
`;

      const result = parseDiff(diff);

      expect(result).toHaveLength(2);
      expect(result[0]!.filePath).toBe("src/a.ts");
      expect(result[1]!.filePath).toBe("src/b.ts");
    });
  });

  describe("formatDiffForLLM", () => {
    it("should format a simple modification", () => {
      const parsed: ParsedFileDiff[] = [
        {
          filePath: "src/helper.ts",
          oldPath: null,
          status: "modified",
          hunks: [
            {
              oldStart: 10,
              oldLines: 3,
              newStart: 10,
              newLines: 3,
              changes: [
                { type: "context", content: "export function helper() {", lineNumber: 10 },
                { type: "remove", content: '  return "old";', lineNumber: 11 },
                { type: "add", content: '  return "new";', lineNumber: 11 },
                { type: "context", content: "}", lineNumber: 12 },
              ],
            },
          ],
        },
      ];

      const result = formatDiffForLLM(parsed);

      expect(result).toContain("=== FILE: src/helper.ts (modified) ===");
      expect(result).toContain("--- REMOVED (line 11) ---");
      expect(result).toContain('  return "old";');
      expect(result).toContain("+++ ADDED (line 11) +++");
      expect(result).toContain('  return "new";');
      expect(result).toContain("~~~ CONTEXT");
      expect(result).toContain("=== END FILE ===");
    });

    it("should format a renamed file with old path", () => {
      const parsed: ParsedFileDiff[] = [
        {
          filePath: "src/newName.ts",
          oldPath: "src/oldName.ts",
          status: "renamed",
          hunks: [],
        },
      ];

      const result = formatDiffForLLM(parsed);

      expect(result).toContain("=== FILE: src/newName.ts (renamed from src/oldName.ts) ===");
    });

    it("should format an added file", () => {
      const parsed: ParsedFileDiff[] = [
        {
          filePath: "src/newFile.ts",
          oldPath: null,
          status: "added",
          hunks: [
            {
              oldStart: 0,
              oldLines: 0,
              newStart: 1,
              newLines: 2,
              changes: [
                { type: "add", content: "export const x = 1;", lineNumber: 1 },
                { type: "add", content: "export const y = 2;", lineNumber: 2 },
              ],
            },
          ],
        },
      ];

      const result = formatDiffForLLM(parsed);

      expect(result).toContain("=== FILE: src/newFile.ts (added) ===");
      expect(result).toContain("+++ ADDED (lines 1-2) +++");
    });

    it("should return empty string for empty input", () => {
      expect(formatDiffForLLM([])).toBe("");
    });

    it("should group consecutive changes", () => {
      const parsed: ParsedFileDiff[] = [
        {
          filePath: "test.ts",
          oldPath: null,
          status: "modified",
          hunks: [
            {
              oldStart: 1,
              oldLines: 5,
              newStart: 1,
              newLines: 5,
              changes: [
                { type: "remove", content: "line 1", lineNumber: 1 },
                { type: "remove", content: "line 2", lineNumber: 2 },
                { type: "add", content: "new line 1", lineNumber: 1 },
                { type: "add", content: "new line 2", lineNumber: 2 },
                { type: "context", content: "unchanged", lineNumber: 3 },
              ],
            },
          ],
        },
      ];

      const result = formatDiffForLLM(parsed);

      // Should have "lines 1-2" for grouped removes and adds
      expect(result).toContain("--- REMOVED (lines 1-2) ---");
      expect(result).toContain("+++ ADDED (lines 1-2) +++");
    });
  });

  describe("transformDiffForLLM", () => {
    it("should parse and format in one step", () => {
      const diff = `diff --git a/test.ts b/test.ts
index abc..def 100644
--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
-const old = 1;
+const new = 1;
`;

      const result = transformDiffForLLM(diff);

      expect(result).toContain("=== FILE: test.ts (modified) ===");
      expect(result).toContain("--- REMOVED");
      expect(result).toContain("+++ ADDED");
      expect(result).toContain("=== END FILE ===");
    });

    it("should handle empty diff", () => {
      expect(transformDiffForLLM("")).toBe("");
    });
  });
});
