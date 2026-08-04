import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const children = [];

const findFreePort = (port, attempts = 20) =>
	new Promise((resolve, reject) => {
		const probe = net.createServer();

		probe.once("error", error => {
			if (error.code !== "EADDRINUSE" || attempts <= 0) {
				reject(error);
				return;
			}
			resolve(findFreePort(port + 1, attempts - 1));
		});

		probe.listen(port, () => {
			probe.close(() => resolve(port));
		});
	});

const waitForPort = (port, timeout) =>
	new Promise(resolve => {
		const giveUp = Date.now() + timeout;

		const attempt = () => {
			const socket = net.connect({ port, host: "127.0.0.1" });

			socket.once("connect", () => {
				socket.destroy();
				resolve(true);
			});

			socket.once("error", () => {
				socket.destroy();
				if (Date.now() >= giveUp) resolve(false);
				else setTimeout(attempt, 100);
			});
		};

		attempt();
	});

const isWindows = process.platform === "win32";

const start = (label, command, args, env) => {
	const child = spawn(command, args, {
		stdio: "inherit",
		shell: isWindows,
		env: { ...process.env, ...env }
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
		if (child.killed || child.exitCode !== null) continue;
		if (isWindows && child.pid) {
			spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
				stdio: "ignore"
			});
		} else {
			child.kill("SIGTERM");
		}
	}
	process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);

const requestedPort = Number(process.env.PORT) || Number("8080");
const backendPort = await findFreePort(requestedPort);

start(
	"server",
	"bunx",
	[
		"tsx",
		"server.ts"
	],
	{ PORT: String(backendPort), BACKEND_ONLY: "1" }
);

if (!(await waitForPort(backendPort, 60000))) {
	console.error(
		`Backend never started listening on port ${backendPort}. Not starting the frontend, because its proxy routes would fail.`
	);
	stop();
}

const boundPort = backendPort;

if (boundPort !== requestedPort) {
	console.log(`Port ${requestedPort} taken, backend is on ${boundPort}.`);
}

start(
	"frontend",
	"bunx",
	[
		"vite"
	],
	{ BACKEND_PORT: String(boundPort) }
);
