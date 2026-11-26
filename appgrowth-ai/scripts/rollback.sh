#!/usr/bin/env bash
# Rolls the containers back to the images tagged :previous by the last deploy. Database migrations are forward-only
# and additive by policy, so the previous code keeps working on the newer schema; restore a backup for anything else.
source "$(dirname "$0")/common.sh"
remote "for i in api web ai; do docker image inspect appgrowth-\$i:previous >/dev/null 2>&1 || { echo \"no previous image for \$i\"; exit 1; }; docker tag appgrowth-\$i:previous appgrowth-\$i:latest; done"
remote "$COMPOSE up -d --no-build api worker scheduler web ai" | tail -6
echo "rolled back to the previous images"
