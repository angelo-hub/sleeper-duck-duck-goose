import express from 'express';
import crypto from 'crypto';
import Promise from 'bluebird';

import redis from './repository/redis.js';
import indexRouter from './routes/index.js';
// import config from './config/dev.js';
import Handler from './handlers/index.js';
import { getPort } from './utils/getPort.js';

global.Promise = Promise;

const app = express();

app.use(express.json());

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(res.status(404).json({ error: 'not found' }));
});

// error handler
app.use((err, req, res) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

async function startExpress() {
  const port = await getPort();
  app.listen(port);
  console.log(`Express HTTP server running on: ${port}`);
}

async function main() {
  const serverId = crypto.randomUUID();

  await redis.start();

  await startExpress();

  const handler = new Handler({ serverId, redis });

  await handler.start();
}

main();

export default app;
