import { defineConfig } from "vite";

// In development the API runs on :3000. The website calls it on the same origin, so proxy the API paths.
// Talent icons live in public/talents, so only the talent routes go to the API.
const api = { target: "http://localhost:3000" };
const paths = ["/auth", "/character", "/quests", "/inventory", "/market", "/fight", "/guild", "/dungeons", "/raids", "/shop", "/stats", "/leaderboard", "/profile", "/heartbeat", "/tour", "/ideas", "/inbox", "^/talents(?!/.+\\.svg$)"];
export default defineConfig({
  server: {
    proxy: Object.fromEntries(paths.map((p) => [p, api])),
  },
});
