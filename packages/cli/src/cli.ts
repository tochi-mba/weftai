#!/usr/bin/env node
/* istanbul ignore file -- process entry point; exercised by spawning it in cli.bin.test.ts */
import { runCli } from "./run.js";

const code = await runCli(process.argv.slice(2));
process.exit(code);
