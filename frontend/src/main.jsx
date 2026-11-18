import { createRoot } from "react-dom/client";
import "./index.css";
import AppRoot from "./AppRoot.jsx";

function setSquareFavicon(src, size = 64) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Crop the largest centered square from the image (no stretching)
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = canvas.toDataURL("image/png");
  };
  img.src = src;
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing root element");

const hot = import.meta.hot;
const root = hot?.data.root ?? createRoot(rootElement);
if (hot) hot.data.root = root;

root.render(<AppRoot />);

setSquareFavicon("/logo.png");