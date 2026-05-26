import express from 'express'
import {router} from "./Routers"
import { logger } from './middlewares/log';
const http = require('http');
import cors from 'cors';
import { MongoDB } from './utils/MongoDB';
import path from 'path';
import { env } from './config/env';
import { isCorsOriginAllowed } from './modules/http/CorsPolicy';
const app: express.Application = express()
const server = http.createServer(app);

export const DB = new MongoDB({
  name: env.database.user,
  password: env.database.password,
  host: env.database.host,
  port: env.database.port,
  dbName: env.database.name
});

app.use(cors({
  "origin": (origin, callback) => {
    if (isCorsOriginAllowed(origin, env.server.corsOrigins)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
  "methods": "GET,HEAD,PUT,PATCH,POST,DELETE",
  "preflightContinue": false,
  "optionsSuccessStatus": 200,
  "exposedHeaders": ['Content-Disposition']
}))

app.use(express.json({limit:'50mb'}));
app.use(express.urlencoded({ extended: false }))
app.use('/assets', express.static(env.server.assetsPath));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

for (const route of router) {
  app.use(route.getRouter())
}

server.listen(env.server.port, () => {
  logger.info('listening on *:'+env.server.port);
});
