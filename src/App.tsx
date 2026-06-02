import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  ClipboardCheck,
  Copy,
  Database,
  Dumbbell,
  FileUp,
  Gauge,
  FolderOpen,
  FolderSync,
  MessageSquare,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UserCheck,
  Users
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { answerQuestion, buildCoachReport } from "./analysis/advisor";
import { buildDataQualityReport } from "./analysis/dataQuality";
import { topFits } from "./analysis/scoring";
import { buildSquadBriefing } from "./analysis/squadBriefing";
import { exportTemplateColumns, exportTemplateGroups } from "./data/exportTemplate";
import { sampleExport } from "./data/sampleExport";
import { parseFiles } from "./parsers/fmExport";
import type { BriefingItem, DepthBand } from "./analysis/squadBriefing";
import type { ChatMessage, ImportBatch, Player } from "./types/domain";

const STORAGE_KEY = "fm-coach:batch";
const BRIDGE_POLL_INTERVAL_MS = 5000;

type BridgeStatus = {
  connected: boolean;
  contextDir?: string;
  lastScanAt?: string;
  message?: string;
  playerCount?: number;
  sourceCount?: number;
  squadPlayerCount?: number;
  targetPlayerCount?: number;
  allPlayerCount?: number;
  sources?: string[];
  warnings?: string[];
  watchDir?: string;
};

type BridgeStatusResponse = Omit<BridgeStatus, "connected" | "message"> & {
  ok: boolean;
};

type AppView = "overview" | "prepare" | "squad" | "player" | "reports" | "chat";

type CoachContextWriteResult = {
  ok: true;
  contextDir: string;
  requestJsonPath: string;
  requestMarkdownPath: string;
  responseJsonPath: string;
  generatedAt: string;
};

type CoachContextAnswer = {
  actions?: string[];
  confidence?: string;
  generatedAt?: string;
  sections?: Array<{ heading: string; items: string[] }>;
  summary?: string;
  title?: string;
  verdict?: string;
};

type CoachContextReadResult = {
  ok: boolean;
  responseJsonPath: string;
  answer?: CoachContextAnswer;
  message?: string;
};

type SessionLine = {
  id: string;
  kind: "app" | "codex" | "file" | "system";
  text: string;
};

export default function App() {
  const [batch, setBatch] = useState<ImportBatch | undefined>(() => loadBatch());
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [contextText, setContextText] = useState("");
  const [coachContextStatus, setCoachContextStatus] = useState("Codex 요청 파일을 만들 수 있습니다.");
  const [coachContextResult, setCoachContextResult] = useState<CoachContextWriteResult | undefined>();
  const [coachContextAnswer, setCoachContextAnswer] = useState<CoachContextAnswer | undefined>();
  const [sessionLines, setSessionLines] = useState<SessionLine[]>([
    { id: "session-ready", kind: "system", text: "Codex 세션 대기 중. 앱은 요청 파일을 만들고 응답 파일을 읽습니다." }
  ]);
  const [templateCopied, setTemplateCopied] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ connected: false, message: "Bridge not detected" });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "데이터를 넣으면 선수 역할, 훈련, 전술, 영입 우선순위를 같이 보겠습니다."
    }
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bridgeAutoLoadedRef = useRef(false);

  const players = batch?.players ?? [];
  const report = useMemo(() => buildCoachReport(players), [players]);
  const quality = useMemo(() => buildDataQualityReport(batch), [batch]);
  const briefing = useMemo(() => buildSquadBriefing(players), [players]);
  const selectedPlayer = players.find((player) => player.id === selectedId);
  const selectedFits = selectedPlayer ? topFits(selectedPlayer, 3) : [];
  const filteredPlayers = useMemo(() => filterPlayers(players, query), [players, query]);
  const hasPlayers = players.length > 0;
  const visibleNeeds = hasPlayers ? report.needs : [];
  const visibleTransferPriorities = hasPlayers ? report.transferPriorities : [];
  const visibleTacticalNotes = hasPlayers ? report.tacticalNotes : [];
  const mainNeed = visibleTransferPriorities[0] ?? visibleNeeds[0];
  const lastSource = batch?.sourceNames.at(-1);
  const coachMenu: Array<{ id: AppView; label: string; helper: string; icon: ReactNode }> = [
    { id: "overview", label: "개요", helper: "오늘의 판단", icon: <Sparkles size={18} /> },
    { id: "prepare", label: "데이터 준비", helper: "Export / View", icon: <FolderOpen size={18} /> },
    { id: "squad", label: "선수단", helper: "목록 / 개인 분석", icon: <BarChart3 size={18} /> },
    { id: "reports", label: "리포트", helper: "역할 / 영입", icon: <ClipboardList size={18} /> },
    { id: "chat", label: "코치 대화", helper: "질문하기", icon: <MessageSquare size={18} /> }
  ];

  useEffect(() => {
    if (batch) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(batch));
    }
  }, [batch]);

  useEffect(() => {
    void checkBridge(true);
    const interval = window.setInterval(() => {
      void checkBridge(false);
    }, BRIDGE_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  async function handleFiles(files: FileList | File[]) {
    const nextBatch = await parseFiles([...files]);
    setBatch(nextBatch);
    setSelectedId(nextBatch.players[0]?.id);
    setActiveView("overview");
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

  async function checkBridge(autoLoad: boolean) {
    if (window.fmCoach) {
      try {
        const status = await window.fmCoach.getStatus();
        setBridgeStatus({ ...status, connected: true, message: "Desktop app" });

        if (autoLoad && !bridgeAutoLoadedRef.current && status.playerCount > 0 && !batch) {
          bridgeAutoLoadedRef.current = true;
          await loadBridgeData(false, false);
        }
      } catch {
        setBridgeStatus({ connected: false, message: "Desktop bridge is not ready" });
      }
      return;
    }

    try {
      const status = await fetchJson<BridgeStatusResponse>("/api/status");
      setBridgeStatus({ ...status, connected: true });

      if (autoLoad && !bridgeAutoLoadedRef.current && status.playerCount && status.playerCount > 0 && !batch) {
        bridgeAutoLoadedRef.current = true;
        await loadBridgeData(false, false);
      }
    } catch {
      setBridgeStatus({ connected: false, message: "Bridge server is not running" });
    }
  }

  async function loadBridgeData(announce = true, rescan = true) {
    if (window.fmCoach) {
      if (rescan) {
        const status = await window.fmCoach.rescan();
        setBridgeStatus({ ...status, connected: true, message: "Desktop app" });
      }

      const nextBatch = await window.fmCoach.getBatch();
      setBatch(nextBatch);
      setSelectedId((current) => current ?? nextBatch.players[0]?.id);
      setActiveView("overview");

      if (announce) {
        setMessages((items) => [
          ...items,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Export 폴더에서 ${nextBatch.players.length}명의 선수를 동기화했습니다. FM에서 새로 export하면 Sync Folder를 누르면 됩니다.`
          }
        ]);
      }
      return;
    }

    if (rescan) {
      await fetch("/api/rescan", { method: "POST" }).catch(() => undefined);
    }

    const nextBatch = await fetchJson<ImportBatch>("/api/batch");
    setBatch(nextBatch);
    setSelectedId((current) => current ?? nextBatch.players[0]?.id);
    setActiveView("overview");
    await checkBridge(false);

    if (announce) {
      setMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Export Bridge에서 ${nextBatch.players.length}명의 선수를 동기화했습니다. FM에서 새로 export하면 다시 Sync를 누르거나 잠시 뒤 갱신할 수 있어요.`
        }
      ]);
    }
  }

  async function chooseExportFolder() {
    if (!window.fmCoach) {
      return;
    }

    const status = await window.fmCoach.chooseExportFolder();
    setBridgeStatus({ ...status, connected: true, message: "Desktop app" });
    await loadBridgeData(true, false);
  }

  function clearData() {
    localStorage.removeItem(STORAGE_KEY);
    setBatch(undefined);
    setSelectedId(undefined);
    setContextText("");
    setActiveView("prepare");
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
    setActiveView("chat");
  }

  async function createCoachContextRequest() {
    const question = contextText.trim() || defaultCoachContextQuestion(selectedPlayer);
    const request = {
      mode: "scout" as const,
      question,
      selectedPlayerId: selectedId
    };

    try {
      const result = window.fmCoach
        ? await window.fmCoach.createCoachContext(request)
        : await fetchJson<CoachContextWriteResult>("/api/coach-context/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request)
        });

      setCoachContextResult(result);
      setCoachContextAnswer(undefined);
      setCoachContextStatus("요청 파일을 만들었습니다. Codex가 latest-request.md를 읽고 latest-response.json을 쓰면 됩니다.");
      appendSessionLines([
        { kind: "app", text: `request 생성: ${shortPath(result.requestMarkdownPath)}` },
        { kind: "file", text: `Codex 입력 JSON: ${shortPath(result.requestJsonPath)}` },
        { kind: "file", text: `Codex 응답 대상: ${shortPath(result.responseJsonPath)}` }
      ]);
      setContextText("");
    } catch {
      setCoachContextStatus("요청 파일 생성 실패: Desktop 앱이나 Bridge 서버 연결이 필요합니다.");
      appendSessionLines([{ kind: "system", text: "요청 파일 생성 실패. Desktop 앱 또는 Bridge 서버 연결을 확인하세요." }]);
    }
  }

  async function writeDummyResponse() {
    try {
      const result = window.fmCoach
        ? await window.fmCoach.writeDummyCoachResponse()
        : await fetchJson<CoachContextReadResult>("/api/coach-context/dummy-response", { method: "POST" });

      const answer = result.answer as CoachContextAnswer | undefined;
      if (result.ok && answer) {
        setCoachContextAnswer(answer);
        setCoachContextStatus("더미 Codex 응답을 생성하고 앱에 반영했습니다.");
        appendSessionLines([
          { kind: "codex", text: "dummy response 작성 완료" },
          { kind: "file", text: `응답 파일: ${shortPath(result.responseJsonPath)}` }
        ]);
        return;
      }

      setCoachContextStatus(result.message ?? "더미 응답 생성에 실패했습니다.");
      appendSessionLines([{ kind: "system", text: result.message ?? "더미 응답 생성 실패" }]);
    } catch {
      setCoachContextStatus("더미 응답 생성 실패: Desktop 앱이나 Bridge 서버 연결이 필요합니다.");
      appendSessionLines([{ kind: "system", text: "더미 응답 생성 실패. Desktop 앱 또는 Bridge 서버 연결을 확인하세요." }]);
    }
  }

  async function loadCoachContextResponse() {
    try {
      const result = window.fmCoach
        ? await window.fmCoach.readCoachResponse()
        : await fetchJson<CoachContextReadResult>("/api/coach-context/response");

      const answer = result.answer as CoachContextAnswer | undefined;
      if (result.ok && answer) {
        setCoachContextAnswer(answer);
        setCoachContextStatus("Codex 응답을 앱에 반영했습니다.");
        appendSessionLines([
          { kind: "app", text: "latest-response.json 읽기 완료" },
          { kind: "codex", text: answer.summary ?? answer.title ?? "응답이 앱에 반영되었습니다." }
        ]);
        return;
      }

      setCoachContextStatus(result.message ?? "Codex 응답 파일을 아직 찾지 못했습니다.");
      appendSessionLines([{ kind: "system", text: result.message ?? "Codex 응답 파일 대기 중" }]);
    } catch {
      setCoachContextStatus("응답 읽기 실패: Desktop 앱이나 Bridge 서버 연결이 필요합니다.");
      appendSessionLines([{ kind: "system", text: "응답 읽기 실패. Desktop 앱 또는 Bridge 서버 연결을 확인하세요." }]);
    }
  }

  function appendSessionLines(lines: Array<Omit<SessionLine, "id">>) {
    setSessionLines((items) => [
      ...items,
      ...lines.map((line) => ({ ...line, id: crypto.randomUUID() }))
    ].slice(-12));
  }

  function copyTemplateColumns() {
    const text = exportTemplateColumns.join("\t");
    setTemplateCopied(true);
    window.setTimeout(() => setTemplateCopied(false), 1500);

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => copyTextFallback(text));
      return;
    }

    copyTextFallback(text);
  }

  function isMenuItemActive(id: AppView) {
    if (id === "squad") {
      return activeView === "squad" || activeView === "player";
    }

    return activeView === id;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <UserCheck size={24} />
          </div>
          <div>
            <p className="eyebrow">FM24 Local Assistant</p>
            <h1>수석코치 데스크</h1>
          </div>
        </div>
        <div className="header-actions">
          <StatusPill
            connected={bridgeStatus.connected}
            label={bridgeStatus.connected ? (window.fmCoach ? "Desktop 연결됨" : "Bridge 연결됨") : "수동 import"}
          />
          <button className="icon-button" title="샘플 데이터 불러오기" onClick={loadSample}>
            <Database size={18} />
          </button>
          <button className="icon-button" title="데이터 비우기" onClick={clearData}>
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <main className="coach-desk">
        <div className="coach-shell">
          <aside className="app-menu" aria-label="주 메뉴">
            <span className="menu-kicker">메뉴</span>
            {coachMenu.map((item) => (
              <button
                className={`menu-button ${isMenuItemActive(item.id) ? "active" : ""}`}
                key={item.id}
                onClick={() => setActiveView(item.id)}
              >
                <span className="menu-icon">{item.icon}</span>
                <span className="menu-copy">
                  <strong>{item.label}</strong>
                  <small>{item.helper}</small>
                </span>
              </button>
            ))}
          </aside>

          <section className="content-area">
            <section className="summary-grid quick-info-grid" aria-label="빠른 정보">
              <Metric
                icon={<Users size={18} />}
                label="선수단"
                value={players.length}
                helper={hasPlayers ? `${report.bestXi.length}명 Best XI 후보` : "데이터 대기"}
              />
              <Metric icon={<Gauge size={18} />} label="품질" value={quality.score} helper={qualityStatusLabel(quality.status)} />
              <Metric icon={<ShieldCheck size={18} />} label="준비도" value={briefing.readiness} helper={briefing.headline} />
              <Metric icon={<Target size={18} />} label="보강" value={visibleNeeds.length} helper={mainNeed?.area ?? "대기 중"} />
            </section>

            {activeView === "prepare" && (
              <section className="command-center">
                <div className="command-copy">
                  <div className="panel-title compact">
                    <FolderOpen size={18} />
                    <h2>데이터 가져오기</h2>
                  </div>
                  <strong>{hasPlayers ? `${players.length}명의 선수단 데이터가 준비됐습니다` : "FM24 export를 기다리고 있습니다"}</strong>
                  <span>
                    {hasPlayers
                      ? lastSource ?? "로컬에 저장된 선수단 데이터를 사용 중입니다"
                      : "HTML, TXT, CSV export 또는 지정한 export 폴더를 사용할 수 있습니다"}
                  </span>
                </div>
                <div className="command-actions">
                  <button className="primary-button" onClick={() => fileInputRef.current?.click()}>
                    <FileUp size={18} />
                    파일 선택
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
                  {window.fmCoach && (
                    <button className="secondary-button" onClick={() => void chooseExportFolder()}>
                      <FolderOpen size={18} />
                      폴더 선택
                    </button>
                  )}
                  <button className="secondary-button" disabled={!bridgeStatus.connected} onClick={() => void loadBridgeData()}>
                    <FolderSync size={18} />
                    동기화
                  </button>
                </div>
                <div className={`bridge-strip ${bridgeStatus.connected ? "connected" : "offline"}`}>
                  <span>
                    <FolderSync size={16} />
                    {bridgeStatus.connected ? `${bridgeStatus.sourceCount ?? 0}개 파일` : bridgeStatusLabel(bridgeStatus.message)}
                  </span>
                  <span>{bridgeStatus.squadPlayerCount ?? bridgeStatus.playerCount ?? players.length}명 선수단</span>
                  <span>{bridgeStatus.targetPlayerCount ?? 0}명 영입 후보</span>
                  {bridgeStatus.watchDir && <span className="bridge-path">{bridgeStatus.watchDir}</span>}
                </div>

                <div className="prep-guide">
                  <div className="prep-head">
                    <div className="panel-title compact">
                      <ClipboardList size={18} />
                      <h2>FM View 준비</h2>
                    </div>
                    <button className="mini-action-button" onClick={copyTemplateColumns}>
                      {templateCopied ? <ClipboardCheck size={16} /> : <Copy size={16} />}
                      {templateCopied ? "복사됨" : "분석 컬럼 복사"}
                    </button>
                  </div>
                  <div className="prep-steps">
                    <span><strong>1</strong> 선수단 View</span>
                    <span><strong>2</strong> 능력치 포함</span>
                    <span><strong>3</strong> HTML/TXT/CSV export</span>
                  </div>
                  <div className="ability-template-row">
                    {exportTemplateGroups.map((group) => (
                      <div className="ability-template-card" key={group.id}>
                        <div className="template-group-head">
                          <strong>{group.label}</strong>
                          <span>{group.columns.length}개</span>
                        </div>
                        <div className="template-chip-list">
                          {group.columns.slice(0, 5).map((column) => (
                            <span key={column}>{column}</span>
                          ))}
                          {group.columns.length > 5 && <span>+{group.columns.length - 5}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeView === "overview" && (
              <div className="view-stack">
            <section className="panel briefing-panel">
              <div className="section-head">
                <div>
                  <div className="panel-title compact">
                    <Sparkles size={18} />
                    <h2>오늘의 브리핑</h2>
                  </div>
                  <p>{briefing.summary}</p>
                </div>
                <div className="readiness-ring">
                  <strong>{briefing.readiness}</strong>
                  <span>준비도</span>
                </div>
              </div>

              <div className="briefing-layout">
                <div className="briefing-lead">
                  <strong>{briefing.headline}</strong>
                  <div className="next-action-list">
                    {briefing.nextActions.map((item) => (
                      <BriefingAction item={item} key={`${item.title}-${item.detail}`} />
                    ))}
                  </div>
                </div>

                <div className="depth-board" aria-label="포지션 뎁스">
                  {briefing.depth.map((band) => (
                    <DepthCard band={band} key={band.id} />
                  ))}
                </div>

                <div className="key-player-list">
                  <span className="mini-heading">핵심 선수</span>
                  {briefing.keyPlayers.slice(0, 4).map(({ player, fit }) => (
                    <button
                      className="key-player"
                      key={player.id}
                      onClick={() => {
                        setSelectedId(player.id);
                        setActiveView("player");
                      }}
                    >
                      <span>{player.name}</span>
                      <strong>{fit.score}</strong>
                    </button>
                  ))}
                  {briefing.keyPlayers.length === 0 && <p className="muted">핵심 선수 분석 대기 중</p>}
                </div>
              </div>
            </section>
              </div>
            )}

            {activeView === "squad" && (
            <section className="panel squad-board">
              <div className="section-head">
                <div>
                  <div className="panel-title compact">
                    <BarChart3 size={18} />
                    <h2>선수단 보드</h2>
                  </div>
                  <p>{hasPlayers ? `${filteredPlayers.length}명을 보고 있습니다` : "선수단 데이터를 불러오면 표가 채워집니다"}</p>
                </div>
                <div className="toolbar">
                  <div className="search-field">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="선수, 포지션, 국적 검색"
                    />
                  </div>
                  <button className="icon-button" title="검색 초기화" onClick={() => setQuery("")}>
                    <RefreshCcw size={16} />
                  </button>
                </div>
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
                        >
                          <td>
                            <button
                              className="player-name-link"
                              onClick={() => {
                                setSelectedId(player.id);
                                setActiveView("player");
                              }}
                            >
                              {player.name}
                            </button>
                            <span>{player.club ?? player.nationality ?? ""}</span>
                          </td>
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
                        <td colSpan={7} className="empty-cell">
                          <div className="empty-state">
                            <Upload size={24} />
                            <strong>선수단 데이터가 없습니다</strong>
                            <button className="secondary-button" onClick={loadSample}>
                              <Database size={18} />
                              샘플 보기
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            )}

            {activeView === "reports" && (
              <div className="reports-view">
                <section className="panel quality-panel">
                  <div className="section-head simple">
                    <div className="panel-title compact">
                      <Gauge size={18} />
                      <h2>데이터 품질</h2>
                    </div>
                    {quality.status === "good" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  </div>
                  <div className={`quality-score ${quality.status}`}>
                    <strong>{quality.score}</strong>
                    <span>{qualityStatusLabel(quality.status)}</span>
                  </div>
                  <div className="quality-meter" aria-hidden="true">
                    <span style={{ width: `${quality.score}%` }} />
                  </div>
                  <p className="quality-note">
                    {quality.playerCount}명 · 평균 능력치 {quality.averageAttributesPerPlayer}개
                  </p>
                  <div className="quality-list">
                    {[...quality.warnings, ...quality.recommendations].slice(0, 4).map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                    {batch?.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                    {bridgeStatus.warnings?.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                </section>

            <div className="report-grid">
              <ReportPanel icon={<Target size={18} />} title="역할 적합도">
                {report.topRoleFits.slice(0, 5).map(({ player, fits }) => (
                  <div className="report-line" key={player.id}>
                    <strong>{player.name}</strong>
                    <span>{fits[0].roleName} · {fits[0].score}/20</span>
                  </div>
                ))}
                {report.topRoleFits.length === 0 && <p className="muted">역할 분석 대기 중</p>}
              </ReportPanel>
              <ReportPanel icon={<Dumbbell size={18} />} title="훈련 포커스">
                {report.training.slice(0, 5).map((item) => (
                  <div className="report-line" key={item.player.id}>
                    <strong>{item.player.name}</strong>
                    <span>{item.focus}</span>
                  </div>
                ))}
                {report.training.length === 0 && <p className="muted">훈련 제안 대기 중</p>}
              </ReportPanel>
              <ReportPanel icon={<Users size={18} />} title="보강 우선순위">
                {visibleTransferPriorities.slice(0, 5).map((need) => (
                  <div className="report-line" key={need.area}>
                    <strong>{need.area}</strong>
                    <span>{need.severity} · {need.reason}</span>
                  </div>
                ))}
                {visibleTransferPriorities.length === 0 && <p className="muted">보강 진단 대기 중</p>}
              </ReportPanel>
              <ReportPanel icon={<ClipboardList size={18} />} title="전술 메모">
                {visibleTacticalNotes.slice(0, 4).map((note) => (
                  <p className="note" key={note}>{note}</p>
                ))}
                {visibleTacticalNotes.length === 0 && <p className="muted">전술 메모 대기 중</p>}
              </ReportPanel>
            </div>
              </div>
            )}

            {activeView === "player" && (
            <section className="panel player-focus player-detail">
              <div className="section-head simple">
                <div className="panel-title">
                  <Activity size={18} />
                  <h2>선수 분석</h2>
                </div>
                <button className="secondary-button" onClick={() => setActiveView("squad")}>
                  <ArrowLeft size={16} />
                  선수단
                </button>
              </div>
              {selectedPlayer ? (
                <div className="player-card">
                  <h3>{selectedPlayer.name}</h3>
                  <p>{selectedPlayer.position || "포지션 미상"} · {selectedPlayer.age ? `${selectedPlayer.age}세` : "나이 미상"}</p>
                  <div className="mini-grid player-profile-grid">
                    <span>키/체중 <strong>{[selectedPlayer.height, selectedPlayer.weight].filter(Boolean).join(" / ") || "-"}</strong></span>
                    <span>주발 <strong>{selectedPlayer.preferredFoot ?? "-"}</strong></span>
                    <span>성격 <strong>{selectedPlayer.personality ?? "-"}</strong></span>
                    <span>미디어 <strong>{selectedPlayer.mediaHandling ?? "-"}</strong></span>
                    <span>컨디션 <strong>{selectedPlayer.condition ? `${selectedPlayer.condition}%` : "-"}</strong></span>
                    <span>평점 <strong>{selectedPlayer.averageRating ?? "-"}</strong></span>
                  </div>
                  {selectedPlayer.preferredMoves && selectedPlayer.preferredMoves.length > 0 && (
                    <div className="trait-panel">
                      <strong>선호 플레이</strong>
                      <div className="template-chip-list">
                        {selectedPlayer.preferredMoves.map((move) => (
                          <span key={move}>{move}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedPlayer.hiddenAttributes && Object.keys(selectedPlayer.hiddenAttributes).length > 0 && (
                    <div className="trait-panel">
                      <strong>히든/성향</strong>
                      <div className="template-chip-list">
                        {Object.entries(selectedPlayer.hiddenAttributes).map(([key, value]) => (
                          <span key={key}>{hiddenAttributeLabel(key)} {value}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="fit-list">
                    {selectedFits.map((fit) => (
                      <div className="fit-row" key={fit.roleId}>
                        <span>{fit.roleName}</span>
                        <strong>{fit.score}/20</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-state player-empty">
                  <Users size={24} />
                  <strong>선수단에서 이름을 클릭해 주세요</strong>
                  <button className="secondary-button" onClick={() => setActiveView("squad")}>
                    선수단 보기
                  </button>
                </div>
              )}
              <div className="quick-actions-head">
                <strong>빠른 질문</strong>
                <span>{selectedPlayer ? `${selectedPlayer.name} 기준 질문` : "선수를 선택하면 개인 질문이 활성화됩니다."}</span>
              </div>
              <div className="quick-actions">
                <button title="선택 선수의 훈련 포커스를 묻습니다" disabled={!selectedPlayer} onClick={() => askAssistant("이 선수 훈련 뭐가 좋아?")}>훈련 조언</button>
                <button title="선택 선수의 역할 적합도를 묻습니다" disabled={!selectedPlayer} onClick={() => askAssistant("이 선수 역할은?")}>역할 분석</button>
                <button title="현재 선수단의 보강 우선순위를 묻습니다" disabled={!hasPlayers} onClick={() => askAssistant("보강 우선순위는?")}>보강 우선</button>
              </div>
            </section>
            )}

            {activeView === "chat" && (
            <section className="panel chat-panel chat-view">
              <div className="panel-title compact">
                <MessageSquare size={18} />
                <h2>코치 대화</h2>
              </div>
              <div className="codex-handoff">
                <div className="handoff-copy">
                  <strong>Codex 연동</strong>
                  <span>{coachContextStatus}</span>
                </div>
                <div className="handoff-actions">
                  <button className="secondary-button" disabled={!bridgeStatus.connected} onClick={() => void createCoachContextRequest()}>
                    <FileUp size={16} />
                    Codex 요청 생성
                  </button>
                  <button className="secondary-button" disabled={!bridgeStatus.connected || !coachContextResult} onClick={() => void writeDummyResponse()}>
                    <Sparkles size={16} />
                    더미 응답
                  </button>
                  <button className="secondary-button" disabled={!bridgeStatus.connected} onClick={() => void loadCoachContextResponse()}>
                    <RefreshCcw size={16} />
                    응답 불러오기
                  </button>
                </div>
                <div className="session-console" aria-label="Codex 세션 콘솔">
                  <div className="console-top">
                    <strong>codex session</strong>
                    <span>{bridgeStatus.connected ? "file handoff ready" : "waiting for bridge"}</span>
                  </div>
                  <div className="console-lines">
                    {sessionLines.map((line) => (
                      <div className={`console-line ${line.kind}`} key={line.id}>
                        <span>{consolePrompt(line.kind)}</span>
                        <p>{line.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {coachContextResult && (
                  <div className="handoff-result">
                    <span>요청: {coachContextResult.requestMarkdownPath}</span>
                    <span>응답: {coachContextResult.responseJsonPath}</span>
                  </div>
                )}
                {coachContextAnswer && (
                  <div className="codex-answer">
                    <div className="codex-answer-head">
                      <strong>{coachContextAnswer.title ?? "Codex 분석"}</strong>
                      <span>{[coachContextAnswer.verdict, coachContextAnswer.confidence].filter(Boolean).join(" · ")}</span>
                    </div>
                    {coachContextAnswer.summary && <p>{coachContextAnswer.summary}</p>}
                    {coachContextAnswer.sections?.map((section) => (
                      <div className="codex-answer-section" key={section.heading}>
                        <strong>{section.heading}</strong>
                        {section.items.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                    ))}
                    {coachContextAnswer.actions && coachContextAnswer.actions.length > 0 && (
                      <div className="codex-answer-section">
                        <strong>다음 행동</strong>
                        {coachContextAnswer.actions.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
            </section>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Metric({ icon, label, value, helper }: { icon: ReactNode; label: string; value: number; helper: string }) {
  return (
    <div className="metric">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
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

function DepthCard({ band }: { band: DepthBand }) {
  const ratio = band.minimum > 0 ? Math.min(band.count / band.minimum, 1) : 0;

  return (
    <div className={`depth-card ${band.status}`}>
      <div className="depth-top">
        <strong>{band.label}</strong>
        <span>{band.count}/{band.minimum}</span>
      </div>
      <div className="depth-meter" aria-hidden="true">
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      <small>{depthStatusLabel(band.status)}</small>
    </div>
  );
}

function BriefingAction({ item }: { item: BriefingItem }) {
  return (
    <div className={`briefing-action ${item.severity}`}>
      <span>{item.title}</span>
      <p>{item.detail}</p>
    </div>
  );
}

function StatusPill({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span className={`status-pill ${connected ? "connected" : "offline"}`}>
      {connected ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
      {label}
    </span>
  );
}

function hiddenAttributeLabel(key: string): string {
  const labels: Record<string, string> = {
    adaptability: "적응력",
    ambition: "야망",
    consistency: "꾸준함",
    controversy: "논쟁성",
    dirtiness: "반칙성",
    importantMatches: "중요 경기",
    injuryProneness: "부상 빈도",
    loyalty: "충성심",
    pressure: "압박감",
    professionalism: "프로의식",
    sportsmanship: "스포츠맨십",
    temperament: "참을성",
    versatility: "다재다능"
  };

  return labels[key] ?? key;
}

function depthStatusLabel(status: DepthBand["status"]): string {
  if (status === "deep") {
    return "충분";
  }
  if (status === "ok") {
    return "적정";
  }
  if (status === "thin") {
    return "얇음";
  }
  return "비어 있음";
}

function qualityStatusLabel(status: ReturnType<typeof buildDataQualityReport>["status"]): string {
  if (status === "good") {
    return "좋음";
  }
  if (status === "partial") {
    return "보정 필요";
  }
  if (status === "poor") {
    return "낮음";
  }
  return "대기";
}

function bridgeStatusLabel(message?: string): string {
  if (!message) {
    return "Bridge 연결 대기";
  }
  if (message.includes("not running")) {
    return "Bridge 미실행";
  }
  if (message.includes("not detected")) {
    return "Bridge 감지 안 됨";
  }
  return message;
}

function defaultCoachContextQuestion(selectedPlayer: Player | undefined): string {
  if (selectedPlayer) {
    return `${selectedPlayer.name}을 현재 스쿼드에서 어떤 역할로 쓰는 게 좋은지, 어떤 동료 역할이 보조해야 하는지 분석해 주세요.`;
  }

  return "현재 스쿼드와 영입 후보 데이터 기준으로 전술/역할 구조와 다음 영입 우선순위를 분석해 주세요.";
}

function consolePrompt(kind: SessionLine["kind"]): string {
  if (kind === "codex") return "codex";
  if (kind === "file") return "file";
  if (kind === "app") return "app";
  return "sys";
}

function shortPath(path: string): string {
  const marker = "coach-context/";
  const index = path.lastIndexOf(marker);
  return index >= 0 ? path.slice(index) : path;
}

function copyTextFallback(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
