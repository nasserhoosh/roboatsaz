// /home/nasser/apps/robotmaker/db.js
//
// نمونه‌ی یکتای PrismaClient برای کل برنامه.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = { prisma };
