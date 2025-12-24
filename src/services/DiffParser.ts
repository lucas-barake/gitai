/**
 * Parses unified diff format into structured data and formats it for LLM consumption.
 *
 * LLMs often struggle with traditional unified diff format (+ and - prefixes),
 * so this module transforms diffs into a clearer representation.
 */

export interface DiffChange {
  readonly type: "add" | "remove" | "context";
  readonly content: string;
  readonly lineNumber: number;
}

export interface DiffHunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly changes: ReadonlyArray<DiffChange>;
}

export interface ParsedFileDiff {
  readonly filePath: string;
  readonly oldPath: string | null;
  readonly status: "added" | "modified" | "deleted" | "renamed";
  readonly hunks: ReadonlyArray<DiffHunk>;
}

const HUNK_HEADER_REGEX = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const parseFilePaths = (
  lines: ReadonlyArray<string>,
): { oldPath: string | null; newPath: string | null } => {
  let oldPath: string | null | undefined = undefined;
  let newPath: string | null | undefined = undefined;

  for (const line of lines) {
    if (line.startsWith("--- ")) {
      const path = line.slice(4).trim();
      oldPath = path === "/dev/null" ? null : path.replace(/^a\//, "");
    } else if (line.startsWith("+++ ")) {
      const path = line.slice(4).trim();
      newPath = path === "/dev/null" ? null : path.replace(/^b\//, "");
    }
    if (oldPath !== undefined && newPath !== undefined) break;
  }

  return { oldPath: oldPath ?? null, newPath: newPath ?? null };
};

const determineStatus = (
  oldPath: string | null,
  newPath: string | null,
): ParsedFileDiff["status"] => {
  if (oldPath === null && newPath !== null) return "added";
  if (oldPath !== null && newPath === null) return "deleted";
  if (oldPath !== null && newPath !== null && oldPath !== newPath) return "renamed";
  return "modified";
};

const parseHunks = (lines: ReadonlyArray<string>): DiffHunk[] => {
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let changes: DiffChange[] = [];
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    const hunkMatch = line.match(HUNK_HEADER_REGEX);

    if (hunkMatch) {
      if (currentHunk) {
        hunks.push({ ...currentHunk, changes });
      }

      oldLineNum = parseInt(hunkMatch[1]!, 10);
      newLineNum = parseInt(hunkMatch[3]!, 10);

      currentHunk = {
        oldStart: oldLineNum,
        oldLines: parseInt(hunkMatch[2] ?? "1", 10),
        newStart: newLineNum,
        newLines: parseInt(hunkMatch[4] ?? "1", 10),
        changes: [],
      };
      changes = [];
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      changes.push({
        type: "add",
        content: line.slice(1),
        lineNumber: newLineNum,
      });
      newLineNum++;
    } else if (line.startsWith("-")) {
      changes.push({
        type: "remove",
        content: line.slice(1),
        lineNumber: oldLineNum,
      });
      oldLineNum++;
    } else if (line.startsWith(" ") || line === "") {
      changes.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : line,
        lineNumber: newLineNum,
      });
      oldLineNum++;
      newLineNum++;
    }
  }

  if (currentHunk) {
    hunks.push({ ...currentHunk, changes });
  }

  return hunks;
};

const parseFileDiff = (diffChunk: string): ParsedFileDiff | null => {
  const lines = diffChunk.split("\n");

  // Skip binary files
  if (lines.some((line) => line.includes("Binary files"))) {
    return null;
  }

  const { oldPath, newPath } = parseFilePaths(lines);

  // Cannot determine file path
  if (newPath === null && oldPath === null) {
    return null;
  }

  const status = determineStatus(oldPath, newPath);
  const filePath = newPath ?? oldPath!;
  const hunks = parseHunks(lines);

  return {
    filePath,
    oldPath: status === "renamed" ? oldPath : null,
    status,
    hunks,
  };
};

/**
 * Parses a unified diff string into structured data.
 */
export const parseDiff = (rawDiff: string): ParsedFileDiff[] => {
  if (!rawDiff.trim()) return [];

  const chunks = rawDiff
    .split(/^diff --git /m)
    .filter((chunk) => chunk.trim() !== "");

  return chunks
    .map((chunk) => parseFileDiff(`diff --git ${chunk}`))
    .filter((diff): diff is ParsedFileDiff => diff !== null);
};

const formatLineRange = (changes: ReadonlyArray<DiffChange>): string => {
  if (changes.length === 0) return "";
  if (changes.length === 1) return `line ${changes[0]!.lineNumber}`;

  const first = changes[0]!.lineNumber;
  const last = changes[changes.length - 1]!.lineNumber;
  return first === last ? `line ${first}` : `lines ${first}-${last}`;
};

const groupConsecutiveChanges = (
  changes: ReadonlyArray<DiffChange>,
): Array<{ type: DiffChange["type"]; changes: DiffChange[] }> => {
  const groups: Array<{ type: DiffChange["type"]; changes: DiffChange[] }> = [];

  for (const change of changes) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.type === change.type) {
      lastGroup.changes.push(change);
    } else {
      groups.push({ type: change.type, changes: [change] });
    }
  }

  return groups;
};

const formatHunk = (hunk: DiffHunk): string => {
  const groups = groupConsecutiveChanges(hunk.changes);
  const parts: string[] = [];

  for (const group of groups) {
    const lineRange = formatLineRange(group.changes);
    const content = group.changes.map((c) => c.content).join("\n");

    switch (group.type) {
      case "remove":
        parts.push(`--- REMOVED (${lineRange}) ---\n${content}`);
        break;
      case "add":
        parts.push(`+++ ADDED (${lineRange}) +++\n${content}`);
        break;
      case "context":
        parts.push(`~~~ CONTEXT (${lineRange}) ~~~\n${content}`);
        break;
    }
  }

  return parts.join("\n\n");
};

const formatFileDiff = (diff: ParsedFileDiff): string => {
  const statusLabel = diff.status === "renamed" && diff.oldPath
    ? `renamed from ${diff.oldPath}`
    : diff.status;

  const header = `=== FILE: ${diff.filePath} (${statusLabel}) ===`;
  const hunksFormatted = diff.hunks.map(formatHunk).join("\n\n");
  const footer = "=== END FILE ===";

  return `${header}\n\n${hunksFormatted}\n\n${footer}`;
};

/**
 * Formats parsed diff data into an LLM-friendly textual representation.
 */
export const formatDiffForLLM = (diffs: ReadonlyArray<ParsedFileDiff>): string => {
  if (diffs.length === 0) return "";
  return diffs.map(formatFileDiff).join("\n\n");
};

/**
 * Convenience function that parses and formats a diff in one step.
 */
export const transformDiffForLLM = (rawDiff: string): string => {
  const parsed = parseDiff(rawDiff);
  return formatDiffForLLM(parsed);
};
