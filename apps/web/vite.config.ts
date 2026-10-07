import { defineConfig } from "vite";

// In development the API runs on :3000. The website calls it on the same origin, so proxy the API paths.
const api = { target: "http://localhost:3000" };
export default defineConfig({
  server: {
    proxy: Object.fromEntries(["/auth", "/character", "/quests", "/inventory", "/market", "/fight", "/guild", "/dungeons"].map((p) => [p, api])),
  },
});
