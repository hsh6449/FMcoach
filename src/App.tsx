import {
  Activity,
  ClipboardList,
  Database,
  Dumbbell,
  FolderOpen,
  MessageSquare,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Target,
  Trash2,
  Upload,
  Users
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { answerQuestion, buildCoachReport } from "./analysis/advisor";
import { topFits } from "./analysis/scoring";
import { sampleExport } from "./data/sampleExport";
import { parseFiles } from "./parsers/fmExport";
import type { ChatMessage, ImportBatch, Player } from "./types/domain";

const STORAGE_KEY = "fm-coach:batch";

export default function App() {
  const [batch, setBatch] = useState<ImportBatch | undefined>(() => loadBatch());
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [contextText, setContextText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "데이터를 넣으면 선수 역할, 훈련, 전술, 영입 우선순위를 같이 보겠습니다."
    }
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const players = batch?.players ?? [];
  const report = useMemo(() => buildCoachReport(players), [players]);
  const selectedPlayer = players.find((player) => player.id === selectedId);
  const filteredPlayers = useMemo(() => filterPlayers(players, query), [players, query]);

  useEffect(() => {
    if (batch) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(batch));
    }
  }, [batch]);

  async function handleFiles(files: FileList | File[]) {
    const nextBatch = await parseFiles([...files]);
    setBatch(nextBatch);
    setSelectedId(nextBatch.players[0]?.id);
    setMessages((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `${nextBatch.players.length}명의 선수를 읽었습니다. 이제 선수명, 전술, 훈련, 영입 질문을 해도 됩니다.`
      }
    ]);
  }

  async function loadSample() {
    const file = new File([sampleExport], "fm24-sample-export.html", { type: "text/html" });
    await handleFiles([file]);
  }

  function clearData() {
    localStorage.removeItem(STORAGE_KEY);
    setBatch(undefined);
    setSelectedId(undefined);
    setContextText("");
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "데이터를 비웠습니다. 새 export를 넣으면 다시 분석하겠습니다."
      }
    ]);
  }

  function askAssistant(prompt?: string) {
    const question = prompt ?? contextText.trim();
    if (!question) {
      return;
    }

    const contextPrefix = selectedPlayer ? `${selectedPlayer.name} 기준으로 ` : "";
    const answer = answerQuestion(`${contextPrefix}${question}`, players, report);
    setMessages((items) => [
      ...items,
      { id: crypto.randomUUID(), role: "user", content: question },
      { id: crypto.randomUUID(), role: "assistant", content: answer }
    ]);
    setContextText("");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">FM24 Local Assistant</p>
          <h1>FM Coach</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" title="샘플 데이터" onClick={loadSample}>
            <Database size={18} />
          </button>
          <button className="icon-button" title="데이터 비우기" onClick={clearData}>
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="rail">
          <section className="panel import-panel">
            <div className="panel-title">
              <FolderOpen size={18} />
              <h2>Import</h2>
            </div>
            <button className="upload-zone" onClick={() => fileInputRef.current?.click()}>
              <Upload size={22} />
              <span>FM24 HTML/TXT</span>
            </button>
            <input
              ref={fileInputRef}
              className="hidden-input"
              type="file"
              multiple
              accept=".html,.htm,.txt,.csv"
              onChange={(event) => {
                if (event.currentTarget.files) {
                  void handleFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }
              }}
            />
            <div className="source-list">
              {(batch?.sourceNames ?? []).map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            {batch?.warnings.map((warning) => (
              <p className="warning" key={warning}>{warning}</p>
            ))}
          </section>

          <section className="panel metric-panel">
            <div className="panel-title">
              <ShieldCheck size={18} />
              <h2>Squad</h2>
            </div>
            <div className="metric-grid">
              <Metric label="Players" value={players.length} />
              <Metric label="Best XI" value={report.bestXi.length} />
              <Metric label="Needs" value={report.needs.length} />
              <Metric label="Files" value={batch?.sourceNames.length ?? 0} />
            </div>
          </section>

          <section className="panel context-panel">
            <div className="panel-title">
              <Activity size={18} />
              <h2>Context</h2>
            </div>
            <select value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value || undefined)}>
              <option value="">No player</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
            </select>
            <div className="quick-actions">
              <button onClick={() => askAssistant("이 선수 훈련 뭐가 좋아?")}>훈련</button>
              <button onClick={() => askAssistant("이 선수 역할은?")}>역할</button>
              <button onClick={() => askAssistant("보강 우선순위는?")}>영입</button>
            </div>
          </section>
        </aside>

        <section className="main-stage">
          <div className="toolbar">
            <div className="search-field">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="선수, 포지션, 국적 검색" />
            </div>
            <button className="soft-button" onClick={() => setQuery("")}>
              <RefreshCcw size={16} />
              Reset
            </button>
          </div>

          <div className="player-table-wrap">
            <table className="player-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Pos</th>
                  <th>Age</th>
                  <th>Best Role</th>
                  <th>Score</th>
                  <th>Condition</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((player) => {
                  const fit = topFits(player, 1)[0];
                  return (
                    <tr
                      key={player.id}
                      className={player.id === selectedId ? "selected" : ""}
                      onClick={() => setSelectedId(player.id)}
                    >
                      <td>{player.name}</td>
                      <td>{player.position || "-"}</td>
                      <td>{player.age ?? "-"}</td>
                      <td>{fit.roleName}</td>
                      <td>{fit.score}</td>
                      <td>{player.condition ? `${player.condition}%` : "-"}</td>
                      <td>{player.value ?? "-"}</td>
                    </tr>
                  );
                })}
                {filteredPlayers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">No players loaded</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="report-grid">
            <ReportPanel icon={<Target size={18} />} title="Role Fits">
              {report.topRoleFits.slice(0, 5).map(({ player, fits }) => (
                <div className="report-line" key={player.id}>
                  <strong>{player.name}</strong>
                  <span>{fits[0].roleName} · {fits[0].score}/20</span>
                </div>
              ))}
            </ReportPanel>
            <ReportPanel icon={<Dumbbell size={18} />} title="Training">
              {report.training.slice(0, 5).map((item) => (
                <div className="report-line" key={item.player.id}>
                  <strong>{item.player.name}</strong>
                  <span>{item.focus}</span>
                </div>
              ))}
            </ReportPanel>
            <ReportPanel icon={<Users size={18} />} title="Recruitment">
              {report.transferPriorities.slice(0, 5).map((need) => (
                <div className="report-line" key={need.area}>
                  <strong>{need.area}</strong>
                  <span>{need.severity}</span>
                </div>
              ))}
            </ReportPanel>
            <ReportPanel icon={<ClipboardList size={18} />} title="Tactics">
              {report.tacticalNotes.slice(0, 4).map((note) => (
                <p className="note" key={note}>{note}</p>
              ))}
            </ReportPanel>
          </div>
        </section>

        <aside className="chat-panel">
          <div className="panel-title">
            <MessageSquare size={18} />
            <h2>Coach Chat</h2>
          </div>
          <div className="chat-log">
            {messages.map((message) => (
              <div className={`bubble ${message.role}`} key={message.id}>
                {message.content.split("\n").map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ))}
          </div>
          <form
            className="chat-input"
            onSubmit={(event) => {
              event.preventDefault();
              askAssistant();
            }}
          >
            <textarea
              value={contextText}
              onChange={(event) => setContextText(event.target.value)}
              placeholder={selectedPlayer ? `${selectedPlayer.name}에게 물어보기` : "수석코치에게 물어보기"}
            />
            <button className="send-button" title="보내기">
              <Send size={18} />
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReportPanel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="panel report-panel">
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      <div className="report-content">{children}</div>
    </section>
  );
}

function loadBatch(): ImportBatch | undefined {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as ImportBatch;
  } catch {
    return undefined;
  }
}

function filterPlayers(players: Player[], query: string): Player[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return players;
  }

  return players.filter((player) =>
    [player.name, player.position, player.nationality, player.club]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(q))
  );
}
