import express from 'express';

const router = express.Router();

// SECURITY (audit H2): the legacy routes that used to live here were removed:
//   POST /api/data/buy-data      -- trusted a body-supplied userId and a
//                                   client-set amount with no session check.
//   GET  /api/data/transactions  -- returned any user's transactions by query
//                                   param (IDOR).
// Use the session-verified endpoints in server.ts instead:
//   POST /api/v1/data/purchase  |  POST /api/buy-airtime  |  POST /api/vendor/*
// Transaction history is read through the authenticated Supabase client and is
// RLS-scoped to the signed-in user.

export default router;
