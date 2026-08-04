export type SessionHandlers = {
	url?: (url: string) => void;
	loading?: () => void;
	ready?: () => void;
	error?: (error: Error | unknown) => void;
	escape?: (url: string) => void;
};

export type ProxySession = {
	readonly element: HTMLIFrameElement;
	url: string;
	go(url: string): void;
	back(): void;
	forward(): void;
	reload(): void;
	destroy(): void;
};

export type TransportKind = "libcurl" | "epoxy" | "bare";

export type TransportConfig = {
	kind: TransportKind;
	wisp?: string;
	bare?: string;
};

export type TransportChoice = {
	id: TransportKind;
	label: string;
	detail: string;
};

export type ProxyEngine = {
	readonly id: "scramjet";
	readonly label: string;
	readonly supportsTransportSwitch: boolean;
	init(): Promise<unknown>;
	createSession(
		element: HTMLIFrameElement,
		handlers?: SessionHandlers
	): Promise<ProxySession>;
	setTransport?(config: Partial<TransportConfig>): Promise<TransportConfig>;
	getTransport?(): TransportConfig;
	listTransports?(): TransportChoice[];
};

export type ResolvedInput = {
	url: string;
	kind: "empty" | "url" | "search" | "internal" | "external" | "blocked";
};
