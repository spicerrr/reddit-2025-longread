#!/bin/zsh
cd "$(dirname "$0")"
python3 serve.py
status=$?
echo ""
if [ $status -ne 0 ]; then
  echo "Launch failed. Press Enter to close."
  read
fi
