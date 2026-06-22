// Felhasználói fiók: aktuális hozzáférés és vásárlási előzmények (számlák).
const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const grants = await prisma.accessGrant.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    res.render('account/index', {
      title: 'Fiókom',
      grants,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
