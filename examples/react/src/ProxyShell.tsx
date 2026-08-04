import { useEffect } from "react";

const spelling = { spellCheck: false };

const ProxyShell = () => {
	useEffect(() => {
		void import("./app.ts");
	}, []);

	return (
		<div className="app-root">
			<div className="toolbar">
				<div className="toolbar__left">
					<button
						id="back"
						type="button"
						aria-label="Back"
						title="Back"
					>
						&lt;
					</button>
					<button
						id="forward"
						type="button"
						aria-label="Forward"
						title="Forward"
					>
						&gt;
					</button>
					<button id="reload" type="button">
						reload
					</button>
				</div>

				<form id="omnibox" className="omnibox" role="search">
					<input
						id="address"
						type="text"
						name="address"
						placeholder="search or enter address"
						autoComplete="off"
						autoCapitalize="off"
						{...spelling}
						enterKeyHint="go"
						aria-label="Address"
					/>
				</form>

				<div className="toolbar__right">
					<button data-popup="settings" type="button">
						settings
					</button>
				</div>
			</div>

			<div id="popup" className="popup" hidden>
				<section
					className="popup__panel"
					role="dialog"
					aria-modal="true"
					aria-labelledby="popup-title"
				>
					<header className="popup__header">
						<span id="popup-title"></span>
						<button
							id="popup-close"
							type="button"
							aria-label="Close menu"
						>
							close
						</button>
					</header>
					<iframe
						id="popup-frame"
						className="popup__frame"
						title="Menu"
						sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts allow-downloads"
					></iframe>
				</section>
			</div>

			<div id="tabs" className="tabs" role="tablist"></div>

			<p id="status" className="status" role="status" hidden></p>
			<main id="frames" className="frames"></main>
		</div>
	);
};

export default ProxyShell;
