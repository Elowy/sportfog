// Egyetlen megosztott Prisma kliens példány.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
