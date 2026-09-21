#!/bin/bash
# Launcher script for Top-Down Pixel Pathfinding Simulator

PORT=8080
echo "========================================================="
echo "  Tubes AI: Top-Down Pixel Game (UCS & A* Pathfinding)"
echo "========================================================="
echo "Starting local web server on port $PORT..."
echo "Opening browser at: http://localhost:$PORT"
echo "Press Ctrl+C to stop the server."
echo "========================================================="

# Attempt to open browser automatically if available
if which xdg-open > /dev/null; then
  (sleep 1 && xdg-open "http://localhost:$PORT") &
elif which open > /dev/null; then
  (sleep 1 && open "http://localhost:$PORT") &
fi

# Run Python HTTP Server
python3 -m http.server $PORT
