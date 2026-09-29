#!/usr/bin/env node
import { Command } from 'commander';
import { registerAuditCommand } from './commands/audit.js';

const program = new Command();

program
  .name('repowarden')
  .description('GitHub repository security auditor')
  .version('0.1.0');

registerAuditCommand(program);

await program.parseAsync(process.argv);
