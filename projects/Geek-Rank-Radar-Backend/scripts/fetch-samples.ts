/**
 * Fetch real Google HTML samples for parser calibration.
 * Run with: npx tsx scripts/fetch-samples.ts
 *
 * Saves raw HTML to scripts/samples/ for manual inspection
 * and parser selector development.
 */

import axios from 'axios';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(__dirname, 'samples');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function buildHeaders(): Record<string, string> {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  };
}

// UULE for Delray Beach, Florida (base64-encoded canonical name)
const UULE = 'w+CAIQICIVRGW1yYXkgQmVhY2gsRmxvcmlkYSxVbml0ZWQgU3RhdGVz';

interface FetchTarget {
  name: string;
  filename: string;
  url: string;
  params: Record<string, string | number>;
}

const targets: FetchTarget[] = [
  {
    name: 'Google Search',
    filename: 'google-search.html',
    url: 'https://www.google.com/search',
    params: {
      q: 'pizza near me',
      num: 20,
      hl: 'en',
      gl: 'us',
      uule: UULE,
    },
  },
  {
    name: 'Google Maps',
    filename: 'google-maps.html',
    url: 'https://www.google.com/maps/search/pizza+near+me/@26.4615,-80.0728,13z',
    params: {},
  },
  {
    name: 'Google Local Finder',
    filename: 'google-local.html',
    url: 'https://www.google.com/search',
    params: {
      q: 'pizza near me',
      tbm: 'lcl',
      hl: 'en',
      gl: 'us',
      uule: UULE,
    },
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  mkdirSync(SAMPLES_DIR, { recursive: true });

  console.log(`Fetching ${targets.length} Google HTML samples...`);
  console.log(`Saving to: ${SAMPLES_DIR}\n`);

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    console.log(`[${i + 1}/${targets.length}] Fetching ${target.name}...`);

    try {
      const response = await axios.get(target.url, {
        headers: buildHeaders(),
        params: Object.keys(target.params).length > 0 ? target.params : undefined,
        timeout: 15000,
        responseType: 'text',
        maxRedirects: 3,
      });

      const html = response.data as string;
      const filepath = join(SAMPLES_DIR, target.filename);
      writeFileSync(filepath, html, 'utf-8');

      const sizeKb = (Buffer.byteLength(html) / 1024).toFixed(1);
      console.log(`  Saved ${target.filename} (${sizeKb} KB, status ${response.status})`);

      // Check for CAPTCHA
      const lower = html.toLowerCase();
      if (lower.includes('unusual traffic') || lower.includes('captcha') || lower.includes('recaptcha')) {
        console.log('  WARNING: CAPTCHA detected in response!');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED: ${msg}`);
    }

    // Wait 10 seconds between fetches
    if (i < targets.length - 1) {
      console.log('  Waiting 10 seconds...');
      await sleep(10000);
    }
  }

  console.log('\nDone. Inspect HTML files in scripts/samples/ to calibrate parser selectors.');
}

main().catch(console.error);
