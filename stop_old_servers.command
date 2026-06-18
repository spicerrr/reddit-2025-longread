#!/bin/zsh
# Stops only Python local web servers launched from this project family.
pids=$(pgrep -f 'python3 .*serve.py|python3 -m http.server' 2>/dev/null)
if [ -z "$pids" ]; then
  echo "No matching local Python servers are running."
else
  echo "$pids" | xargs kill
  echo "Stopped local Python servers: $pids"
fi
echo "Press Enter to close."
read
