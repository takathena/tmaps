/**
 * Validasi IP address (IPv4/IPv6) untuk cegah command injection.
 * Hanya accept karakter yang valid di IP address.
 */
export function isValidIpAddress(ip: string | null): boolean {
  if (!ip || ip.length === 0) return true; // null/empty = valid (opsional)
  if (ip.length > 45) return false; // IPv6 max 39 + bracket/zone ID

  // IPv4: 0-255.0-255.0-255.0-255
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split(".");
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  // IPv6: hex groups separated by :, can have :: compression
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (ipv6Regex.test(ip)) return true;

  // IPv6 with :: compression at start/end
  if (/^::([0-9a-fA-F]{0,4}:)*[0-9a-fA-F]{0,4}$/.test(ip)) return true;
  if (/^([0-9a-fA-F]{0,4}:)*[0-9a-fA-F]{0,4}::$/.test(ip)) return true;

  return false;
}

/**
 * Error untuk IP address tidak valid (cegah command injection).
 */
export function ipAddressError(ip: string | null): string | null {
  if (!ip) return null;
  if (!isValidIpAddress(ip)) {
    return "IP address tidak valid. Hanya format IPv4 atau IPv6 yang diizinkan.";
  }
  return null;
}
