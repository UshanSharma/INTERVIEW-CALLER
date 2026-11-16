import { createRoot } from "react-dom/client";
import "./index.css";
import AppRoot from "./AppRoot.jsx";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing root element");

const hot = import.meta.hot;
const root = hot?.data.root ?? createRoot(rootElement);
if (hot) hot.data.root = root;

root.render(<AppRoot />);