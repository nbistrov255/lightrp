import { config } from './config.js';

/**
 * Отправка сообщения в Discord через webhook.
 * channel: 'bookings' | 'general'
 */
export async function sendDiscord(channel, { title, description, fields = [], color = 0x7c5cff, url } = {}) {
  const hook = config.discord[channel] || config.discord.general;
  if (!hook) return false;
  try {
    const res = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'CyberHub Control',
        embeds: [{
          title: title?.slice(0, 256),
          description: description?.slice(0, 4000),
          url: url || undefined,
          color,
          fields: fields.filter((f) => f.value).map((f) => ({ name: f.name, value: String(f.value).slice(0, 1024), inline: f.inline ?? true })),
          timestamp: new Date().toISOString(),
        }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.warn('Discord webhook:', res.status, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    console.warn('Discord webhook error:', e.message);
    return false;
  }
}
