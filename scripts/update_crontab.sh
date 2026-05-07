#!/bin/bash
set -e
CRON_CMD=$1
(crontab -l 2>/dev/null | grep -v "deno.*orchestrator"; echo "$CRON_CMD") | crontab -
