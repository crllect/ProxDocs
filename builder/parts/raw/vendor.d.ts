//#if hasWebsockets
//#if !bootstrap
declare module "@mercuryworkshop/wisp-js/server" {
	import type { IncomingMessage } from "node:http";
	import type { Duplex } from "node:stream";

	export const server: {
		routeRequest(
			request: IncomingMessage,
			socket: Duplex,
			head: Buffer
		): void;
		options: Record<string, unknown>;
	};
}
//#endif
//#endif

//#if bootstrap
declare module "@mercuryworkshop/proxy-bootstrap" {
	import type { IncomingMessage, ServerResponse } from "node:http";
	import type { Duplex } from "node:stream";

	export function bootstrap(options?: {
		transport?: "libcurl" | "epoxy" | "bare";
		swPath?: string;
		wispPath?: string;
	}): Promise<{
		routeRequest(
			request: IncomingMessage,
			response: ServerResponse
		): boolean;
		routeUpgrade(
			request: IncomingMessage,
			socket: Duplex,
			head: Buffer
		): boolean;
	}>;
}
//#endif

//#if ultraviolet
declare module "@titaniumnetwork-dev/ultraviolet" {
	export const uvPath: string;
}

declare module "@mercuryworkshop/bare-mux/node" {
	export const baremuxPath: string;
}

//#if transportWisp
//#if hasLibcurl
declare module "@mercuryworkshop/libcurl-transport" {
	export const libcurlPath: string;
}
//#endif

//#if hasEpoxy
declare module "@mercuryworkshop/epoxy-transport" {
	export const epoxyPath: string;
}
//#endif
//#endif

//#if transportBare
declare module "@mercuryworkshop/bare-as-module3" {
	export const bareModulePath: string;
}

declare module "@tomphttp/bare-server-node" {
	import type { IncomingMessage, ServerResponse } from "node:http";
	import type { Duplex } from "node:stream";

	export function createBareServer(directory: string): {
		shouldRoute(request: IncomingMessage): boolean;
		routeRequest(request: IncomingMessage, response: ServerResponse): void;
		routeUpgrade(
			request: IncomingMessage,
			socket: Duplex,
			head: Buffer
		): void;
		close(): void;
	};
}
//#endif
//#endif

//#if vite
declare module "*?inline" {
	const css: string;
	export default css;
}
//#endif
