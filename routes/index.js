import express from 'express';
import cache from 'memory-cache';

const router = express.Router();

/* GET home page. */
router.get('/', (req, res) => res.json({
  status: cache.get('isParent') === true ? 'goose' : 'duck',
}));

export default router;
