import { useState, useEffect, useRef } from "react";

const SUGGESTED_TOPICS = [
  "COLREGs Rule 16 — give-way vessel obligations",
  "Ontario inland waterway regulations",
  "Sail trim basics — points of sail",
  "Canadian Pleasure Craft Operator Card requirements",
  "Weather routing and routing software",
  "Chart datum and tidal calculations",
  "VHF radio procedures — DSC & distress calls",
  "Anchoring regulations in Canadian waters",
  "Racing rules of sailing (RRS 2021–2024)",
  "Keel design and stability curves",
];

const SYSTEM_PROMPT = `You are an expert sailing instructor, navigator, and marine regulations specialist with deep knowledge of:
- International maritime regulations (COLREGs, SOLAS, STCW)
- Canadian Transport Canada boating regulations
- Great Lakes and Ontario inland waterway rules
- Practical seamanship, navigation, and sail trim
- Weather routing, tides, and passage planning
- Racing rules (RRS), cruising, and offshore sailing

The user is Janek, a mechanical engineer based in Toronto who sails recreationally. He values precise, well-sourced, technical answers. 

When answering:
1. Be precise and technical — Janek has strong analytical skills
2. Always cite specific regulation numbers, rule references, or authoritative sources (Transport Canada, TC TP documents, COLREGs articles, etc.)
3. Highlight safety-critical information clearly
4. When relevant, mention Ontario/Great Lakes specific rules vs. international standards
5. End responses with 2–3 "Related topics to explore" suggestions
6. Format with clear headers and structure when explaining complex topics`;

export default function SailingHub() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadSessions() {
    try {
      const result = await window.storage.list("session:");
      const loaded = [];
      for (const key of result.keys) {
        try {
          const r = await window.storage.get(key);
          if (r) loaded.push(JSON.parse(r.value));
        } catch {}
      }
      loaded.sort((a, b) => b.updatedAt - a.updatedAt);
      setSessions(loaded);
      setStorageReady(true);
    } catch {
      setStorageReady(true);
    }
  }

  async function newSession() {
    const id = `session:${Date.now()}`;
    const session = {
      id,
      title: "New Session",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      tags: [],
    };
    try {
      await window.storage.set(id, JSON.stringify(session));
    } catch {}
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(id);
    setMessages([]);
  }

  async function selectSession(session) {
    setActiveSessionId(session.id);
    setMessages(session.messages || []);
  }

  async function deleteSession(id, e) {
    e.stopPropagation();
    try {
      await window.storage.delete(id);
    } catch {}
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  }

  async function sendMessage(text) {
    if (!text.trim() || loading) return;
    if (!activeSessionId) await newSession();

    const userMsg = { role: "user", content: text, timestamp: Date.now() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
        }),
      });

      const data = await response.json();
      const assistantContent =
        data.content?.find((b) => b.type === "text")?.text ||
        "No response received.";

      const assistantMsg = {
        role: "assistant",
        content: assistantContent,
        timestamp: Date.now(),
      };
      const finalMessages = [...updatedMessages, assistantMsg];
      setMessages(finalMessages);

      // Auto-generate title from first exchange
      const title =
        sessions.find((s) => s.id === activeSessionId)?.title === "New Session"
          ? text.slice(0, 50) + (text.length > 50 ? "…" : "")
          : sessions.find((s) => s.id === activeSessionId)?.title;

      const updatedSession = {
        id: activeSessionId,
        title,
        createdAt:
          sessions.find((s) => s.id === activeSessionId)?.createdAt ||
          Date.now(),
        updatedAt: Date.now(),
        messages: finalMessages,
        tags: extractTags(text + " " + assistantContent),
      };

      try {
        await window.storage.set(
          activeSessionId,
          JSON.stringify(updatedSession)
        );
      } catch {}
      setSessions((prev) =>
        [updatedSession, ...prev.filter((s) => s.id !== activeSessionId)].sort(
          (a, b) => b.updatedAt - a.updatedAt
        )
      );
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err.message}`,
          timestamp: Date.now(),
          error: true,
        },
      ]);
    }
    setLoading(false);
  }

  function extractTags(text) {
    const keywords = [
      "COLREGs",
      "anchoring",
      "racing",
      "weather",
      "VHF",
      "navigation",
      "tides",
      "safety",
      "regulations",
      "Canada",
      "Great Lakes",
      "sail trim",
      "passage",
    ];
    return keywords.filter((k) =>
      text.toLowerCase().includes(k.toLowerCase())
    );
  }

  const filteredSessions = sessions.filter(
    (s) =>
      !searchQuery ||
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderMessage(msg) {
    const lines = msg.content.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("## "))
        return (
          <h3 key={i} style={styles.h3}>
            {line.replace("## ", "")}
          </h3>
        );
      if (line.startsWith("### "))
        return (
          <h4 key={i} style={styles.h4}>
            {line.replace("### ", "")}
          </h4>
        );
      if (line.startsWith("**") && line.endsWith("**"))
        return (
          <strong key={i} style={styles.bold}>
            {line.replace(/\*\*/g, "")}
          </strong>
        );
      if (line.startsWith("- ") || line.startsWith("• "))
        return (
          <li key={i} style={styles.li}>
            {line.replace(/^[-•] /, "")}
          </li>
        );
      if (line.match(/^\d+\. /))
        return (
          <li key={i} style={{ ...styles.li, listStyleType: "decimal" }}>
            {line.replace(/^\d+\. /, "")}
          </li>
        );
      if (line.trim() === "") return <br key={i} />;
      return (
        <p key={i} style={styles.p}>
          {line}
        </p>
      );
    });
  }

  const styles = {
    app: {
      display: "flex",
      height: "100vh",
      background: "#0a1628",
      color: "#e8edf5",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      overflow: "hidden",
    },
    sidebar: {
      width: sidebarOpen ? 280 : 0,
      minWidth: sidebarOpen ? 280 : 0,
      background: "#0d1f3c",
      borderRight: "1px solid #1e3a5f",
      display: "flex",
      flexDirection: "column",
      transition: "all 0.3s ease",
      overflow: "hidden",
    },
    sidebarHeader: {
      padding: "20px 16px 12px",
      borderBottom: "1px solid #1e3a5f",
    },
    logo: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 14,
    },
    logoIcon: {
      fontSize: 22,
    },
    logoText: {
      fontSize: 15,
      fontWeight: "bold",
      color: "#7eb8f7",
      letterSpacing: "0.5px",
    },
    newBtn: {
      width: "100%",
      padding: "9px 14px",
      background: "linear-gradient(135deg, #1a4a8a, #0f3060)",
      border: "1px solid #2e5a9c",
      borderRadius: 8,
      color: "#7eb8f7",
      cursor: "pointer",
      fontSize: 13,
      fontFamily: "inherit",
      letterSpacing: "0.3px",
    },
    searchBox: {
      padding: "10px 16px",
      borderBottom: "1px solid #1e3a5f",
    },
    searchInput: {
      width: "100%",
      padding: "7px 10px",
      background: "#0a1628",
      border: "1px solid #1e3a5f",
      borderRadius: 6,
      color: "#e8edf5",
      fontSize: 12,
      fontFamily: "inherit",
      boxSizing: "border-box",
    },
    sessionList: {
      flex: 1,
      overflowY: "auto",
      padding: "8px",
    },
    sessionItem: (active) => ({
      padding: "10px 12px",
      marginBottom: 4,
      borderRadius: 8,
      cursor: "pointer",
      background: active ? "#1a3a6a" : "transparent",
      border: active ? "1px solid #2e5a9c" : "1px solid transparent",
      transition: "all 0.15s",
      position: "relative",
    }),
    sessionTitle: {
      fontSize: 12,
      color: "#c5d8f0",
      marginBottom: 3,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      paddingRight: 20,
    },
    sessionMeta: {
      fontSize: 10,
      color: "#4a6a8a",
    },
    sessionTags: {
      display: "flex",
      flexWrap: "wrap",
      gap: 3,
      marginTop: 4,
    },
    tag: {
      fontSize: 9,
      padding: "1px 5px",
      background: "#0f2a4a",
      border: "1px solid #1e3a5f",
      borderRadius: 3,
      color: "#4a8aaa",
    },
    deleteBtn: {
      position: "absolute",
      right: 8,
      top: 8,
      background: "none",
      border: "none",
      color: "#4a6a8a",
      cursor: "pointer",
      fontSize: 12,
      padding: 2,
    },
    main: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    },
    topBar: {
      padding: "14px 20px",
      borderBottom: "1px solid #1e3a5f",
      display: "flex",
      alignItems: "center",
      gap: 14,
      background: "#0d1f3c",
    },
    toggleBtn: {
      background: "none",
      border: "1px solid #1e3a5f",
      borderRadius: 6,
      color: "#7eb8f7",
      cursor: "pointer",
      padding: "5px 9px",
      fontSize: 14,
    },
    topTitle: {
      fontSize: 14,
      color: "#7eb8f7",
      fontStyle: "italic",
    },
    msgCount: {
      marginLeft: "auto",
      fontSize: 11,
      color: "#4a6a8a",
    },
    chatArea: {
      flex: 1,
      overflowY: "auto",
      padding: "20px 24px",
    },
    welcome: {
      textAlign: "center",
      padding: "40px 20px",
    },
    welcomeIcon: {
      fontSize: 48,
      marginBottom: 16,
    },
    welcomeTitle: {
      fontSize: 24,
      color: "#7eb8f7",
      marginBottom: 8,
      fontStyle: "italic",
    },
    welcomeSub: {
      fontSize: 13,
      color: "#4a6a8a",
      marginBottom: 28,
      lineHeight: 1.6,
    },
    topicsGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: 8,
      maxWidth: 700,
      margin: "0 auto",
    },
    topicBtn: {
      padding: "10px 14px",
      background: "#0d1f3c",
      border: "1px solid #1e3a5f",
      borderRadius: 8,
      color: "#8ab4d4",
      cursor: "pointer",
      fontSize: 12,
      textAlign: "left",
      fontFamily: "inherit",
      lineHeight: 1.4,
      transition: "all 0.15s",
    },
    bubble: (role) => ({
      marginBottom: 18,
      display: "flex",
      justifyContent: role === "user" ? "flex-end" : "flex-start",
    }),
    bubbleInner: (role) => ({
      maxWidth: "78%",
      padding: "12px 16px",
      borderRadius: role === "user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
      background:
        role === "user"
          ? "linear-gradient(135deg, #1a4a8a, #0f3060)"
          : "#0f2035",
      border:
        role === "user" ? "1px solid #2e5a9c" : "1px solid #1e3a5f",
      fontSize: 13,
      lineHeight: 1.65,
      color: role === "user" ? "#c5d8f0" : "#d0dcea",
    }),
    timestamp: {
      fontSize: 10,
      color: "#2a4a6a",
      marginTop: 5,
      textAlign: "right",
    },
    inputRow: {
      padding: "14px 20px",
      borderTop: "1px solid #1e3a5f",
      background: "#0d1f3c",
      display: "flex",
      gap: 10,
      alignItems: "flex-end",
    },
    textarea: {
      flex: 1,
      padding: "10px 14px",
      background: "#0a1628",
      border: "1px solid #1e3a5f",
      borderRadius: 10,
      color: "#e8edf5",
      fontSize: 13,
      fontFamily: "inherit",
      resize: "none",
      lineHeight: 1.5,
      minHeight: 42,
      maxHeight: 120,
    },
    sendBtn: {
      padding: "10px 20px",
      background: loading
        ? "#0f2035"
        : "linear-gradient(135deg, #1a5aaa, #0f3a7a)",
      border: "1px solid #2e5a9c",
      borderRadius: 10,
      color: loading ? "#4a6a8a" : "#7eb8f7",
      cursor: loading ? "not-allowed" : "pointer",
      fontSize: 13,
      fontFamily: "inherit",
      letterSpacing: "0.3px",
    },
    h3: {
      fontSize: 14,
      color: "#7eb8f7",
      margin: "10px 0 5px",
      borderBottom: "1px solid #1e3a5f",
      paddingBottom: 4,
    },
    h4: {
      fontSize: 13,
      color: "#5a9acd",
      margin: "8px 0 4px",
    },
    bold: {
      color: "#a0c8e8",
      display: "block",
      marginBottom: 3,
    },
    li: {
      marginLeft: 18,
      marginBottom: 3,
      listStyleType: "disc",
      fontSize: 13,
    },
    p: { margin: "3px 0", fontSize: 13 },
    loadingDots: {
      display: "flex",
      gap: 5,
      padding: "10px 0",
    },
    dot: (i) => ({
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: "#2e5a9c",
      animation: `bounce 1.2s ${i * 0.2}s infinite`,
    }),
  };

  return (
    <div style={styles.app}>
      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0a1628}
        ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:2px}
        textarea:focus,input:focus{outline:2px solid #2e5a9c;outline-offset:0}
        button:hover{filter:brightness(1.15)}
      `}</style>

      {/* SIDEBAR */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>⚓</span>
            <span style={styles.logoText}>Sailing Knowledge Hub</span>
          </div>
          <button style={styles.newBtn} onClick={newSession}>
            + New Session
          </button>
        </div>

        <div style={styles.searchBox}>
          <input
            style={styles.searchInput}
            placeholder="Search sessions & tags…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={styles.sessionList}>
          {filteredSessions.length === 0 && (
            <div style={{ padding: "16px", fontSize: 11, color: "#2a4a6a", textAlign: "center" }}>
              No sessions yet.<br />Start a new one above.
            </div>
          )}
          {filteredSessions.map((s) => (
            <div
              key={s.id}
              style={styles.sessionItem(s.id === activeSessionId)}
              onClick={() => selectSession(s)}
            >
              <div style={styles.sessionTitle}>{s.title}</div>
              <div style={styles.sessionMeta}>{formatTime(s.updatedAt)} · {s.messages.length} msgs</div>
              {s.tags?.length > 0 && (
                <div style={styles.sessionTags}>
                  {s.tags.slice(0, 3).map((t) => (
                    <span key={t} style={styles.tag}>{t}</span>
                  ))}
                </div>
              )}
              <button
                style={styles.deleteBtn}
                onClick={(e) => deleteSession(s.id, e)}
                title="Delete session"
              >✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <div style={styles.main}>
        <div style={styles.topBar}>
          <button style={styles.toggleBtn} onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <span style={styles.topTitle}>
            {activeSessionId
              ? sessions.find((s) => s.id === activeSessionId)?.title || "Session"
              : "Select or start a session"}
          </span>
          {messages.length > 0 && (
            <span style={styles.msgCount}>{messages.length} messages · {sessions.find(s=>s.id===activeSessionId)?.tags?.join(", ") || ""}</span>
          )}
        </div>

        <div style={styles.chatArea}>
          {!activeSessionId || messages.length === 0 ? (
            <div style={styles.welcome}>
              <div style={styles.welcomeIcon}>⛵</div>
              <div style={styles.welcomeTitle}>Your Sailing Knowledge Navigator</div>
              <div style={styles.welcomeSub}>
                Ask about COLREGs, Canadian regulations, navigation, seamanship,<br />
                racing rules, weather routing, and more. All sessions are saved.
              </div>
              <div style={styles.topicsGrid}>
                {SUGGESTED_TOPICS.map((t) => (
                  <button
                    key={t}
                    style={styles.topicBtn}
                    onClick={() => { if (!activeSessionId) newSession().then(() => sendMessage(t)); else sendMessage(t); }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} style={styles.bubble(msg.role)}>
                <div style={styles.bubbleInner(msg.role)}>
                  {msg.role === "assistant" ? renderMessage(msg) : <p style={styles.p}>{msg.content}</p>}
                  <div style={styles.timestamp}>{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            ))
          )}

          {loading && (
            <div style={styles.bubble("assistant")}>
              <div style={styles.bubbleInner("assistant")}>
                <div style={styles.loadingDots}>
                  {[0, 1, 2].map((i) => <div key={i} style={styles.dot(i)} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={styles.inputRow}>
          <textarea
            style={styles.textarea}
            placeholder="Ask about sailing, navigation, regulations…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!activeSessionId) newSession().then(() => sendMessage(input));
                else sendMessage(input);
              }
            }}
            rows={1}
          />
          <button
            style={styles.sendBtn}
            onClick={() => {
              if (!activeSessionId) newSession().then(() => sendMessage(input));
              else sendMessage(input);
            }}
            disabled={loading || !input.trim()}
          >
            {loading ? "…" : "Send ⛵"}
          </button>
        </div>
      </div>
    </div>
  );
}
