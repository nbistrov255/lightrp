import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import './db.js';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import shiftRoutes from './routes/shifts.js';
import checklistRoutes from './routes/checklists.js';
import breakdownRoutes from './routes/breakdowns.js';
import cashRoutes from './routes/cash.js';
import moneyRoutes from './routes/money.js';
import bookingRoutes from './routes/bookings.js';
import miscRoutes from './routes/misc.js';
import { startShiftsAutoSync } from './shiftsSync.js';
import { requireAuth } from './auth.js';
import { startShiftReminders } from './shiftReminders.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const api = express.Router();
for (const r of [miscRoutes, authRoutes, bookingRoutes, taskRoutes, shiftRoutes, checklistRoutes, breakdownRoutes, cashRoutes, moneyRoutes]) api.use(r);
api.use((_req, res) => res.status(404).json({ error: 'Не найдено' }));
app.use('/api', api);

// Фото доступны только сотрудникам (cookie сессии отправляется браузером автоматически)
app.use('/uploads', requireAuth, express.static(config.uploadsDir, { maxAge: '30d', immutable: true }));

// Собранный фронтенд (PWA)
if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist, {
    setHeaders: (res, file) => {
      if (file.endsWith('sw.js') || file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
}

// Ошибки
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Внутренняя ошибка сервера' : err.message });
});

app.listen(config.port, () => {
  console.log(`CyberHub Control: http://localhost:${config.port}`);
  startShiftsAutoSync();
  startShiftReminders();
});
