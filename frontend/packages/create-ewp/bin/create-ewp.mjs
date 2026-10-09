#!/usr/bin/env node
import { main } from '../lib/cli.mjs';

main().then(code => { process.exitCode = code; }, error => {
  console.error(`create-ewp: ${error.language === 'en' ? 'error' : '错误'}: ${error.message}`);
  process.exitCode = Number.isInteger(error.exitCode) && error.exitCode > 0 ? error.exitCode : 1;
});