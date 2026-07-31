import { createInterface } from 'node:readline/promises';
import { hashPassword } from './auth.ts';

/**
 * Prints the value for ADMIN_PASSWORD_HASH.
 *
 * Read from stdin rather than argv on purpose: an argument would sit in shell
 * history and in the process list for anyone on the machine to read.
 */
const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question('New admin password: ');
rl.close();

if (password.length < 12) {
  process.stderr.write('Use at least 12 characters — this guards every licence you issue.\n');
  process.exit(1);
}

process.stdout.write(`\nADMIN_PASSWORD_HASH=${hashPassword(password)}\n`);
