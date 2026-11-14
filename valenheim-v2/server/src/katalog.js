// Gemeinsamer Katalog (shared/katalog.json) – Preise, Modelle, Tuning
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
export const KATALOG = JSON.parse(fs.readFileSync(path.resolve(dir, '../../shared/katalog.json'), 'utf8'));
