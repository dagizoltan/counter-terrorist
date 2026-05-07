#!/bin/bash
set -e
SERVICE_PATH=$1
CONTENT=$2
echo "$CONTENT" > "$SERVICE_PATH"
