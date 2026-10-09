const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

if (import.meta.env.PROD && !configuredApiUrl) {
  throw new Error("VITE_API_URL must be set to the backend URL in production.");
}

export const API_URL = (configuredApiUrl || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
