const { spawnSync } = require('child_process');

function run(cmd, args) {
  console.log('>', cmd, args.join(' '));
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    cwd: __dirname,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run('node', ['generate.js']);
run('node', ['upload-and-cleanup.js']);
console.log('All done — PDF generated and uploaded');
