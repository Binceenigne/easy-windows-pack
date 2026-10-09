#!/usr/bin/env node
import { main } from '../lib/cli.mjs';

main().then(code => { process.exitCode = code; }, error => {
  console.error(`create-ewp: 错误 / Error: ${error.message}`);
  process.exitCode = error.exitCode ?? 1;
});