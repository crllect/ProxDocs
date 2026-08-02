import { createRoot } from "react-dom/client";
import ProxyShell from "./ProxyShell.{{COMPONENT_EXT}}";

//#if ts
const root = document.getElementById("root")!;
//#else
const root = document.getElementById("root");
//#endif

createRoot(root).render(<ProxyShell />);
