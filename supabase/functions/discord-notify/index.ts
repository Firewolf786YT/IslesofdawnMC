// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type NotifyRequest = {
  eventType?: string;
  submittedAt?: string;
  source?: string;
  payload?: Record<string, unknown>;
};

const resolveWebhookUrl = (eventType: string) => {
  if (eventType === 'application.submitted') {
    return Deno.env.get('DISCORD_WEBHOOK_URL_APPLICATIONS') || Deno.env.get('DISCORD_WEBHOOK_URL');
  }

  if (eventType === 'appeal.submitted') {
    return Deno.env.get('DISCORD_WEBHOOK_URL_APPEALS') || Deno.env.get('DISCORD_WEBHOOK_URL');
  }

  return Deno.env.get('DISCORD_WEBHOOK_URL');
};

const getColorByEventType = (eventType: string) => {
  if (eventType === 'application.submitted') return 0x7aa2ff;
  if (eventType === 'appeal.submitted') return 0xf5c53c;
  return 0x9da7b3;
};

const APP_ROLE_STYLES: Record<string, { title: string; color: number }> = {
  'support-team': { title: 'New Support Team Application', color: 0x5ac48c },
  'dev-team': { title: 'New Development Team Application', color: 0x8b5cf6 },
  'qa-team': { title: 'New QA Team Application', color: 0x7aa2ff },
  'build-team': { title: 'New Build Team Application', color: 0xf0b36a },
  'media-team': { title: 'New Media Team Application', color: 0xe879f9 },
  'event-team': { title: 'New Event Team Application', color: 0xf5c53c },
  'content-creator': { title: 'New Content Creator Application', color: 0xef4444 },
};

const normalizeRoleId = (value: unknown) => String(value || '')
  .trim()
  .toLowerCase();

const getApplicationStyle = (payload: Record<string, unknown>) => {
  const roleId = normalizeRoleId(payload.roleId);
  const defaultTitle = 'New Staff Application Submitted';
  const defaultColor = getColorByEventType('application.submitted');

  if (!roleId || !APP_ROLE_STYLES[roleId]) {
    return { title: defaultTitle, color: defaultColor };
  }

  return APP_ROLE_STYLES[roleId];
};

const toField = (name: string, value: unknown, inline = true) => ({
  name,
  value: String(value ?? 'Not provided').slice(0, 1024) || 'Not provided',
  inline,
});

const buildEmbed = (body: NotifyRequest) => {
  const eventType = String(body.eventType || 'unknown');
  const payload = body.payload || {};

  if (eventType === 'application.submitted') {
    const appStyle = getApplicationStyle(payload);
    return {
      title: appStyle.title,
      color: appStyle.color,
      fields: [
        toField('Role', payload.roleTitle || payload.roleId || 'Unknown', true),
        toField('Minecraft', payload.minecraftUsername || 'Unknown', true),
        toField('Discord', payload.discord || 'Not provided', true),
        toField('Email', payload.email || 'Not provided', true),
        toField('Submission ID', payload.id || 'Unknown', false),
      ],
      timestamp: body.submittedAt || new Date().toISOString(),
      footer: { text: 'IslesOfDawnMC Website' },
    };
  }

  if (eventType === 'appeal.submitted') {
    return {
      title: 'New Appeal Submitted',
      color: getColorByEventType(eventType),
      fields: [
        toField('Minecraft', payload.minecraftName || 'Unknown', true),
        toField('Discord', payload.discord || 'Not provided', true),
        toField('Email', payload.email || 'Not provided', true),
        toField('Punishment Type', payload.punishmentType || 'Unknown', true),
        toField('Location', payload.punishmentLocation || 'Unknown', true),
        toField('Submission ID', payload.id || 'Unknown', false),
      ],
      timestamp: body.submittedAt || new Date().toISOString(),
      footer: { text: 'IslesOfDawnMC Website' },
    };
  }

  return {
    title: 'Website Event Received',
    color: getColorByEventType(eventType),
    fields: [
      toField('Event Type', eventType, true),
      toField('Source', body.source || 'website', true),
      toField('Payload', JSON.stringify(payload).slice(0, 1000), false),
    ],
    timestamp: body.submittedAt || new Date().toISOString(),
    footer: { text: 'IslesOfDawnMC Website' },
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: 'Method not allowed.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: NotifyRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, message: 'Invalid JSON payload.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const eventType = String(body.eventType || 'unknown');
  const webhookUrl = resolveWebhookUrl(eventType);
  if (!webhookUrl) {
    return new Response(JSON.stringify({
      ok: false,
      message: 'Missing Discord webhook secret. Set DISCORD_WEBHOOK_URL or event-specific webhook secrets.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const embed = buildEmbed(body);
  const discordPayload = {
    username: 'IslesOfDawnMC Bot',
    embeds: [embed],
  };

  const discordRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discordPayload),
  });

  if (!discordRes.ok) {
    const text = await discordRes.text();
    return new Response(JSON.stringify({ ok: false, message: `Discord webhook failed: ${text || discordRes.status}` }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
