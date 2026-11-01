import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./estilos.css";

createRoot(document.getElementById("raiz")!).render(<App />);

// El navegador solo activa el service worker en HTTPS o en localhost.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/sw.js");
}
// Pide al navegador que no borre la cola local si se queda sin espacio.
void navigator.storage?.persist?.();
