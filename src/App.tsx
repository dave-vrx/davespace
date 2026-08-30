import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Compass,
  Headphones,
  MessageCircle,
  Mic,
  MicOff,
  Plus,
  Send,
  Settings,
  Users,
  Volume2,
  Waypoints,
  X,
} from "lucide-react";
import WorldScene, { type WorldId } from "./WorldScene";
import "./App.css";
import "./Enhance.css";
import "./Mobile.css";
import "./Friendly.css";
type Screen = "boot" | "profile" | "hub" | "world";
type Tab = "discover" | "social" | "worlds" | "create" | "settings";
const BUILD_ID = "2026-08-30-hands-menu-mqtt-4";
const worlds: {
  id: WorldId;
  name: string;
  tag: string;
  people: number;
  color: string;
  icon: string;
  desc: string;
}[] = [
  {
    id: "fireside",
    name: "Fireside Cinema",
    tag: "SOCIAL",
    people: 12,
    color: "#f27b42",
    icon: "♨",
    desc: "Camp beneath the stars and watch together.",
  },
  {
    id: "neon",
    name: "Neon Rooftop",
    tag: "HANGOUT",
    people: 7,
    color: "#7d67ff",
    icon: "◈",
    desc: "A synthwave skyline club with reactive lights.",
  },
  {
    id: "garden",
    name: "Dream Garden",
    tag: "EXPLORE",
    people: 4,
    color: "#55d6a3",
    icon: "✦",
    desc: "A floating sanctuary filled with crystal flowers.",
  },
  {
    id: "studio",
    name: "Creator Studio",
    tag: "BUILD",
    people: 3,
    color: "#38bdf8",
    icon: "⬡",
    desc: "Grab, move and arrange objects together.",
  },
];
const seedFriends = [
  ["NovaSkye", "In Dream Garden", "#8b7cff"],
  ["PixelFox", "Online", "#ff805d"],
  ["OrbitDave", "Away", "#43d7aa"],
];
export default function App() {
  const [screen, setScreen] = useState<Screen>("boot"),
    [tab, setTab] = useState<Tab>("discover"),
    [name, setName] = useState(""),
    [mic, setMic] = useState(false),
    [stream, setStream] = useState<MediaStream | null>(null),
    [world, setWorld] = useState<WorldId>("fireside"),
    [friends, setFriends] = useState(seedFriends),
    [panel, setPanel] = useState(false),
    [chat, setChat] = useState(["NovaSkye: Meet you by the fire!"]),
    [draft, setDraft] = useState(""),
    [toast, setToast] = useState(""),
    [online, setOnline] = useState(1);
  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.get("build") !== BUILD_ID) {
      url.searchParams.set("build", BUILD_ID);
      location.replace(url.toString());
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      const n = localStorage.getItem("davespace-name");
      n ? (setName(n), setScreen("hub")) : setScreen("profile");
    }, 800);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 2200);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    const receive = (event: Event) =>
      setChat((current) => [...current, (event as CustomEvent<string>).detail]);
    window.addEventListener("vrspace-chat", receive);
    return () => window.removeEventListener("vrspace-chat", receive);
  }, []);
  useEffect(() => {
    const presence = (event: Event) =>
      setOnline((event as CustomEvent<number>).detail);
    window.addEventListener("vrspace-presence", presence);
    return () => window.removeEventListener("vrspace-presence", presence);
  }, []);
  useEffect(() => {
    const toggle = () => setPanel((value) => !value);
    window.addEventListener("vrspace-toggle-menu", toggle);
    return () => window.removeEventListener("vrspace-toggle-menu", toggle);
  }, []);
  const enter = () => {
    if (name.trim().length < 3) return;
    localStorage.setItem("davespace-name", name.trim());
    setScreen("hub");
  };
  const toggleMic = async () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
      setMic(false);
    } else
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        setStream(s);
        setMic(true);
        setToast("Microphone ready");
        window.dispatchEvent(new Event("vrspace-enable-audio"));
      } catch {
        setToast("Microphone permission blocked");
      }
  };
  const join = (id: WorldId) => {
      setWorld(id);
      setScreen("world");
    },
    exit = useCallback(() => setScreen("hub"), []),
    send = () => {
      if (draft.trim()) {
        const message = `${name}: ${draft.trim()}`;
        setChat((c) => [...c, message]);
        window.dispatchEvent(
          new CustomEvent("vrspace-send-chat", { detail: message }),
        );
        setDraft("");
      }
    },
    add = () => {
      const v = prompt("Enter a VRSpace username");
      if (v?.trim()) {
        setFriends((f) => [...f, [v.trim(), "Request sent", "#70f1bd"]]);
        setToast("Friend request sent");
      }
    };
  if (screen === "boot")
    return (
      <div className="boot">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} />
        <h1>VRSPACE</h1>
        <p>OPENING THE METAVERSE</p>
        <i />
      </div>
    );
  if (screen === "profile")
    return (
      <div className="profile">
        <div className="profile-art">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} />
          <span>
            BE ANYONE.
            <br />
            GO ANYWHERE.
            <br />
            <em>BUILD TOGETHER.</em>
          </span>
        </div>
        <section>
          <small>WELCOME TO VRSPACE</small>
          <h1>Choose your name</h1>
          <p>Create your identity for worlds, friends and messages.</p>
          <input
            autoFocus
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enter()}
            placeholder="Display name"
          />
          <button disabled={name.trim().length < 3} onClick={enter}>
            CREATE PROFILE
          </button>
        </section>
      </div>
    );
  if (screen === "world")
    return (
      <div className="world-wrap">
        <WorldScene
          world={world}
          playerName={name}
          audioStream={stream}
          onExit={exit}
        />
        <div className="world-top">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} />
          <span>
            <strong>{worlds.find((w) => w.id === world)?.name}</strong>
            <small>
              PUBLIC INSTANCE · {online} / 24 ·{" "}
              {online > 1 ? "PEER CONNECTED" : "WAITING FOR PEER"}
            </small>
          </span>
          <button onClick={exit}>LEAVE WORLD</button>
        </div>
        <div className="world-controls">
          <button className={mic ? "live" : ""} onClick={toggleMic}>
            {mic ? <Mic /> : <MicOff />}
            <span>{mic ? "MIC ON" : "MUTED"}</span>
          </button>
          <button
            onClick={() => {
              window.dispatchEvent(new Event("vrspace-enable-audio"));
              setToast("Voice playback enabled");
            }}
          >
            <Volume2 />
            <span>ENABLE AUDIO</span>
          </button>
          <button onClick={() => setPanel((v) => !v)}>
            <Users />
            <span>PEOPLE</span>
          </button>
          <button onClick={() => setPanel((v) => !v)}>
            <MessageCircle />
            <span>CHAT</span>
          </button>
        </div>
        <button
          className="mobile-menu"
          aria-label="Open world menu"
          onClick={() => setPanel((v) => !v)}
        >
          <span>☰</span> MENU
        </button>
        <div className="mobile-pad" aria-label="Mobile movement controls">
          {(
            [
              ["forward", "▲"],
              ["left", "◀"],
              ["back", "▼"],
              ["right", "▶"],
            ] as const
          ).map(([direction, label]) => (
            <button
              key={direction}
              onPointerDown={(e) => {
                e.preventDefault();
                window.dispatchEvent(
                  new CustomEvent("vrspace-mobile-move", {
                    detail: { direction, active: true },
                  }),
                );
              }}
              onPointerUp={() =>
                window.dispatchEvent(
                  new CustomEvent("vrspace-mobile-move", {
                    detail: { direction, active: false },
                  }),
                )
              }
              onPointerCancel={() =>
                window.dispatchEvent(
                  new CustomEvent("vrspace-mobile-move", {
                    detail: { direction, active: false },
                  }),
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
        {panel && (
          <aside className="social-panel">
            <button className="close" onClick={() => setPanel(false)}>
              <X />
            </button>
            <Friends data={friends} add={add} />
            <Chat {...{ chat, draft, setDraft, send }} />
            <YouTubePlayer />
          </aside>
        )}
        <div className="move-tip">
          WASD MOVE · MOUSE LOOK · SHIFT SPRINT · DOUBLE CLICK OBJECTS · ESC
          LEAVE
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  return (
    <div className="hub">
      <aside>
        <img className="logo-img" src={`${import.meta.env.BASE_URL}logo.svg`} />
        {(["discover", "social", "worlds", "create"] as Tab[]).map((t, i) => {
          const I = [Compass, Users, Box, Waypoints][i];
          return (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              <I />
              {t.toUpperCase()}
            </button>
          );
        })}
        <span />
        <button onClick={() => setTab("settings")}>
          <Settings />
          SETTINGS
        </button>
      </aside>
      <main>
        <header>
          <div>
            <small>
              {tab === "discover" ? "WELCOME BACK" : tab.toUpperCase()}
            </small>
            <h1>
              {tab === "discover" ? name : tab[0].toUpperCase() + tab.slice(1)}
            </h1>
          </div>
          <div className="status">
            <i /> {online} ONLINE{" "}
            <button className={mic ? "live" : ""} onClick={toggleMic}>
              {mic ? <Mic /> : <MicOff />}
            </button>
            <div className="avatar">{name[0]?.toUpperCase()}</div>
          </div>
        </header>
        {tab === "discover" && (
          <>
            <section className="hero-card">
              <div>
                <small>FEATURED WORLD</small>
                <h2>Fireside Cinema</h2>
                <p>
                  A warm social clearing under the stars. Meet friends, watch
                  videos and step into VR.
                </p>
                <button onClick={() => join("fireside")}>
                  <Headphones /> JOIN IN VR
                </button>
                <button className="desktop" onClick={() => join("fireside")}>
                  JOIN DESKTOP
                </button>
              </div>
              <div className="fire-mark">♨</div>
              <span>
                <Users /> 12 ONLINE
              </span>
            </section>
            <WorldCards join={join} />
          </>
        )}
        {tab === "worlds" && (
          <section className="page-card">
            <WorldCards join={join} />
          </section>
        )}
        {tab === "social" && (
          <div className="social-page">
            <section className="page-card">
              <Friends data={friends} add={add} />
            </section>
            <Chat {...{ chat, draft, setDraft, send }} />
          </div>
        )}
        {tab === "create" && (
          <section className="creator page-card">
            <small>WORLD CREATOR</small>
            <h2>Build with your hands</h2>
            <p>
              Open Creator Studio to grab and arrange low-poly objects on
              desktop or in WebXR.
            </p>
            <div className="tool-row">
              <span>↔ Move</span>
              <span>⟳ Rotate</span>
              <span>⊕ Duplicate</span>
              <span>⌫ Delete</span>
            </div>
            <button onClick={() => join("studio")}>
              <Waypoints /> OPEN CREATOR STUDIO
            </button>
          </section>
        )}
        {tab === "settings" && (
          <section className="page-card settings-page">
            <small>PROFILE & COMFORT</small>
            <h2>Settings</h2>
            <label>
              <span>Build {BUILD_ID}</span>
              <button
                onClick={async () => {
                  if ("caches" in window)
                    await Promise.all(
                      (await caches.keys()).map((key) => caches.delete(key)),
                    );
                  localStorage.removeItem("vrspace-build");
                  location.href = `${location.pathname}?build=${BUILD_ID}&refresh=${Date.now()}`;
                }}
              >
                CLEAR CACHE & RELOAD
              </button>
            </label>
            <label>
              Display name
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  localStorage.setItem("davespace-name", e.target.value);
                }}
              />
            </label>
            {["Snap turning", "Movement vignette", "Spatial voice"].map((x) => (
              <label key={x}>
                <span>{x}</span>
                <input type="checkbox" defaultChecked />
              </label>
            ))}
          </section>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
function WorldCards({ join }: { join: (id: WorldId) => void }) {
  return (
    <>
      <div className="section-title">
        <div>
          <small>EXPLORE TOGETHER</small>
          <h2>All demo worlds</h2>
        </div>
      </div>
      <div className="world-grid">
        {worlds.map((w) => (
          <article
            key={w.id}
            style={{ "--world": w.color } as React.CSSProperties}
            onClick={() => join(w.id)}
          >
            <div className={`world-visual ${w.id}`}>
              <span>{w.icon}</span>
              <em>{w.tag}</em>
            </div>
            <h3>{w.name}</h3>
            <p>{w.desc}</p>
            <b>
              <Users /> {w.people} people now
            </b>
          </article>
        ))}
      </div>
    </>
  );
}
function Friends({ data, add }: { data: string[][]; add: () => void }) {
  return (
    <>
      <div className="section-title">
        <div>
          <small>YOUR CIRCLE</small>
          <h2>Friends</h2>
        </div>
        <button onClick={add}>
          <Plus /> ADD FRIEND
        </button>
      </div>
      {data.map((f) => (
        <div className="friend" key={f[0]}>
          <div style={{ background: f[2] }}>{f[0][0]}</div>
          <span>
            <strong>{f[0]}</strong>
            <small>{f[1]}</small>
          </span>
          <button>JOIN</button>
        </div>
      ))}
    </>
  );
}
function Chat({
  chat,
  draft,
  setDraft,
  send,
}: {
  chat: string[];
  draft: string;
  setDraft: (v: string) => void;
  send: () => void;
}) {
  return (
    <section className="page-card chat">
      <small>WORLD CHAT</small>
      <h2>Messages</h2>
      <div className="messages">
        {chat.map((m, i) => (
          <p key={i}>{m}</p>
        ))}
      </div>
      <div className="composer">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Write a message…"
        />
        <button onClick={send}>
          <Send />
        </button>
      </div>
    </section>
  );
}
function YouTubePlayer() {
  const [input, setInput] = useState(""),
    [videoId, setVideoId] = useState("");
  const load = () => {
    const match =
      input.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/) ??
      input.match(/^([A-Za-z0-9_-]{11})$/);
    if (match?.[1]) setVideoId(match[1]);
    else
      window.open(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(input)}`,
        "_blank",
        "noopener",
      );
  };
  return (
    <section className="page-card youtube">
      <small>WORLD VIDEO</small>
      <h2>YouTube</h2>
      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Paste a YouTube link or search"
        />
        <button onClick={load}>LOAD</button>
      </div>
      {videoId && (
        <iframe
          title="YouTube player"
          src={`https://www.youtube.com/embed/${videoId}?playsinline=1`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}
    </section>
  );
}
