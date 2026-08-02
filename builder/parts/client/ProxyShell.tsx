//#if react
import { useEffect } from "react";
//#else
import { useEffect } from "preact/hooks";
//#endif

//#if react
const spelling = { spellCheck: false };
//#else
const spelling = { spellcheck: false };
//#endif

const ProxyShell = () => {
	useEffect(() => {
		void import("./app.{{CLIENT_EXT}}");
	}, []);

	return (
		<div className="app-root">
			<div className="toolbar">
				{/*#if browserControls */}
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
				{/*#endif */}

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

				{/*#if menuPages */}
				<div className="toolbar__right">
					{/*#if bookmarks */}
					<button id="bookmark" type="button" aria-pressed="false">
						bookmark
					</button>
					{/*#endif */}
					<button
						id="menu-toggle"
						type="button"
						aria-expanded="false"
					>
						menu
					</button>
				</div>
				{/*#endif */}
			</div>

			{/*#if menuPages */}
			<div id="menu" className="menu" hidden>
				{/*#if settings */}
				{/*#if aboutPages */}
				<button
					data-open="{{INTERNAL_SCHEME}}://settings"
					type="button"
				>
					settings
				</button>
				{/*#else */}
				<button data-popup="settings" type="button">
					settings
				</button>
				{/*#endif */}
				{/*#endif */}
				{/*#if history */}
				{/*#if aboutPages */}
				<button data-open="{{INTERNAL_SCHEME}}://history" type="button">
					history
				</button>
				{/*#else */}
				<button data-popup="history" type="button">
					history
				</button>
				{/*#endif */}
				{/*#endif */}
				{/*#if bookmarks */}
				{/*#if aboutPages */}
				<button
					data-open="{{INTERNAL_SCHEME}}://bookmarks"
					type="button"
				>
					bookmarks
				</button>
				{/*#else */}
				<button data-popup="bookmarks" type="button">
					bookmarks
				</button>
				{/*#endif */}
				{/*#endif */}
				{/*#if aboutPages */}
				<button data-open="{{INTERNAL_SCHEME}}://about" type="button">
					about
				</button>
				{/*#endif */}
			</div>
			{/*#endif */}

			{/*#if popupMenus */}
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
			{/*#endif */}

			{/*#if tabs */}
			<div id="tabs" className="tabs" role="tablist"></div>
			{/*#endif */}

			<p id="status" className="status" role="status" hidden></p>
			<main id="frames" className="frames"></main>
		</div>
	);
};

export default ProxyShell;
