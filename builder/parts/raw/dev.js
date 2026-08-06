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

const start = (label, command, args, env, onLine) => {
	const child = spawn(command, args, {
		stdio: onLine ? ["inherit", "pipe", "inherit"] : "inherit",
		shell: isWindows,
		env: { ...process.env, ...env }
	});

	if (onLine) {
		let buffered = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", chunk => {
			process.stdout.write(chunk);
			buffered += chunk;
			let breakAt;
			while ((breakAt = buffered.indexOf("\n")) !== -1) {
				onLine(buffered.slice(0, breakAt));
				buffered = buffered.slice(breakAt + 1);
			}
		});
	}

	child.on("exit", code => {
		if (code !== 0 && code !== null)
			console.error(`${label} exited with code ${code}`);
		stop(code === 0 || code === null ? 0 : 1);
	});

	children.push(child);
	return child;
};

const stop = (code = 0) => {
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
	process.exit(code);
};

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));

const requestedPort = Number(process.env.PORT) || Number("{{PORT}}");
const backendPort = await findFreePort(requestedPort);

let reportedPort = 0;

const waitForReport = timeout =>
	new Promise(resolve => {
		const giveUp = Date.now() + timeout;
		const attempt = () => {
			if (reportedPort) resolve(reportedPort);
			else if (Date.now() >= giveUp) resolve(0);
			else setTimeout(attempt, 100);
		};
		attempt();
	});

start(
	"server",
	"{{DEV_SERVER_EXECUTABLE}}",
	[
		//#insert DEV_SERVER_ARGS
	],
	{ PORT: String(backendPort), BACKEND_ONLY: "1" },
	line => {
		const match = /listening on http:\/\/localhost:(\d+)/.exec(line);
		if (match) reportedPort = Number(match[1]);
	}
);

const boundPort = (await waitForReport(60000)) || backendPort;

if (!reportedPort && !(await waitForPort(boundPort, 5000))) {
	console.error(
		`Backend never started listening on port ${boundPort}. Not starting the frontend, because its proxy routes would fail.`
	);
	stop(1);
}

if (boundPort !== requestedPort) {
	console.log(`Port ${requestedPort} taken, backend is on ${boundPort}.`);
}

start(
	"frontend",
	"{{DEV_CLIENT_EXECUTABLE}}",
	[
		//#insert DEV_CLIENT_ARGS
	],
	{ BACKEND_PORT: String(boundPort) }
);
