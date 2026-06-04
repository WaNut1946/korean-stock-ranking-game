import { spawn } from 'node:child_process';

const commands = [
  ['server', ['node_modules/nodemon/bin/nodemon.js', 'server/src/index.js']],
  ['client', ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0']],
];

const children = commands.map(([name, args]) => {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
    }
  });

  return child;
});

function shutdown() {
  for (const child of children) {
    child.kill();
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
