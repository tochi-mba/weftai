export interface CliArgs {
  readonly command: string | undefined;
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}

export function parseArgv(argv: readonly string[]): CliArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) break;
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq >= 0) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
        continue;
      }
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positionals.push(arg);
  }
  return { command: positionals[0], positionals: positionals.slice(1), flags };
}

export function flag(args: CliArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}

export function boolFlag(args: CliArgs, name: string): boolean {
  return args.flags[name] === true || args.flags[name] === "true";
}
