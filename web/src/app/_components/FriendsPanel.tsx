"use client";

import { useCallback, useEffect, useState } from "react";
import { GameBtn } from "@/app/_components/gameUi";
import { formatPanelError } from "@/shared/formatPanelError";
import { apiGetJson, apiPostJson } from "@/shared/sessionClient";

type FriendRow = { id: string; userId: string; username: string; since: string };
type IncomingRow = { id: string; createdAt: string; from: { id: string; username: string } };
type OutgoingRow = { id: string; createdAt: string; to: { id: string; username: string } };

type FriendsListResponse = {
  ok: true;
  incoming: IncomingRow[];
  outgoing: OutgoingRow[];
  friends: FriendRow[];
};

type FriendsPanelProps = {
  loggedIn: boolean;
  onStartTrade?: (username: string) => void;
};

export function FriendsPanel(props: FriendsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingRow[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRow[]>([]);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [addUsername, setAddUsername] = useState("");

  const refresh = useCallback(async () => {
    if (!props.loggedIn) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiGetJson<FriendsListResponse>("/api/friends/list");
      if (r?.ok) {
        setIncoming(r.incoming);
        setOutgoing(r.outgoing);
        setFriends(r.friends);
      }
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setLoading(false);
    }
  }, [props.loggedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function sendRequest() {
    const username = addUsername.trim();
    if (!username) return;
    setBusy("request");
    setError(null);
    try {
      await apiPostJson("/api/friends/request", { username });
      setAddUsername("");
      await refresh();
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setBusy(null);
    }
  }

  async function acceptRequest(requestId: string) {
    setBusy(`accept:${requestId}`);
    setError(null);
    try {
      await apiPostJson("/api/friends/accept", { requestId });
      await refresh();
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setBusy(null);
    }
  }

  async function rejectRequest(requestId: string) {
    setBusy(`reject:${requestId}`);
    setError(null);
    try {
      await apiPostJson("/api/friends/reject", { requestId });
      await refresh();
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancelRequest(requestId: string) {
    setBusy(`cancel:${requestId}`);
    setError(null);
    try {
      await apiPostJson("/api/friends/cancel", { requestId });
      await refresh();
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeFriend(friendUserId: string) {
    if (!window.confirm("친구 목록에서 삭제할까요?")) return;
    setBusy(`remove:${friendUserId}`);
    setError(null);
    try {
      await apiPostJson("/api/friends/remove", { friendUserId });
      await refresh();
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setBusy(null);
    }
  }

  if (!props.loggedIn) {
    return <p className="settings-hint">로그인하면 친구를 추가할 수 있어요.</p>;
  }

  return (
    <div className="friends-panel">
      <p className="settings-hint">닉네임으로 친구 요청을 보냅니다. 상대가 이미 요청을 보냈다면 자동으로 친구가 됩니다.</p>

      <div className="friends-panel__add">
        <input
          className="settings-rename__input market-input"
          placeholder="친구 닉네임"
          value={addUsername}
          maxLength={64}
          disabled={!!busy}
          onChange={(e) => setAddUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void sendRequest();
          }}
        />
        <GameBtn disabled={!!busy || !addUsername.trim()} onClick={() => void sendRequest()}>
          {busy === "request" ? "전송 중…" : "친구 추가"}
        </GameBtn>
      </div>

      {error ? (
        <p className="settings-rename__error friends-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="settings-hint">불러오는 중…</p> : null}

      {incoming.length > 0 ? (
        <div className="friends-panel__block">
          <h4 className="friends-panel__subtitle">받은 요청</h4>
          <ul className="friends-panel__list">
            {incoming.map((r) => (
              <li key={r.id} className="friends-panel__row">
                <span className="friends-panel__name">{r.from.username}</span>
                <span className="friends-panel__actions">
                  <button
                    type="button"
                    className="settings-btn settings-btn--primary"
                    disabled={!!busy}
                    onClick={() => void acceptRequest(r.id)}
                  >
                    수락
                  </button>
                  <button
                    type="button"
                    className="settings-btn settings-btn--ghost"
                    disabled={!!busy}
                    onClick={() => void rejectRequest(r.id)}
                  >
                    거절
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {outgoing.length > 0 ? (
        <div className="friends-panel__block">
          <h4 className="friends-panel__subtitle">보낸 요청</h4>
          <ul className="friends-panel__list">
            {outgoing.map((r) => (
              <li key={r.id} className="friends-panel__row">
                <span className="friends-panel__name">{r.to.username}</span>
                <button
                  type="button"
                  className="settings-btn settings-btn--ghost"
                  disabled={!!busy}
                  onClick={() => void cancelRequest(r.id)}
                >
                  취소
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="friends-panel__block">
        <h4 className="friends-panel__subtitle">친구 ({friends.length})</h4>
        {friends.length === 0 && !loading ? (
          <p className="settings-hint">아직 친구가 없어요.</p>
        ) : (
          <ul className="friends-panel__list">
            {friends.map((f) => (
              <li key={f.userId} className="friends-panel__row">
                <span className="friends-panel__name">{f.username}</span>
                <span className="friends-panel__actions">
                  {props.onStartTrade ? (
                    <button
                      type="button"
                      className="settings-btn settings-btn--primary"
                      disabled={!!busy}
                      onClick={() => props.onStartTrade?.(f.username)}
                    >
                      직거래
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="settings-btn settings-btn--ghost"
                    disabled={!!busy}
                    onClick={() => void removeFriend(f.userId)}
                  >
                    삭제
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
