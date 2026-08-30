# Cloudflare Tunnel Setup

## Overview

The Mac worker exposes local ACE-Step and poller services to Cloudflare Workers via a named tunnel.

## Models

### Pull Model (Recommended for development)

Use `cloudflared tunnel --url` for quick ephemeral tunnels. Cloudflare assigns a random `*.trycloudflare.com` hostname. The URL changes on restart, so use this only for local development.

```bash
cloudflared tunnel --url http://localhost:8000
```

### Service-Token Model (Recommended for production)

Use a named tunnel with a service token. The tunnel name, ID, and token are stored in Cloudflare Zero Trust. The local `cloudflared` authenticates with the service token and resumes the same tunnel across restarts.

1. Create the tunnel in Zero Trust dashboard:
   ```
   Zero Trust > Access > Tunnels > Create a tunnel > Cloudflared
   ```
2. Follow the setup wizard and select "Service token" authentication.
3. Copy the service token and save it as a secret (e.g. `TUNNEL_SERVICE_TOKEN` in the Cloudflare Worker secrets or local env).
4. Create `infra/tunnel/cloudflared.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /Users/praharshinikhil/Downloads/02-Projects/Chess_Muzik/CloudFlare_Chess/cloudflare_version_chess/infra/tunnel/credentials.json

ingress:
  - hostname: acestep.chess2music.com
    service: http://localhost:8000
  - hostname: poller.chess2music.com
    service: http://localhost:8001
  - service: http_status:404
```

5. Start the tunnel daemon on the Mac:

```bash
cloudflared service install
```

## Launchd Integration

Launchd plists are provided in `worker-mac/launchd/` to keep the tunnel and worker services alive across reboots.

```bash
# Load all services
launchctl load \
  worker-mac/launchd/com.chess2music.acestep.plist \
  worker-mac/launchd/com.chess2music.poller.plist \
  worker-mac/launchd/com.chess2music.cloudflared.plist

# Verify
launchctl list | grep chess2music
```

## DNS

Point the tunnel hostnames to the tunnel by creating CNAME records in Cloudflare DNS:

| Hostname | Type | Value |
|----------|------|-------|
| acestep.chess2music.com | CNAME | <TUNNEL_ID>.cfargotunnel.com |
| poller.chess2music.com | CNAME | <TUNNEL_ID>.cfargotunnel.com |

## Firewall

Ensure the local ports (8000, 8001) are not blocked by the macOS firewall. No inbound traffic from the public internet is required; `cloudflared` initiates outbound connections to Cloudflare edge.
