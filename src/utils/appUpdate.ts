let occurred = false;

export function markAppUpdatePreloadError(): void {
  occurred = true;
}

export function hasAppUpdatePreloadErrorOccurred(): boolean {
  return occurred;
}
