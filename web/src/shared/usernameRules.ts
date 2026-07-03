export const USERNAME_MAX_LEN = 32;

const USERNAME_PATTERN = /^[\w\u3131-\u318E\uAC00-\uD7A3.-]+$/;

export function normalizeUsernameInput(raw: string) {
  return raw.trim();
}

export function validateUsername(raw: string): { ok: true; username: string } | { ok: false; code: string } {
  const username = normalizeUsernameInput(raw);
  if (!username) return { ok: false, code: "EMPTY" };
  if (username.length > USERNAME_MAX_LEN) return { ok: false, code: "TOO_LONG" };
  if (!USERNAME_PATTERN.test(username)) return { ok: false, code: "INVALID_CHARS" };
  return { ok: true, username };
}

export function usernameChangeErrorMessage(code: string): string {
  switch (code) {
    case "EMPTY":
      return "이름을 입력해 주세요.";
    case "TOO_LONG":
      return `이름은 ${USERNAME_MAX_LEN}자 이하로 입력해 주세요.`;
    case "INVALID_CHARS":
      return "한글·영문·숫자·밑줄(_)·하이픈(-)·마침표(.)만 사용할 수 있어요.";
    case "USERNAME_TAKEN":
      return "이미 사용 중인 이름이에요.";
    case "SAME_USERNAME":
      return "현재 이름과 같아요.";
    case "UNAUTHORIZED":
      return "로그인이 필요해요.";
    case "USER_NOT_FOUND":
      return "계정을 찾을 수 없어요.";
    case "BAD_REQUEST":
      return "입력값을 확인해 주세요.";
    default:
      return code || "이름 변경에 실패했어요.";
  }
}
