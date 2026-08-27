# GeoIP Provisioning & Threat-Data Sources

The Global Threat Map plots two things: **who** an adversary is (threat
indicators) and **where** they are (geolocation). They come from different
sources, and only one of them needs provisioning.

## Where the map's data comes from

### Threat indicators — already good, no action needed

`CuratedIntelService` aggregates ten reputable public feeds, each carrying a
source-reputation weight:

- Abuse.ch — Feodo Tracker (C2 IPs) and MalwareBazaar (hashes)
- Spamhaus DROP
- FireHOL level 1 & 2
- Emerging Threats (compromised / block IPs)
- Cisco Talos IP blacklist
- AlienVault OTX reputation
- OpenPhish
- Binary Defense banlist

On top of these sit the node's **own live telemetry** — eBPF anomalies,
honeypot/canary hits, and firewall blocks — which are the highest-fidelity
signals because the node observed them directly. This half of the pipeline is
solid; the map's *"who"* is real.

### Geolocation — provision a local database for real attribution

`GeoIpService` resolves an indicator's location in this order:

1. **A local MaxMind-format database** (`.mmdb`), read offline by the built-in
   reader (`infrastructure/system/geoip/mmdb_reader.ts`). No network, no
   external API — the sovereign posture holds. This yields real
   country / city / latitude / longitude, and ASN/ISP if an ASN database is
   also present.
2. **A continent-level estimate** from real RIR (Regional Internet Registry)
   allocation ranges when no database is present. This is **flagged
   provisional** end-to-end: estimated points are drawn hollow and dashed on
   the map, counted separately, and the detail card shows the region and says
   "estimated". The estimator never invents a specific country, city, or ISP.

Until a database is provisioned the map still works — it just shows region-level
estimates instead of precise pins.

## Provisioning a database

Drop a MaxMind-format `.mmdb` file at the default path (or point the env var at
it):

| File | Default path | Env override |
| --- | --- | --- |
| City/Country DB | `./volume/storage/intel/geoip.mmdb` | `CTS_GEOIP_DB` |
| ASN DB (optional) | `./volume/storage/intel/geoip-asn.mmdb` | `CTS_GEOIP_ASN_DB` |

Restart the node (`deno task restart`) so the service picks the file up; the
audit log will confirm `GeoIP resolving against local database (...)`.

### Which database?

Any MaxMind DB v2 `.mmdb` in the City or Country schema works. Recommended,
in order of "sovereign-friendliness":

- **DB-IP Lite (City)** — freely downloadable `.mmdb`, no account or key, CC-BY.
  The path of least friction for an air-gapped appliance.
- **IP2Location LITE** — free with registration; ships `.mmdb` builds.
- **MaxMind GeoLite2 City** — free but requires a license key to download.
  For ASN/ISP enrichment, add **GeoLite2 ASN** as the ASN DB.

All are updated roughly weekly; refresh on whatever cadence your change-control
allows. The download itself is the only outbound step, done off the appliance
and copied in — the running node never phones out.

## Could the sources be better?

The threat feeds are already strong. Incremental improvements, in rough order of
value:

- **Add a local GeoIP DB** (above) — by far the biggest single upgrade; it turns
  the map from estimate to intelligence.
- **ASN enrichment** — provision the ASN DB so the detail card names the hosting
  provider / carrier, which is often more actionable than the city.
- **More feeds** — CINSscore, Blocklist.de, and URLhaus are cheap additions to
  `CuratedIntelService` if broader coverage is wanted.
- **STIX/TAXII ingestion** — for organisations that already run a threat-intel
  platform, a TAXII poller would let the node consume a curated internal feed
  rather than only public lists.
