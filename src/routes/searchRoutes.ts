import { Router } from 'express';
import { searchController } from '../controllers/searchController';

export const searchRoutes = Router();

searchRoutes.get('/search', searchController);
