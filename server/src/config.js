import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Простейшая загрузка .env без зависимостей
const envFile = path.join(root, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const dataDir = process.env.DATA_DIR || path.join(root, 'data');
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });

export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  dbFile: path.join(dataDir, 'cyberhub.db'),
  clientDist: path.join(root, '..', 'client', 'dist'),
  publicUrl: process.env.PUBLIC_URL || '',
  tildaToken: process.env.TILDA_TOKEN || '',
  shiftsCsvUrl: process.env.SHIFTS_CSV_URL || '',
  discord: {
    bookings: process.env.DISCORD_WEBHOOK_BOOKINGS || '',
    general: process.env.DISCORD_WEBHOOK_GENERAL || '',
  },
  timezone: 'Europe/Riga',
};

if (config.jwtSecret === 'dev-secret-change-me' && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  JWT_SECRET не задан — задайте его в .env перед запуском в продакшене');
}
