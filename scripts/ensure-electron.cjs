const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const electronDir = path.join(projectRoot, "node_modules", "electron");
const pathFile = path.join(electronDir, "path.txt");
const installScript = path.join(electronDir, "install.js");

if (fs.existsSync(pathFile)) {
  process.exit(0);
}

if (!fs.existsSync(installScript)) {
  console.error("Electron install script not found. Run `bun install` first.");
  process.exit(1);
}

console.log("Electron binary missing. Running electron install script...");
const result = spawnSync(process.execPath, [installScript], {
  cwd: projectRoot,
  stdio: "inherit"
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(pathFile)) {
  console.error("Electron install completed but path.txt is still missing.");
  process.exit(1);
}
