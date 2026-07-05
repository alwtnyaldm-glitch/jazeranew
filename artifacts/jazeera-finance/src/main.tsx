import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ─── تسجيل Service Worker لـ Firebase Messaging ────────────────────────────
async function registerFCMServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      console.log("[FCM] Service Worker registered:", registration.scope);
    } catch (error) {
      console.error("[FCM] Service Worker registration failed:", error);
    }
  }
}

registerFCMServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
