#!/bin/bash
### ELD Service Manager ###
# Location: /home/ubuntu/ELD/backend/eld-service.sh
# Usage: ./eld-service.sh {start|stop|restart|status|logs}

APP_NAME="eld-backend"
APP_DIR="."
VENV_DIR="$APP_DIR/venv"
SOCK_FILE="$APP_DIR/$APP_NAME.sock"
PID_FILE="$APP_DIR/$APP_NAME.pid"
LOG_FILE="$APP_DIR/$APP_NAME.log"
USER="ubuntu"
PORT=9000

start_app() {
    echo "Starting $APP_NAME ..."
    # Only cd if not already in APP_DIR
    if [ "$(pwd)" != "$APP_DIR" ]; then
        cd "$APP_DIR" || { echo "❌ Failed to cd into $APP_DIR"; exit 1; }
    fi

    # Activate virtual environment
    if [ -d "$VENV_DIR" ]; then
        source "$VENV_DIR/bin/activate"
    fi

    # Start Gunicorn in background
    gunicorn core.wsgi:application \
        --name "$APP_NAME" \
        --bind 0.0.0.0:$PORT \
        --workers 3 \
        --pid "$PID_FILE" \
        --access-logfile "$LOG_FILE" \
        --error-logfile "$LOG_FILE" \
        --daemon

    echo "$APP_NAME started on port $PORT"
}

stop_app() {
    echo "Stopping $APP_NAME ..."
    if [ -f "$PID_FILE" ]; then
        kill -TERM "$(cat "$PID_FILE")" && rm -f "$PID_FILE"
        echo "$APP_NAME stopped"
    else
        echo "PID file not found — is $APP_NAME running?"
    fi
}

restart_app() {
    echo "Restarting $APP_NAME ..."
    stop_app
    sleep 2
    start_app
}

status_app() {
    if [ -f "$PID_FILE" ] && ps -p "$(cat "$PID_FILE")" > /dev/null 2>&1; then
        echo "$APP_NAME is running (PID $(cat "$PID_FILE"))"
    else
        echo "$APP_NAME is not running"
    fi
}

logs_app() {
    tail -n 50 -f "$LOG_FILE"
}

case "$1" in
    start) start_app ;;
    stop) stop_app ;;
    restart) restart_app ;;
    status) status_app ;;
    logs) logs_app ;;
    *) echo "Usage: $0 {start|stop|restart|status|logs}" ;;
esac
