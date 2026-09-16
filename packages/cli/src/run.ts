import { dispatch, USAGE } from "./commands.js";
import { parseArgv } from "./parse.js";

export async function runCli(
  argv: readonly string[],
  io: { stdout: { write(chunk: string): void }; stderr: { write(chunk: string): void } } = process,
): Promise<number> {
  try {
    return await dispatch(parseArgv(argv), io);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}\n${USAGE}`);
    return 1;
  }
}
