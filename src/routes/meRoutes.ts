import { Router } from 'express';
import { customerAuthController } from '../controllers/customerAuthController.js';
import { requireCustomerAuth } from '../middlewares/auth.js';

export const meRoutes = Router();

meRoutes.get('/me', requireCustomerAuth, customerAuthController.me);
