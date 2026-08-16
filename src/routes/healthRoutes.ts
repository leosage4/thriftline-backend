import { Router } from 'express';
import { configStatus } from '../config/env';

export const healthRoutes = Router();

healthRoutes.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'thriftline-backend',
    timestamp: new Date().toISOString(),
    marketplaces: {
      ebayConfigured: configStatus.ebayConfigured,
      etsyConfigured: configStatus.etsyConfigured,
    },
  });
});
