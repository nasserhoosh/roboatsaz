// /home/nasser/apps/robotmaker/db.js
//
// نمونه‌ی یکتای PrismaClient برای کل برنامه.
// dotenv مستقلاً اینجا هم لود می‌شود تا این ماژول به ترتیب require شدن
// نسبت به connection.js وابسته نباشد (فراخوانی چندباره‌ی config() بی‌ضرر است).
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = { prisma };
