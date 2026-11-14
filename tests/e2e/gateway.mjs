// Minimal stand-in for Supabase's API gateway: routes /auth/v1 -> GoTrue and
// /rest/v1 -> PostgREST so @supabase/supabase-js works against a local stack.
import http from "node:http";

const ROUTES = [
  ["/auth/v1", Number(process.env.AUTH_PORT ?? 9999)],
  ["/rest/v1", Number(process.env.REST_PORT ?? 3001)],
];
const PORT = Number(process.env.GATEWAY_PORT ?? 54321);

http
  .createServer((req, res) => {
    const route = ROUTES.find(([p]) => req.url === p || req.url.startsWith(`${p}/`) || req.url.startsWith(`${p}?`));
    if (!route) {
      res.writeHead(404).end("not found");
      return;
    }
    const [prefix, port] = route;
    const headers = { ...req.headers, host: `127.0.0.1:${port}` };
    const upstream = http.request(
      { host: "127.0.0.1", port, method: req.method, path: req.url.slice(prefix.length) || "/", headers },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502).end(String(e));
    });
    req.pipe(upstream);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gateway on :${PORT}`));
