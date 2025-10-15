#!/usr/bin/env bash
# gunicorn_service.sh — manage your Django app with gunicorn
# Usage: ./gunicorn_service.sh start|stop|restart|status

set -euo pipefail

### ── EDIT THESE ────────────────────────────────────────────────────────────────
APP_DIR="/home/ubuntu/ELD/backend"     # folder that has manage.py
VENV_PATH="$APP_DIR/venv"                 # your virtualenv path
APP_MODULE="core.wsgi:application"    # e.g. "mysite.wsgi:application"
BIND_ADDR="0.0.0.0:8000"                   # listen address:port                  # seconds
LOG_DIR="$APP_DIR/logs"
PIDFILE="$APP_DIR/run/gunicorn.pid"
DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-}"  # optional, leave blank if set in code/env
### ─────────────────────────────────────────────────────────────────────────────

mkdir -p "$(dirname "$PIDFILE")" "$LOG_DIR"

ACCESS_LOG="$LOG_DIR/gunicorn.access.log"
ERROR_LOG="$LOG_DIR/gunicorn.error.log"

activate_venv() {
  # shellcheck disable=SC1090
  source "$VENV_PATH/bin/activate"
}

start() {
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Gunicorn already running (pid $(cat "$PIDFILE"))."
    exit 0
  fi

  cd "$APP_DIR"

  activate_venv

  # Ensure gunicorn is available (optional)
  python -m pip install -q --upgrade pip wheel >/dev/null
  python -m pip install -q gunicorn >/dev/null

  # Django housekeeping (optional but recommended)
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput

  # Export settings if provided
  if [[ -n "$DJANGO_SETTINGS_MODULE" ]]; then
    export DJANGO_SETTINGS_MODULE
  fi

  # Launch gunicorn in the background (daemon mode)
  exec gunicorn "$APP_MODULE" \
    --bind "$BIND_ADDR" \
    --workers 2 \
    --timeout 120 \
    --pid "$PIDFILE" \
    --access-logfile "$ACCESS_LOG" \
    --error-logfile "$ERROR_LOG" \
    --daemon

  echo "Started gunicorn ($APP_MODULE) on $BIND_ADDR"
}

stop() {
  if [[ -f "$PIDFILE" ]]; then
    PID="$(cat "$PIDFILE")"
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" || true
      # wait briefly, then force if needed
      sleep 1
      kill -0 "$PID" 2>/dev/null && kill -9 "$PID" || true
      echo "Stopped gunicorn (pid $PID)."
    fi
    rm -f "$PIDFILE"
  else
    echo "Gunicorn not running (no pidfile)."
  fi
}

status() {
  if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Gunicorn is running (pid $(cat "$PIDFILE"))."
  else
    echo "Gunicorn is not running."
    exit 1
  fi
}

restart() {
  stop
  start
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) restart ;;
  status) status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 2
    ;;
esac
