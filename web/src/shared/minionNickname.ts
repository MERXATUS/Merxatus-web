export const MINION_NICKNAME_MAX_LEN = 16;

const MINION_NICKNAME_PATTERN = /^[\w\u3131-\u318E\uAC00-\uD7A3.-]+$/;

export function normalizeMinionNicknameInput(raw: string) {
  return raw.trim();
}

export function minionDisplayName(
  nickname: string | null | undefined,
  combatClassLabel: string,
): string {
  const name = nickname?.trim();
  return name || combatClassLabel;
}

export function validateMinionNickname(
  raw: string,
): { ok: true; nickname: string } | { ok: false; code: string } {
  const nickname = normalizeMinionNicknameInput(raw);
  if (!nickname) return { ok: false, code: "EMPTY" };
  if (nickname.length > MINION_NICKNAME_MAX_LEN) return { ok: false, code: "TOO_LONG" };
  if (!MINION_NICKNAME_PATTERN.test(nickname)) return { ok: false, code: "INVALID_CHARS" };
  return { ok: true, nickname };
}

export function minionNicknameErrorMessage(code: string): string {
  switch (code) {
    case "EMPTY":
      return "이름을 입력해 주세요.";
    case "TOO_LONG":
      return `이름은 ${MINION_NICKNAME_MAX_LEN}자 이하로 입력해 주세요.`;
    case "INVALID_CHARS":
      return "한글·영문·숫자·밑줄(_)·하이픈(-)·마침표(.)만 사용할 수 있어요.";
    case "MINION_NOT_FOUND":
      return "미니언을 찾을 수 없어요.";
    case "BAD_REQUEST":
      return "입력값을 확인해 주세요.";
    default:
      return code || "이름 변경에 실패했어요.";
  }
}
