# ProofFlow — proofflow.me

Static website for ProofFlow (free proof of delivery app & fleet tracker).
Plain HTML/CSS/JS in `site/` — no build step. Served by nginx in a container.

## Deploy (FedServ)

```bash
cd ~/Projects   # or wherever repos live on the server
git clone https://github.com/spencerawlson/proofflow.git
cd proofflow
docker compose up -d --build
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8093/   # expect 200
```

Updates:

```bash
cd ~/Projects/proofflow
git pull
docker compose up -d --build
```

The container publishes the site on host port **8093**.

## Pointing proofflow.me at it

Two things have to agree:

1. **Cloudflare Tunnel** (same tunnel pattern as the other sites): add a public
   hostname route — `proofflow.me` → `http://localhost:8093` — and the matching
   `www.proofflow.me` if wanted. The tunnel creates the DNS record when the
   domain's DNS is on Cloudflare.
2. **Remove the old Base44 DNS records** for proofflow.me (whatever currently
   sends the domain to Base44) so the domain resolves to the tunnel instead.

If proofflow.me's DNS is not on Cloudflare yet, move the domain's nameservers
to Cloudflare first (free plan), wait for it to go active, then do step 1.

## Google AdSense

- Publisher ID is wired in `site/assets/js/site-config.js`
  (`ca-pub-7457789518091238`); `site/ads.txt` carries the matching line.
- After the site is live: in the AdSense account, add `proofflow.me` under
  Sites and request review. Once approved, create ad units and hand the
  `data-ad-slot` IDs to Everest to place in the `.ad-slot` containers
  (they intentionally render nothing until then).

## Layout

- `site/` — the website (pages, `assets/css`, `assets/js`, guides, ads.txt,
  sitemap.xml, robots.txt)
- `Dockerfile`, `nginx.conf`, `docker-compose.yml` — container serving setup
