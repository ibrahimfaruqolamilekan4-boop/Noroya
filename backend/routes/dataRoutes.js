import express from 'express';
import { buyData, getTransactions } from '../controllers/dataController.js';

const router = express.Router();

// Define routes matching requested endpoint specifications
router.post('/buy-data', buyData);
router.get('/transactions', getTransactions);

export default router;
