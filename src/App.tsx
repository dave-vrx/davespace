import { useCallback, useEffect, useState } from "react";
import {
  Box,
  CalendarDays,
  Compass,
  Headphones,
  MessageCircle,
  Mic,
  MicOff,
  Plus,
  Send,
  Settings,
  Users,
  UserRound,
  Volume2,
  Waypoints,
  X,
} from "lucide-react";
import WorldScene, { type WorldId } from "./WorldScene";
import "./App.css";
import "./Enhance.css";
import "./Mobile.css";
import "./Friendly.css";
import "./Concept.css";
type Screen = "boot" | "profile" | "hub" | "world";
type Tab = "discover" | "social" | "worlds" | "events" | "avatar" | "create" | "settings";
const BUILD_ID = "2026-08-30-avatar-portals-weather-13";
const avatars = [
  { id: "explorer", name: "Camp Explorer", note: "Default · 8 animations", tint: "#6257ff" },
  { id: "striker", name: "Night Striker", note: "65-joint humanoid", tint: "#44e0c0" },
  { id: "coral", name: "Coral Scout", note: "Explorer rig variant", tint: "#ff648d" },
  { id: "mint", name: "Mint Voyager", note: "Explorer rig variant", tint: "#38e0bd" },
];
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
    name: "Campfire",
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
  { id: "ocean", name: "Aqua Abyss", tag: "DIVE", people: 6, color: "#29d9ff", icon: "≈", desc: "Bioluminescent reefs and drifting light sculptures." },
  { id: "moon", name: "Lunar Commons", tag: "EXPLORE", people: 8, color: "#91a7ff", icon: "◐", desc: "Low-gravity social plaza beneath a giant planet." },
  { id: "arcade", name: "Pulse Arcade", tag: "PLAY", people: 14, color: "#ff4fad", icon: "✣", desc: "Targets, neon toys and multiplayer game spaces." },
  { id: "gallery", name: "Prism Gallery", tag: "CREATE", people: 5, color: "#ffcf73", icon: "◇", desc: "Walk through kinetic community art and media." },
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
    [online, setOnline] = useState(1),
    [avatarId, setAvatarId] = useState(() => localStorage.getItem("davespace-avatar") ?? "explorer");
  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.get("build") !== BUILD_ID) {
      url.searchParams.set("build", BUILD_ID);
      location.replace(url.toString());
    }
  }, []);
  useEffect(() => {
    const notify = (event: Event) => setToast((event as CustomEvent<string>).detail);
    window.addEventListener("davespace-system-notification", notify);
    return () => window.removeEventListener("davespace-system-notification", notify);
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
    const receive = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setChat((current) => [...current, message]);
      setToast(`New message · ${message.slice(0, 52)}`);
    };
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
  useEffect(() => {
    const changeWorld = (event: Event) => {
      setWorld((event as CustomEvent<WorldId>).detail);
      setToast("Travelling to the next DAVESPACE world");
    };
    window.addEventListener("davespace-change-world", changeWorld);
    return () => window.removeEventListener("davespace-change-world", changeWorld);
  }, []);
  const enter = () => {
    if (name.trim().length < 3) return;
    localStorage.setItem("davespace-name", name.trim());
    setScreen("hub");
  };
  const enableMic = async () => {
    if (stream) return stream;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setStream(s);
      window.dispatchEvent(new CustomEvent("davespace-audio-stream", { detail: s }));
      setMic(true);
      setToast("Voice is live · press X to mute");
      window.dispatchEvent(new Event("vrspace-enable-audio"));
      return s;
    } catch {
      setToast("Allow microphone access to talk in DAVESPACE");
      return null;
    }
  };
  const toggleMic = async () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      window.dispatchEvent(new CustomEvent("davespace-audio-stream", { detail: null }));
      setStream(null);
      setMic(false);
    } else await enableMic();
  };
  useEffect(() => {
    const toggleFromVR = () => void toggleMic();
    window.addEventListener("davespace-toggle-mic", toggleFromVR);
    return () => window.removeEventListener("davespace-toggle-mic", toggleFromVR);
  }, [stream]);
  const join = async (id: WorldId) => {
      // The Join click is a browser-approved user gesture, so it is the correct
      // moment to request an open microphone and unlock incoming voice.
      await enableMic();
      window.dispatchEvent(new Event("vrspace-enable-audio"));
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
      const v = prompt("Enter a DAVESPACE username");
      if (v?.trim()) {
        setFriends((f) => [...f, [v.trim(), "Request sent", "#70f1bd"]]);
        setToast("Friend request sent");
      }
    };
  if (screen === "boot")
    return (
      <div className="boot">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} />
        <h1>DAVESPACE</h1>
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
          <small>WELCOME TO DAVESPACE</small>
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
          avatarId={avatarId}
          audioStream={stream}
          onExit={exit}
        />
        <div className={`mic-overlay ${mic ? "open" : "muted"}`} title={mic ? "Microphone on" : "Microphone muted"}>
          {mic ? <Mic /> : <MicOff />}
        </div>
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
        <div className="brand">
          <img
            className="logo-img"
            src={`${import.meta.env.BASE_URL}logo.svg`}
          />
          <strong>DAVESPACE</strong>
        </div>
        {(["discover", "worlds", "events", "social", "avatar", "create"] as Tab[]).map((t, i) => {
          const I = [Compass, Box, CalendarDays, Users, UserRound, Waypoints][i];
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
                <small>EXPLORE · CONNECT · BELONG</small>
                <h2>Campfire</h2>
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
        {tab === "events" && <Events join={join} />}
        {tab === "avatar" && <AvatarSelector selected={avatarId} select={(id) => {
          setAvatarId(id); localStorage.setItem("davespace-avatar", id); setToast("Avatar equipped · visible to everyone");
        }} />}
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
function AvatarSelector({ selected, select }: { selected: string; select: (id: string) => void }) {
  return <section className="page-card avatar-page">
    <small>CC0 · WEBXR READY</small><h2>Choose your avatar</h2>
    <p>Only locally bundled, redistributable humanoid rigs are shown.</p>
    <div className="avatar-grid">{avatars.map((avatar) =>
      <button key={avatar.id} className={selected === avatar.id ? "selected" : ""} onClick={() => select(avatar.id)} style={{ "--avatar-tint": avatar.tint } as React.CSSProperties}>
        <div className="avatar-thumb"><img src={`${import.meta.env.BASE_URL}avatars/quaternius/preview.png`} alt={`${avatar.name} rig preview`} /></div>
        <strong>{avatar.name}</strong><span>{avatar.note}</span><b>{selected === avatar.id ? "EQUIPPED" : "SELECT"}</b>
      </button>)}</div>
    <small>Models: Quaternius Universal Base Characters · CC0 1.0</small>
  </section>;
}
function Events({ join }: { join: (id: WorldId) => void }) {
  const events: [string, string, string, WorldId][] = [
    ["Tonight · 20:00", "Fireside Film Club", "Community cinema and voice hangout", "fireside"],
    ["Friday · 21:30", "Neon Pulse Live", "Reactive-light rooftop dance session", "neon"],
    ["Saturday · 18:00", "Build Jam", "Make a shared mini-world in 45 minutes", "studio"],
  ];
  return <section className="page-card events-page">
    <small>LIVE & UPCOMING</small><h2>Community events</h2>
    <div className="event-grid">{events.map(([when, title, detail, id]) =>
      <article key={title}><b>{when}</b><h3>{title}</h3><p>{detail}</p><button onClick={() => join(id)}>JOIN EVENT</button></article>
    )}</div>
  </section>;
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
    [sharedUrl, setSharedUrl] = useState("");
  useEffect(() => {
    const receive = (event: Event) => setSharedUrl((event as CustomEvent<string>).detail);
    window.addEventListener("davespace-browser-url", receive);
    return () => window.removeEventListener("davespace-browser-url", receive);
  }, []);
  const load = () => {
    const match =
      input.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/) ??
      input.match(/^([A-Za-z0-9_-]{11})$/);
    const url = match?.[1]
      ? `https://www.youtube.com/embed/${match[1]}?playsinline=1&autoplay=1`
      : /^https?:\/\//i.test(input) ? input : `https://www.youtube.com/results?search_query=${encodeURIComponent(input)}`;
    setSharedUrl(url);
    window.dispatchEvent(new CustomEvent("davespace-share-browser", { detail: url }));
  };
  return (
    <section className="page-card youtube">
      <small>SHARED WORLD SURFACE</small>
      <h2>Browser & media</h2>
      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Paste a website or YouTube link"
        />
        <button onClick={load}>LOAD</button>
      </div>
      {sharedUrl && (
        <iframe
          title="Shared browser"
          src={sharedUrl}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}
    </section>
  );
}
