const { spawn } = require("child_process");

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: "pipe",
    shell: true,
    env: process.env,
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  return child;
}

const frontend = run("frontend", "npm", ["run", "dev:frontend"]);
const backend = run("backend", "npm", ["run", "dev:backend"]);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  frontend.kill();
  backend.kill();
  setTimeout(() => process.exit(code), 150);
}

frontend.on("exit", (code) => {
  if (!shuttingDown && code && code !== 0) {
    shutdown(code);
  }
});

backend.on("exit", (code) => {
  if (!shuttingDown && code && code !== 0) {
    shutdown(code);
  }
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
