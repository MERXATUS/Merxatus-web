export function googleAuthErrorMessage(code: string): string {
  if (code === "google_not_configured") {
    return "Google 로그인 환경 변수가 설정되지 않았어요. (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)";
  }
  if (code === "invalid_state") {
    return "로그인 세션이 만료됐거나 쿠키가 차단됐어요. 시크릿 창 말고 일반 창에서 다시 로그인해 보세요.";
  }
  if (code === "access_denied") {
    return "Google 로그인이 취소됐거나, OAuth 테스트 사용자에 계정이 등록되지 않았어요.";
  }
  if (code.startsWith("wrong_origin:")) {
    return decodeURIComponent(code.slice("wrong_origin:".length));
  }
  if (code.startsWith("GOOGLE_TOKEN_FAILED|") || code.startsWith("GOOGLE_TOKEN_FAILED:")) {
    const sep = code.includes("|") ? "|" : ":";
    const rest = code.slice(`GOOGLE_TOKEN_FAILED${sep}`.length);
    const parts = rest.split("|");
    const err = parts[0] ?? "unknown";
    const detail = parts[1] ? decodeURIComponent(parts[1]) : "";
    const uri = parts[2] ? decodeURIComponent(parts[2]) : "";

    if (err === "redirect_uri_mismatch") {
      return `리디렉션 URI 불일치. Google 콘솔 → 승인된 리디렉션 URI에 아래를 그대로 추가하세요:\n${uri || "http://localhost:3000/api/auth/google/callback"}`;
    }
    if (err === "invalid_client") {
      return "클라이언트 ID/비밀키 오류. .env의 GOOGLE_CLIENT_SECRET을 Google 콘솔과 다시 맞춰 주세요.";
    }
    if (err === "invalid_grant") {
      return "인증 코드 만료. 로그인을 처음부터 다시 시도해 주세요.";
    }
    return `Google 토큰 오류 (${err})${detail ? `: ${detail}` : ""}${uri ? `\n사용 URI: ${uri}` : ""}`;
  }
  return decodeURIComponent(code);
}
