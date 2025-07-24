import { Command, Prompt, Options } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { Effect, Array, Option } from "effect";
import { LocalConfig } from "../services/LocalConfig.js";

const pathOption = Options.text("target").pipe(
  Options.optional,
  Options.withDescription("The target file path to write the rules to (overrides config)."),
);

export const RulesCommand = Command.make(
  "rules",
  { pathOption },
  Effect.fn(function* (opts) {
    const localConfig = yield* LocalConfig;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const gitaiDir = ".gitai";
    const rulesDir = path.join(gitaiDir, "rules");

    yield* Effect.logDebug("Ensuring .gitai/rules/ directory exists...");
    yield* fs.makeDirectory(gitaiDir, { recursive: true }).pipe(Effect.ignore);

    const rulesFiles = yield* fs.readDirectory(rulesDir).pipe(
      Effect.map(Array.filter((filename) => filename.endsWith(".md"))),
      Effect.catchAll(() => Effect.succeed([])),
    );

    if (Array.isEmptyArray(rulesFiles)) {
      yield* Effect.logError(
        `No rule files found in ${rulesDir}/\n• Please create some .md files in ${rulesDir}/ to define your rules.\n• Example: echo "Your rules content here" > ${rulesDir}/my-rules.md`,
      );
      return;
    }

    yield* Effect.logDebug(`Found ${rulesFiles.length} rule file(s):`);
    yield* Effect.forEach(rulesFiles, (file) => Effect.log(`  - ${file}`));

    const choices = rulesFiles.map((filename) => ({
      title: filename.replace(".md", ""),
      value: filename,
    }));

    const selectedFile = yield* Option.match(opts.pathOption, {
      onNone: () =>
        Prompt.select({
          message: "Which rule file would you like to use?",
          choices,
        }),
      onSome: (path) => Effect.succeed(path),
    });

    yield* Effect.log(`Selected rule file: ${selectedFile}`);

    // precedence: CLI option > local config > prompt user
    const targetFile = yield* Option.match(opts.pathOption, {
      onSome: (cliTarget) =>
        Effect.logDebug(`Using CLI-provided target file: ${cliTarget}`).pipe(Effect.as(cliTarget)),
      onNone: () =>
        Option.match(localConfig.config.rules?.targetFile ?? Option.none(), {
          onSome: (configTarget) =>
            Effect.logDebug(`Using configured target file: ${configTarget}`).pipe(
              Effect.as(configTarget),
            ),
          onNone: () =>
            Prompt.text({
              message: "Enter the target file path to write the rules to:",
              default: "CLAUDE.local.md",
            }),
        }),
    });

    const confirm = yield* Prompt.confirm({
      message: `Write rules to ${targetFile}?`,
    });

    if (!confirm) {
      yield* Effect.log("Operation cancelled.");
      return;
    }

    const ruleFilePath = path.join(rulesDir, selectedFile);
    const ruleContent = yield* fs
      .readFileString(ruleFilePath)
      .pipe(
        Effect.orDieWith((error) => `Failed to read rule file: ${ruleFilePath}\n${error.message}`),
      );

    yield* Effect.logDebug(`Writing rules to ${targetFile}...`);
    yield* fs
      .writeFileString(targetFile, ruleContent)
      .pipe(
        Effect.orDieWith(
          (error) => `Failed to write to target file: ${targetFile}\n${error.message}`,
        ),
      );

    yield* Effect.log(`✅ Successfully applied rules from ${selectedFile} to ${targetFile}!`);
  }),
);
