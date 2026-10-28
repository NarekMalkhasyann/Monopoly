# dice-box-threejs (vendored, small change)

3D dice with Three.js and cannon-es physics.

- Source: https://github.com/3d-dice/dice-box-threejs (v0.0.12, commit 6945e00)
- Author: Frank Ali (3D Dice), based on Major's 3D Dice
- License: MIT, see `LICENSE` in this folder

The files are copied from the original, with one addition: a six-sided die whose
faces are drawn as round pips instead of numbers.

- `const/dice.js`: new die type `dpips` (marked "Added for this project")
- `DiceFactory.js`: in `createTextMaterial`, a `diceobj.pips` branch that draws the dots

The library imports `three` and `cannon-es`, which are regular dependencies in
the project's `package.json` (three is pinned to 0.143.0, the version this library
was written for).

It is used from `src/components/Dice3D.jsx`, which throws `2dpips@a,b`.
