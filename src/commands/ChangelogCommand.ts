import { AiGenerator } from "@/services/AiGenerator/AiGenerator.js";
import { contextOption, provideCliOption, provideModel } from "@/services/CliOptions.js";
import type { GitCommit } from "@/services/GitClient.js";
import { GitClient } from "@/services/GitClient.js";
import { Command, Prompt } from "@effect/cli";
import { Effect } from "effect";

const formatRelativeDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
};

const formatCommitChoice = (commit: GitCommit): string => {
  const subject = commit.subject.length > 50 ? commit.subject.slice(0, 47) + "..." : commit.subject;
  return `${commit.shortHash} - ${subject} (${commit.author}, ${formatRelativeDate(commit.date)})`;
};

export const ChangelogCommand = Command.make(
  "changelog",
  {
    contextOption,
  },
  (opts) =>
    Effect.gen(function* () {
      const gitClient = yield* GitClient;
      const aiGenerator = yield* AiGenerator;

      const allCommits = yield* gitClient.getAllCommits(100);

      if (allCommits.length === 0) {
        return yield* Effect.dieMessage("No commits found in this repository.");
      }

      if (allCommits.length < 2) {
        return yield* Effect.dieMessage("Need at least 2 commits to generate a changelog range.");
      }

      const choices = allCommits.map((commit, index) => ({
        title: formatCommitChoice(commit),
        value: { commit, index },
      }));

      const startSelection = yield* Prompt.select({
        message: "Select the START commit (older boundary of the range)",
        choices,
        maxPerPage: 10,
      });

      const endChoices = [
        { title: "HEAD (latest commit)", value: { commit: null as GitCommit | null, index: -1, singleCommit: false } },
        { title: "Same as START (single commit)", value: { commit: startSelection.commit as GitCommit | null, index: startSelection.index, singleCommit: true } },
        ...allCommits.map((commit, index) => ({
          title:
            index === startSelection.index
              ? `${formatCommitChoice(commit)} [START]`
              : formatCommitChoice(commit),
          value: { commit: commit as GitCommit | null, index, singleCommit: false },
          disabled: index === startSelection.index,
        })),
      ];

      const endSelection = yield* Prompt.select({
        message: "Select the END commit (newer boundary)",
        choices: endChoices,
        maxPerPage: 10,
      });

      let fromHash: string;
      let toHash: string;

      if (endSelection.singleCommit) {
        // Single commit: use parent syntax to include just that commit
        fromHash = `${startSelection.commit.hash}^`;
        toHash = startSelection.commit.hash;
        console.log(`Generating changelog for single commit: ${startSelection.commit.shortHash}`);
      } else {
        let olderHash: string;
        let newerHash: string;

        // Lower index = newer commit in git log output
        if (endSelection.index === -1) {
          // HEAD selected as end - start is always older
          olderHash = startSelection.commit.hash;
          newerHash = "HEAD";
        } else if (startSelection.index < endSelection.index) {
          // start has lower index, so start is newer, end is older - swap them
          olderHash = endSelection.commit!.hash;
          newerHash = startSelection.commit.hash;
          console.log(`Note: Swapped order to generate range ${olderHash}^..${newerHash}`);
        } else {
          // start has higher index, so start is older, end is newer
          olderHash = startSelection.commit.hash;
          newerHash = endSelection.commit!.hash;
        }

        // Use parent syntax on older commit to include it in the range
        fromHash = `${olderHash}^`;
        toHash = newerHash;

        console.log(`Generating changelog for range: ${fromHash}..${toHash}`);
      }

      const commits = yield* gitClient.getCommitRange(fromHash, toHash);

      if (commits.length === 0) {
        return yield* Effect.dieMessage(
          `No commits found in range ${fromHash}..${toHash}. Please check your commit selection.`,
        );
      }

      console.log(`Found ${commits.length} commits. Generating changelog...`);

      const changelog = yield* aiGenerator.generateChangelog(commits);

      console.log("\n" + "=".repeat(80));
      console.log("GENERATED CHANGELOG");
      console.log("=".repeat(80) + "\n");
      console.log(changelog.changelog);
    }).pipe(provideCliOption("context", opts.contextOption), provideModel("changelog")),
);
