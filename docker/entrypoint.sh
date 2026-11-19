#!/bin/sh
set -eu
cd /app/migrate
./node_modules/.bin/prisma migrate deploy
cd /app
exec node server.js
