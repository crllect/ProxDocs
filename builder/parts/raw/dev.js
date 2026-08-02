import { spawn } from "node:child_process";

const children = [];

const start = (label, command, args) => {
	const child = spawn(command, args, {
		stdio: "inherit",
		shell: process.platform === "win32"
	});

	child.on("exit", code => {
		if (code !== 0 && code !== null)
			console.error(`${label} exited with code ${code}`);
		stop();
	});

	children.push(child);
	return child;
};

const stop = () => {
	for (const child of children) {
		if (!child.killed) child.kill("SIGTERM");
	}
	process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);

start("server", "{{DEV_SERVER_EXECUTABLE}}", [
	//#insert DEV_SERVER_ARGS
]);
start("frontend", "{{DEV_CLIENT_EXECUTABLE}}", [
	//#insert DEV_CLIENT_ARGS
]);
