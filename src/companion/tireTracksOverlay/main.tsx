import { createRoot } from "react-dom/client";
import { TireTracksOverlayApp } from "./TireTracksOverlayApp";
import "./tire-tracks-overlay.css";

const mount = document.getElementById("root");
if (!mount) throw new Error("#root missing");
createRoot(mount).render(<TireTracksOverlayApp />);
