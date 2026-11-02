#!/bin/bash
export LD_LIBRARY_PATH=/tmp/libs/usr/lib/x86_64-linux-gnu:/tmp/libs/lib/x86_64-linux-gnu
cd /tmp/pw && node shot.mjs "$1" 2>&1 | tail -${2:-15}
