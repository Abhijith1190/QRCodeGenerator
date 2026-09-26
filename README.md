# QRCodeGenerator

A free, browser-only QR code and barcode generator — no build step, nothing you enter ever leaves your machine except an optional sign-in.

## Features

**QR codes** for:
- Website URL
- Plain text
- Wi-Fi network (SSID/password/encryption)
- Contact card (vCard)
- Email (mailto with subject/body)
- SMS
- Phone number

Customizable dot pattern, eye (corner) style, size, error-correction level, and an optional logo overlay (auto-cropped to a circle, error correction bumped to High automatically).

**Colorful styling** (requires a free account — see setup below): one-click gradient presets, manual gradient colors/angle, and custom eye colors. Plain solid-color QR codes stay free for everyone.

**Barcodes** in Code 128, Code 39, EAN-13, EAN-8, UPC-A, ITF-14, MSI, and Pharmacode, with customizable colors, bar width, height, and text display.

Download either as PNG or SVG. Light/dark theme, remembered across visits.

## Running locally

No build tools required — it's plain HTML/CSS/JS.

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

(Opening `index.html` directly via `file://` won't work for the sign-in feature, since Supabase's client requires `http(s)://` — use the server above.)

## Setting up sign-in (Supabase)

Colorful presets/gradients/custom eye colors are gated behind a real account, backed by [Supabase](https://supabase.com) (free tier). To enable it:

1. Go to [supabase.com](https://supabase.com) and create a free account + new project (takes ~2 minutes; note the database password it asks you to set, though this app doesn't need direct DB access).
2. In your project, go to **Project Settings → API**. Copy the **Project URL** and the **anon / public** key (not the `service_role` key — that one must never be exposed client-side).
3. Open `config.js` in this repo and paste them in:
   ```js
   window.SUPABASE_CONFIG = {
     url: 'https://your-project-ref.supabase.co',
     anonKey: 'your-anon-public-key',
   };
   ```
4. Reload the page. "Sign in" in the header will now work — email/password sign-up and login, powered entirely by Supabase (no server code of ours involved).

**Optional:** by default Supabase requires email confirmation before a new user can log in. To skip that during testing, go to **Authentication → Providers → Email** in your Supabase dashboard and turn off "Confirm email". For production use, leaving it on is recommended.

Until `config.js` is filled in, the app works normally but sign-in shows a "not configured yet" message and colorful styling stays locked.

### Adding "Continue with Google"

The modal already has a Google button wired up; it just needs Google OAuth turned on in your Supabase project:

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a project, then go to **APIs & Services → Credentials → Create Credentials → OAuth client ID** (type: Web application).
2. Under **Authorized redirect URIs**, add your Supabase callback URL: `https://your-project-ref.supabase.co/auth/v1/callback` (find the exact value pre-filled in the next step).
3. In your Supabase dashboard, go to **Authentication → Providers → Google**, toggle it on, and paste in the **Client ID** and **Client Secret** from Google Cloud Console.
4. That's it — no code changes needed. Clicking "Continue with Google" redirects to Google, then back to this page already signed in.

If you skip this step, the Google button shows the same "not configured" error as email sign-in until both are set up.

## Deploying

Since this is a static site, it deploys anywhere: GitHub Pages, Netlify, Vercel, Cloudflare Pages — just point at the repo root. The Supabase anon key is safe to ship in client-side code/committed in `config.js`; it's designed for that (access is controlled by Supabase's Row Level Security, not by hiding the key).

## Stack

- [`qr-code-styling`](https://github.com/kozakdenys/qr-code-styling) for QR generation (dot shapes, gradients, custom eye colors)
- [`JsBarcode`](https://github.com/lindell/JsBarcode) for barcode generation
- [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) for authentication
- No framework, no bundler
