#!/usr/bin/env node
import { main } from './ewp.mjs';
import { createColors } from 'create-ewp/terminal';

main().then(code => { process.exitCode = code; }, error => {
  console.error(createColors({ stream: process.stderr }).error(`ewp: ${error.message}`));
  process.exitCode = Number.isInteger(error.exitCode) && error.exitCode > 0 ? error.exitCode : 1;
});
