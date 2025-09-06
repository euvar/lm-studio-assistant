#!/usr/bin/env node

import { CLI } from './core/cli.js';

async function main() {
  const cli = new CLI();
  await cli.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});