import { Effect } from "effect";

export class Stdout extends Effect.Service<Stdout>()("@gitai/Stdout", {
  sync: () => ({
    write: (text: string) => Effect.sync(() => process.stdout.write(text)),
    clearLine: Effect.sync(() => process.stdout.write("\x1b[2K\r")),
  }),
}) {}
