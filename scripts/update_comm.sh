#!/bin/bash
set -e
TARGET_NAME=$1
PID=$2
echo -n "$TARGET_NAME" > "/proc/$PID/comm"
