// SSRF guard for user-supplied outbound URLs (Ollama / custom AI provider base URLs).
//
// These features legitimately point at a user's OWN Ollama/LLM server, which is
// commonly on localhost or the LAN, so we deliberately do NOT block all private
// ranges (that would break the feature). We DO block:
//   - non-http(s) schemes (file:, gopher:, etc.)
//   - link-local / cloud-metadata ranges (169.254.0.0/16, fe80::/10), which are
//     never a valid LLM host and are the high-value SSRF target (169.254.169.254).
// The hostname is resolved so an attacker can't hide a link-local target behind DNS.
const dns = require('dns').promises;
const net = require('net');

function isBlockedIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 0) return true;                // "this network"
  return false;
}

function isBlockedIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::' ) return true;
  if (lower.startsWith('fe80')) return true;            // link-local
  if (lower.startsWith('fd00:ec2') || lower === 'fd00:ec2::254') return true; // AWS IMDS over IPv6
  // IPv4-mapped (::ffff:169.254.x.x) — extract and re-check
  const v4 = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return isBlockedIPv4(v4[1]);
  return false;
}

function isBlockedAddress(ip) {
  return net.isIPv4(ip) ? isBlockedIPv4(ip) : isBlockedIPv6(ip);
}

// Validates a user-supplied URL and returns a normalized URL string (no trailing
// slash). Throws an Error with a safe message if the URL is not allowed.
async function assertSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (e) {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }

  const host = parsed.hostname;
  // If the host is a literal IP, check it directly; otherwise resolve it.
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error('URL host is not allowed');
  } else {
    let addrs = [];
    try {
      addrs = await dns.lookup(host, { all: true });
    } catch (e) {
      throw new Error('Could not resolve URL host');
    }
    if (addrs.some(a => isBlockedAddress(a.address))) {
      throw new Error('URL host is not allowed');
    }
  }

  return parsed.toString().replace(/\/+$/, '');
}

module.exports = { assertSafeUrl };
