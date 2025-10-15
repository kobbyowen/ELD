#!/usr/bin/env bash
set -e

python3 manage.py migrate --noinput
python3 manage.py collectstatic --noinput

exec gunicorn core.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers 3 \
  --timeout 120
