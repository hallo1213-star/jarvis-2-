#!/usr/bin/env node
// Bürgermeister-Passwort festlegen:  npm run admin:passwort
// Lokal: schreibt data/admin.json. Für das Hosting den ausgegebenen Hash als Umgebungsvariable ADMIN_PASSWORD_HASH setzen.
import readline from 'node:readline';
import { writeAdminFile, hashPassword } from './admin.js';

let pw = process.env.NEUES_PASSWORT;
if (!pw) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  pw = await new Promise((r) => rl.question('Neues Bürgermeister-Passwort (mind. 12 Zeichen): ', r));
  rl.close();
}
if (pw.length < 12) { console.error('Zu kurz – mindestens 12 Zeichen.'); process.exit(1); }
const file = writeAdminFile(pw);
console.log(`Gespeichert in ${file}`);
console.log('Für das Hosting (Render) als Umgebungsvariable ADMIN_PASSWORD_HASH eintragen:');
console.log(hashPassword(pw));
