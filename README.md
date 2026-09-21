# AI Pathfinding Pixel World

A browser-based 2D top-down game and pathfinding simulator built with HTML5 Canvas and vanilla JavaScript. The project demonstrates how an NPC moves through a tile-based world using different search algorithms, including Uniform Cost Search (UCS) and A* Search.

This project is designed for learning and visualization of informed and uninformed search, with a playable map, NPC chase logic, terrain costs, and visual debug overlays.

## What this program does

- Lets you move the player character using WASD or arrow keys
- Lets an NPC chase the player using pathfinding
- Shows explored nodes, frontier nodes, and the computed path
- Supports multiple search algorithms:
  - UCS
  - A* with Manhattan distance
  - A* with Euclidean distance
  - A* with Chebyshev distance
  - Greedy Best-First Search
- Includes terrain types such as:
  - grass
  - water
  - bridges
  - mud
  - walls
  - trees
  - houses
- Includes random map generation and preset map scenarios
- Provides benchmark comparison between search methods

## Features

- Real-time path visualization
- NPC behavior modes:
  - standby
  - auto-stop
  - continuous chase
- Editable map tools for placing/removing obstacles
- Step-by-step search mode for teaching and debugging
- Local browser game experience with no required backend

## Project structure

```text
Modern tiles_Free/
├── index.html
├── style.css
├── run.sh
├── README.md
├── src/
│   ├── game.js
│   ├── map.js
│   ├── renderer.js
│   ├── tileset.js
│   ├── entity.js
│   ├── pathfinding.js
│   ├── constants.js
│   ├── comparison.js
│   └── priority_queue.js
├── tests/
│   └── test_pathfinding.js
├── Characters_free/
├── Interiors_free/
├── trees/
└── ...
```

## Run locally on your computer

### Option 1: Use the included script

From the project folder, run:

```bash
./run.sh
```

If the script is not executable, run this first:

```bash
chmod +x run.sh
./run.sh
```

Then open your browser and go to:

```text
http://localhost:8080
```

### Option 2: Run a local web server manually

1. Open a terminal in the project folder.
2. Run:

```bash
python3 -m http.server 8080
```

3. Open in your browser:

```text
http://localhost:8080
```

### Option 3: Use Node.js static server

If you prefer Node:

```bash
npx serve .
```

Then open the localhost URL shown in the terminal.

## Requirements

- Modern browser (Chrome, Edge, Firefox)
- Python 3 (for local HTTP server) or Node.js

## Controls

- Move player: W A S D or arrow keys
- Run NPC pathfinding: Space or Enter
- Mouse click: move player/NPC or paint terrain depending on selected tool
- Right-click: erase tile to grass

## How to test pathfinding

From the project root, run:

```bash
node --input-type=module -e "import('./tests/test_pathfinding.js')"
```

This checks whether the pathfinding logic works correctly across the generated maps and scenarios.

## Notes

This project is intended for demonstration and learning. It is not a production game engine, but it is a clean example of AI pathfinding, map generation, collision logic, and browser-based visualization.

## License

This project is provided for educational use. Please check the included license files in the repository if you plan to redistribute or publish it publicly.

## GitHub publishing

After you are ready, push the project to GitHub with:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-repository-url>
git push -u origin main
```

If you want, I can also prepare a more polished GitHub-ready version in English with badges, screenshots, and a shorter project summary.

