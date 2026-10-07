export const LOGIN_ID_MAX_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 24;
export const NICKNAME_MAX_WIDTH = 16;

const LOGIN_ID_PATTERN = /^[a-zA-Z0-9]+$/;

export function isValidLoginId(value: string): boolean {
  return value.length > 0 && value.length <= LOGIN_ID_MAX_LENGTH && LOGIN_ID_PATTERN.test(value);
}

export function isValidPasswordLength(value: string): boolean {
  return value.length <= PASSWORD_MAX_LENGTH;
}

export function displayWidth(value: string): number {
  let width = 0;
  for (const ch of value) width += /[\x00-\x7F]/.test(ch) ? 1 : 2;
  return width;
}

export function isValidNickname(value: string): boolean {
  return value.length > 0 && displayWidth(value) <= NICKNAME_MAX_WIDTH;
}

const BATTLETAG_PATTERN = /^.+#\d+$/;

export function isValidBattletag(value: string): boolean {
  return BATTLETAG_PATTERN.test(value.trim());
}
