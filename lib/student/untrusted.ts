/**
 * Fence text that must not be able to close its delimiter or rewrite instructions.
 * Lesson bodies and student messages are untrusted reference material.
 */
export function neutralizeDelimiter(value: string, label: string): string {
  const closer = `</${label}>`;
  const opener = `<${label}`;
  return value.split(closer).join(`‹/${label}›`).split(opener).join(`‹${label}`);
}

export function fenceUntrusted(label: string, value: string): string {
  return `<${label}>\n${neutralizeDelimiter(value, label)}\n</${label}>`;
}

export function oneLine(value: string, max: number): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}
