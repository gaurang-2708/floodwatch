import { createServer } from 'node:http';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { Server } from 'socket.io';
import { SITES, findSite, TICK_MS, simulateHistory, simulateReading } from '@floodwatch/shared';

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));

app.get('/api/sites', (_req, res) => {
  const now = Date.now();
  res.json(SITES.map((site) => ({ ...site, reading: simulateReading(site, now) })));
});

app.get('/api/sites/:id/history', (req, res) => {
  const site = findSite(req.params.id);
  if (!site) {
    res.status(404).json({ error: 'Unknown site' });
    return;
  }
  const minutes = Math.min(Math.max(Number(req.query.minutes) || 30, 1), 180);
  res.json(simulateHistory(site, Date.now(), minutes));
});

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(onError);

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: CLIENT_ORIGIN } });

setInterval(() => {
  const now = Date.now();
  for (const site of SITES) io.emit('reading', simulateReading(site, now));
}, TICK_MS);

httpServer.listen(PORT, () => console.log(`FloodWatch server on http://localhost:${PORT}`));
