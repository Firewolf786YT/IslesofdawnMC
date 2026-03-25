# discord-notify edge function

This function receives website events and posts them to a Discord channel using a webhook.

## 1) Create Discord webhook

1. Open Discord channel settings.
2. Go to **Integrations** → **Webhooks**.
3. Create webhook and copy the URL.

## 2) Set Supabase secret

In your Supabase project:

- Go to **Project Settings** → **Edge Functions** → **Secrets**.
- Add:
  - `DISCORD_WEBHOOK_URL_APPLICATIONS` = applications channel webhook URL (optional)
  - `DISCORD_WEBHOOK_URL_APPEALS` = appeals channel webhook URL (optional)
  - `DISCORD_WEBHOOK_URL` = fallback/default webhook URL

Routing behavior:

- `application.submitted` → `DISCORD_WEBHOOK_URL_APPLICATIONS` (falls back to default)
- `appeal.submitted` → `DISCORD_WEBHOOK_URL_APPEALS` (falls back to default)
- unknown events → default webhook

## 3) Deploy function

Using Supabase CLI from this repo root:

```bash
supabase functions deploy discord-notify
```

## 4) Verify from website

- Submit an application (`apply.html`) or appeal (`appeals.html`).
- The site now invokes `client.functions.invoke('discord-notify', ...)` after successful Supabase save.
- A Discord embed message should appear in your configured channel.

## Notes

- The website save operation does **not** fail if Discord notification fails.
- If notifications fail, check Supabase function logs and verify webhook secret.
- You can use only `DISCORD_WEBHOOK_URL` if you want all events in one channel.
- Application notifications use role-aware titles/colors (Support, Dev, QA, Build, Media, Event, Content Creator) for faster triage.
