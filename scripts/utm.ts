// Usage:
//   npm run utm -- --url https://example.com/blog/post --channel youtube --campaign cli-launch
//   npm run utm -- --url https://example.com/cli --channel conference --event "DevConf 2026" --qr
//   npm run utm -- --list    show the channels and their source and medium

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { qrSvg } from '../src/lib/qr';
import { buildUtmParams, buildUtmUrl, listChannels, UtmError } from '../src/lib/utm';

const QR_DIR = 'data/qr';

const USAGE = `Usage: npm run utm -- --url <link> --channel <channel> --campaign <name> [options]

  --url <link>        The link to tag (http or https)
  --channel <id>      Where the link will be shared (see --list)
  --campaign <name>   What the link promotes, e.g. cli-launch
  --event <name>      Conference: the event, e.g. "DevConf 2026". Also the campaign unless --campaign is set
  --date <date>       Conference: the event's year or date, added to the event when the name has no year
  --platform <name>   Livestream: youtube, twitch, linkedin, x or facebook. Community: discord, forum, ...
  --content <text>    Optional utm_content, to tell two links in the same place apart
  --term <text>       Optional utm_term
  --qr                Also write a QR code as SVG to ${QR_DIR}/<campaign>-<channel>.svg
  --out <path>        Write the QR code to this file instead
  --list              Show the channels and their source and medium
  --help              Show this help

Examples:
  npm run utm -- --url https://example.com/blog/post --channel youtube --campaign cli-launch
  npm run utm -- --url https://example.com/cli --channel conference --event "DevConf 2026" --qr`;

/** Stops with a plain message instead of a stack trace. */
function fail(message: string): never {
  console.error(message);
  console.error('Run "npm run utm -- --help" for usage.');
  process.exit(1);
}

function readArgs() {
  try {
    return parseArgs({
      options: {
        url: { type: 'string' },
        channel: { type: 'string' },
        campaign: { type: 'string' },
        event: { type: 'string' },
        date: { type: 'string' },
        platform: { type: 'string' },
        content: { type: 'string' },
        term: { type: 'string' },
        qr: { type: 'boolean' },
        out: { type: 'string' },
        list: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    }).values;
  } catch (err) {
    // parseArgs reports an unknown or incomplete option with a readable message.
    fail(err instanceof Error ? err.message : String(err));
  }
}

function printChannels() {
  const rows = [
    ['CHANNEL', 'SOURCE', 'MEDIUM', 'CONTENT', 'USE FOR'],
    ...listChannels().map((c) => [c.id, c.source, c.medium, c.content ?? '', c.use]),
  ];
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  for (const row of rows) console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd());
}

async function main() {
  const args = readArgs();
  if (args.help) return console.log(USAGE);
  if (args.list) return printChannels();

  if (!args.url) fail('Missing --url: the link to tag.');
  if (!args.channel) fail('Missing --channel. Run "npm run utm -- --list" to see the channels.');

  const channel = args.channel.trim().toLowerCase();
  const isConference = channel === 'conference';
  if (isConference && !args.event) fail('Missing --event: the conference name, e.g. --event "DevConf 2026".');
  if (!isConference && !args.campaign) fail('Missing --campaign: what the link promotes, e.g. --campaign cli-launch.');

  const wantsQr = Boolean(args.qr || args.out);
  const input = {
    url: args.url,
    channel,
    campaign: args.campaign,
    // On a conference link the default content is "slides"; the QR code on the
    // same slide gets its own, so scans and typed links can be told apart.
    content: args.content ?? (wantsQr && isConference ? 'qr' : undefined),
    term: args.term,
    platform: args.platform,
    event: args.event,
    date: args.date,
  };

  const link = buildUtmUrl(input);
  console.log(link);

  if (wantsQr) {
    const { campaign } = buildUtmParams(input);
    const file = args.out ?? join(QR_DIR, `${campaign}-${channel}.svg`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await qrSvg(link));
    console.log(`QR code written to ${file}`);
  }
}

try {
  await main();
} catch (err) {
  if (err instanceof UtmError) fail(err.message);
  throw err;
}
