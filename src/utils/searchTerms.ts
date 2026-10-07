export function lastTermAt(value: string): number {
  return Math.max(value.lastIndexOf(","), value.lastIndexOf("="), value.lastIndexOf("+")) + 1;
}

export function lastWordOf(value: string): string {
  return value.slice(lastTermAt(value)).trimStart();
}

export function withPickedTerm(value: string, name: string): string {
  return `${value.slice(0, lastTermAt(value))}${name}`;
}
