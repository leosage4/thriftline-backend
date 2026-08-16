import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware';
import { healthRoutes } from './routes/healthRoutes';
import { searchRoutes } from './routes/searchRoutes';

export const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'thriftline-backend',
    endpoints: {
      health: '/health',
      search: '/api/search?q=jeans',
    },
  });
});

app.use('/health', healthRoutes);
app.use('/api', searchRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
