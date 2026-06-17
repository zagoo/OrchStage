# Deploying the Orch8 Console

The console is a static SPA. It must reach orch8-server's HTTP API **on the same
origin** as the page, otherwise the browser blocks the calls with a CORS error.

> **Why the "wrong port / CORS" error happens:** if you build the SPA, serve it on
> (say) `http://host:5173`, and then set the console's **Server URL** to
> `http://host:8080`, every API call goes cross-origin to the server's port. The
> browser rejects it unless orch8-server explicitly allows that origin. The fix is
> to put a proxy in front so the browser only ever talks to the UI's own origin and
> you leave **Server URL blank**.

There are two supported topologies. **Same-origin (A) is strongly recommended.**

---

## A. Same-origin reverse proxy (recommended)

The UI and the API are served under one origin. A reverse proxy serves the built
static files and forwards `/api`, `/health`, `/info`, `/metrics`, `/mobile` to
orch8-server. In the console, **leave Server URL blank**.

### A1. Quick / single-node: `vite preview`

`vite preview` serves `dist/` and applies the same proxy as dev (see
`vite.config.ts → preview.proxy`):

```bash
npm install && npm run build
ORCH8_API_URL=http://127.0.0.1:8080 npm run preview   # serves on http://localhost:4173
```

Open `http://localhost:4173`, leave **Server URL blank**, connect. No CORS.

### A2. Production: nginx

```nginx
server {
  listen 8080;                      # the ONE origin the browser uses
  server_name console.example.com;

  # Built SPA assets (SPA-history fallback to index.html)
  root /var/www/orch8-ui/dist;
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Forward the API surface to orch8-server (same origin → no CORS)
  location ~ ^/(api|health|info|metrics|mobile)(/|$) {
    proxy_pass http://127.0.0.1:8081;   # orch8-server bind address
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # SSE: the live instance stream (GET /api/v1/instances/{id}/stream) needs
    # buffering disabled so events flush immediately.
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
  }
}
```

Build: `npm run build`, copy `dist/` to `/var/www/orch8-ui/dist`, reload nginx.

### A3. Production: Caddy

```caddy
console.example.com {
  root * /var/www/orch8-ui/dist
  @api path /api/* /health/* /info /metrics /mobile/*
  reverse_proxy @api 127.0.0.1:8081 {
    flush_interval -1   # disable buffering for SSE
  }
  try_files {path} /index.html
  file_server
}
```

---

## B. Cross-origin with CORS enabled on the server

If you cannot run a proxy and must point the console directly at the server's
port, then orch8-server has to allow the UI's origin. Set the console's **Server
URL** to the absolute server URL **and** configure the server:

```bash
# on orch8-server
export ORCH8_CORS_ORIGINS="https://console.example.com"   # the UI origin, NOT "*" with auth
```

Notes:
- Never combine a wildcard `*` CORS origin with API-key auth (see PROJECT_PANORAMA "Production Traps").
- The browser will send a CORS pre-flight (`OPTIONS`) for the `X-API-Key` /
  `X-Tenant-Id` headers; the server must answer it. Topology A avoids all of this.

---

## Configuration recap

| Topology | Console "Server URL" | Server needs CORS? | Exposes server port to browser? |
|---|---|---|---|
| A. Same-origin proxy (recommended) | **blank** | no | no |
| B. Direct cross-origin | absolute `https://host:8080` | **yes** (`ORCH8_CORS_ORIGINS`) | yes |

The client always sends `X-API-Key` and (when set) `X-Tenant-Id`; it talks to
whatever origin **Server URL** resolves to (blank = same origin). See
`src/api/http.ts`.
