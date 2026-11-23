import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { run, all } from './db.js';

const storage = multer.diskStorage({
  destination: config.uploadsDir,
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

export function savePhotos(entity, entityId, files = [], userId) {
  for (const f of files) {
    run('INSERT INTO photos (entity, entity_id, file, uploaded_by) VALUES (?, ?, ?, ?)', entity, entityId, f.filename, userId);
  }
}

export function photosFor(entity, ids) {
  if (!ids.length) return {};
  const rows = all(
    `SELECT id, entity_id, file, created_at FROM photos WHERE entity = ? AND entity_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
    entity, ...ids,
  );
  const map = {};
  for (const r of rows) (map[r.entity_id] ||= []).push({ id: r.id, url: `/uploads/${r.file}`, created_at: r.created_at });
  return map;
}
