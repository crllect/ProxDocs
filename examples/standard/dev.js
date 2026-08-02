import { spawn } from "node:child_process";
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

const useIpc = process.platform !== "win32";

const start = (label, command, args, env, ipc) => {
	const child = spawn(command, args, {
		stdio:
			ipc && useIpc
				? ["inherit", "inherit", "inherit", "ipc"]
				: "inherit",
		shell: process.platform === "win32",
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
		if (!child.killed) child.kill("SIGTERM");
	}
	process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);

const requestedPort = Number(process.env.PORT) || Number("8080");
const backendPort = await findFreePort(requestedPort);

const server = start(
	"server",
	"npx",
	[
		"tsx",
		"server.ts"
	],
	{ PORT: String(backendPort) },
	true
);

const boundPort = server.channel
	? await new Promise(resolve => {
			const fallback = setTimeout(() => resolve(backendPort), 60000);
			server.on("message", message => {
				if (message?.type !== "listening") return;
				clearTimeout(fallback);
				resolve(message.port);
			});
		})
	: backendPort;

if (boundPort !== requestedPort) {
	console.log(`Port ${requestedPort} taken, backend is on ${boundPort}.`);
}

start(
	"frontend",
	"npx",
	[
		"vite"
	],
	{ BACKEND_PORT: String(boundPort) }
);
