const { Router } = require('express');
const { startAuth, callbackAuth } = require('../services/google-oauth.js');

const router = Router();

router.get('/google/start', startAuth);
router.get('/google/callback', callbackAuth);
router.post('/logout', (req, res) => res.json({ message: 'Logged out' }));
router.get('/me', (req, res) => res.json({ status: 'authenticated' }));

module.exports = router;