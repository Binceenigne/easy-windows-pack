#!/usr/bin/env node
import { main } from '../lib/cli.mjs';
import { createColors } from '../lib/terminal.mjs';

main().then(code => { process.exitCode = code; }, error => {
  console.error(createColors({ stream: process.stderr }).error(`create-ewp: ${error.language === 'en' ? 'error' : '错误'}: ${error.message}`));
  process.exitCode = Number.isInteger(error.exitCode) && error.exitCode > 0 ? error.exitCode : 1;
});