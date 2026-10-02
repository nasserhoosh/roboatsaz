#!/bin/bash
cd /home/nasser/apps/robotmaker
git pull origin main
npm ci
pm2 restart robotmaker
echo "✅ Deploy done"
