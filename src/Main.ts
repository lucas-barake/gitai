#!/usr/bin/env bun
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Cause, Chunk, Effect, Layer, Logger } from "effect";
import { ChangelogCommand } from "./commands/ChangelogCommand.js";
import { CommitCommand } from "./commands/CommitCommand.js";
import { GhCommand } from "./commands/GhCommand.js";
import { AiGenerator } from "./services/AiGenerator/index.js";
import { cliLogger } from "./services/CliLogger.js";
import { GitClient } from "./services/GitClient.js";
import { GitHubClient } from "./services/GitHubClient.js";
import { LocalConfig } from "./services/LocalConfig.js";
import { UserPreferences } from "./services/UserPreferences.js";
import { WithModel } from "./services/WithModel.js";

const MainCommand = Command.make("gitai").pipe(
  Command.withSubcommands([GhCommand, CommitCommand, ChangelogCommand]),
);

const cli = Command.run(MainCommand, {
  name: "AI Git Assistant",
  version: "2.0.0",
  executable: "gitai",
});

const MainLayer = Layer.mergeAll(
  AiGenerator.Default,
  WithModel.Default,
  GitHubClient.Default,
  GitClient.Default,
  LocalConfig.Default,
  UserPreferences.Default,
  BunContext.layer,
).pipe(Layer.provideMerge(Logger.replace(Logger.defaultLogger, cliLogger)));

cli(process.argv).pipe(
  Effect.tapErrorCause((cause) => {
    if (Cause.isInterruptedOnly(cause)) {
      return Effect.void;
    }

    const failures = Cause.failures(cause);
    const hasQuitException = Chunk.some(failures, (failure) => failure._tag === "QuitException");
    if (hasQuitException) {
      return Effect.void;
    }

    return Effect.logError(cause);
  }),
  Effect.provide(MainLayer),
  Effect.scoped,
  BunRuntime.runMain({
    disablePrettyLogger: true,
    disableErrorReporting: true,
  }),
);
