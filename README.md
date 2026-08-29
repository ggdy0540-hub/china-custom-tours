# Jing · Meet China — Custom Tours

Bespoke, privately-guided tours across China. This is a **static site** (plain HTML/CSS/JS) with **zero build step**.

## Deploy to Vercel (one click)

> Push this repo to GitHub first, then replace `ggdy0540-hub` in the button URL below with your actual username, or just use the manual import.



![Deploy with Vercel](https://vercel.com/button)

**Manual import:** Vercel → *Add New… → Project* → *Import Git Repository* → select this repo → *Deploy*. Vercel auto-detects the static config from `vercel.json`.

## Custom domain

1. Vercel → project *Settings → Domains* → add `meetchina.dpdns.org`.
2. In your DNS provider (dpdns.org), point the record `meetchina` (CNAME) to `cname.vercel-dns.com`.
3. Wait for DNS propagation (minutes–hours); Vercel provisions HTTPS automatically.

## Local preview

```bash
python -m http.server 8000
# open http://localhost:8000
```

## Project structure

- `index.html` — home, plus destination / tour / info pages
- `about.html`, `contact.html`, `tours.html`, `faq.html`, `privacy.html`, `terms.html`
- `dest-*.html` — destination pages; `tour-*.html` — tour themes
- `assets/` — `css/`, `js/`, `img/` (all paths relative)
- `vercel.json` — static deploy config (no build, `outputDirectory: .`)
