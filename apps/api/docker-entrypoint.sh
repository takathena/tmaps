#!/bin/sh
set -e

echo "Running migrations..."
bun src/db/migrate.ts

echo "Running seed..."
bun src/db/seed.ts

echo "Starting API..."
exec bun src/index.ts
