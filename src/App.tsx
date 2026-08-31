import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  CalendarDays,
  Camera,
  Compass,
  Headphones,
  MessageCircle,
  Mic,
  MicOff,
  Plus,
  Send,
  Settings,
  Sparkles,
  Users,
  UserPlus,
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
type WorldPlayer = { peerId: string; name: string; avatarId: string };
const BUILD_ID = "31";
const avatars = [
  { id: "striker", name: "DAVESPACE Human", note: "Default · 65 joints · finger rig", tint: "#44e0c0" },
  { id: "explorer", name: "Camp Explorer", note: "CC0 low-poly humanoid", tint: "#6257ff" },
  { id: "coral", name: "Coral Scout", note: "Explorer rig variant", tint: "#ff648d" },
  { id: "mint", name: "Mint Voyager", note: "Explorer rig variant", tint: "#38e0bd" },
  { id: "sapphire", name: "Sapphire Pilot", note: "Explorer rig variant", tint: "#3b82f6" },
  { id: "solar", name: "Solar Ranger", note: "Explorer rig variant", tint: "#ffd166" },
  { id: "violet", name: "Violet Drifter", note: "Explorer rig variant", tint: "#a56bff" },
  { id: "arctic", name: "Arctic Walker", note: "Explorer rig variant", tint: "#e8f4ff" },
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
const worldImages: Record<WorldId, string> = {
  fireside: "campfire.png",
  neon: "neon-rooftop.png",
  garden: "dream-garden.png",
  studio: "creator-studio.png",
  ocean: "aqua-abyss.png",
  moon: "lunar-commons.png",
  arcade: "pulse-arcade.png",
  gallery: "prism-gallery.png",
};
const seedFriends = [
  ["NovaSkye", "In Dream Garden", "#8b7cff"],
  ["PixelFox", "Online", "#ff805d"],
  ["OrbitDave", "Away", "#43d7aa"],
];
const worldIdeas = [
  ["Skyrail City", "SOCIAL", "Ride shared trains between floating districts."], ["Tiny Town", "PLAY", "Everyone is toy-sized inside a giant home."],
  ["Aurora Lodge", "COZY", "Snow, fireplaces, hot chocolate and northern lights."], ["Dragon Isles", "ADVENTURE", "Fly gliders between nests and ancient ruins."],
  ["Zero-G Arena", "SPORT", "Team disc games with true zero-gravity movement."], ["Coral Kingdom", "DIVE", "Swim with rays through a living underwater city."],
  ["Moonbase Café", "SOCIAL", "Low-gravity coffee shop overlooking Earth."], ["Pocket Raceway", "RACE", "Build and race tiny vehicles with friends."],
  ["Haunted Hotel", "STORY", "Co-op puzzles across a shifting spooky hotel."], ["Cloud Cinema", "MEDIA", "Private watch parties on a cinema above the clouds."],
  ["Paint Planet", "CREATE", "A shared world where every surface is drawable."], ["Robot Workshop", "BUILD", "Assemble robots and teach them simple routines."],
  ["Dino Reserve", "EXPLORE", "A safe safari through a low-poly dinosaur habitat."], ["Rhythm Reactor", "MUSIC", "Collaborative rhythm games powering a neon core."],
  ["Wizard Academy", "GAME", "Learn gesture spells and play team challenges."], ["Mini Golf Galaxy", "SPORT", "Portal-powered courses across tiny planets."],
  ["Creator Market", "COMMUNITY", "Discover community worlds, avatars and props."], ["Meditation Cove", "WELLNESS", "Guided breathing, calm water and spatial sound."],
  ["Comedy Cellar", "EVENT", "Open-mic stage with audience reactions and queues."], ["Museum of WebXR", "LEARN", "Interactive history and experiments from the open web."],
  ["Pirate Bay", "ADVENTURE", "Crew a shared ship, find maps and battle sea monsters."], ["Space Farm", "COZY", "Grow alien plants and trade seeds with friends."],
  ["Portal Plaza", "DISCOVER", "A walkable directory of live community worlds."], ["Festival Fields", "EVENT", "Multiple stages, fireworks, vendors and group photos."],
] as const;
const platformIdeas = [
  "One-click nearby friend requests", "Friend groups and favourite circles", "Invite-only and friends-plus instances", "Join-friend and request-invite controls",
  "Spatial voice zones and private whisper bubbles", "Per-user volume, mute and block", "Emoji reactions above avatars", "Status text and pronouns",
  "Avatar favourites and recent avatars", "Full-body IK calibration", "Face and eye tracking when available", "Desktop emotes and gesture wheel",
  "Persistent world objects", "Undo/redo and multi-select building", "Prefab library and community assets", "World permissions and collaborator roles",
  "Portal history and saved destinations", "Event calendar with reminders", "World favourites and recently visited", "Community world ratings and safety reports",
  "Shared cameras, selfies and group photos", "Spatial drawing with saved canvases", "Screen sharing and synchronized playlists", "Board games and reusable multiplayer toys",
  "Achievements and exploration badges", "World quests and scavenger hunts", "Accessibility captions and speech bubbles", "Comfort turning and locomotion profiles",
  "Creator analytics and crash reports", "Offline world preview mode", "PWA install and push notifications", "Unity-to-WebXR upload validation",
] as const;
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
    [avatarId, setAvatarId] = useState(() => {
      const saved = localStorage.getItem("davespace-avatar");
      if (!localStorage.getItem("davespace-human-default-v1") && (!saved || saved === "explorer")) {
        localStorage.setItem("davespace-human-default-v1", "1");
        localStorage.setItem("davespace-avatar", "striker");
        return "striker";
      }
      return saved ?? "striker";
    });
  const [isMobile, setIsMobile] = useState(false);
  const [worldPlayers, setWorldPlayers] = useState<WorldPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<WorldPlayer | null>(null);
  const [localTime, setLocalTime] = useState(() =>
    new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date()),
  );
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => { streamRef.current = stream; }, [stream]);
  useEffect(() => {
    const updateClock = () =>
      setLocalTime(new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const releaseMicrophone = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    window.addEventListener("pagehide", releaseMicrophone);
    window.addEventListener("beforeunload", releaseMicrophone);
    return () => {
      window.removeEventListener("pagehide", releaseMicrophone);
      window.removeEventListener("beforeunload", releaseMicrophone);
    };
  }, []);
  useEffect(() => {
    const query = matchMedia("(pointer: coarse), (max-width: 760px)");
    const update = () => setIsMobile(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("davespace-avatar-changed", { detail: avatarId }));
  }, [avatarId]);
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
    const cycleAvatar = () => setAvatarId((current) => {
      const next = avatars[(avatars.findIndex((item) => item.id === current) + 1) % avatars.length].id;
      localStorage.setItem("davespace-avatar", next);
      return next;
    });
    window.addEventListener("davespace-cycle-avatar", cycleAvatar);
    return () => window.removeEventListener("davespace-cycle-avatar", cycleAvatar);
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
    const updatePlayers = (event: Event) => {
      const players = (event as CustomEvent<WorldPlayer[]>).detail;
      setWorldPlayers(players);
      setSelectedPlayer((current) => current ? players.find((player) => player.peerId === current.peerId) ?? null : null);
    };
    window.addEventListener("davespace-world-players", updatePlayers);
    return () => window.removeEventListener("davespace-world-players", updatePlayers);
  }, []);
  useEffect(() => {
    if (!panel) {
      setSelectedPlayer(null);
      window.dispatchEvent(new CustomEvent("davespace-select-player", { detail: null }));
    }
  }, [panel]);
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
    exit = useCallback(() => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      window.dispatchEvent(new CustomEvent("davespace-audio-stream", { detail: null }));
      setStream(null);
      setMic(false);
      setScreen("hub");
    }, []),
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
    },
    addPlayerFriend = (player: WorldPlayer) => {
      setFriends((current) => current.some((friend) => friend[0].toLowerCase() === player.name.toLowerCase())
        ? current
        : [...current, [player.name, "Request sent", "#8b72ff"]]);
      setToast(`Friend request sent to ${player.name}`);
    },
    selectWorldPlayer = (player: WorldPlayer) => {
      setSelectedPlayer(player);
      window.dispatchEvent(new CustomEvent("davespace-select-player", { detail: player.peerId }));
    },
    openWorldPanel = (section?: "people" | "chat") => {
      setPanel(true);
      if (section) window.setTimeout(() => document.getElementById(`world-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
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
      <div className={`world-wrap ${isMobile ? "mobile-device" : ""}`}>
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
          <div className="world-identity" aria-label={`Signed in as ${name}, local time ${localTime}`}>
            <b>{name[0]?.toUpperCase()}</b>
            <span><strong>{name}</strong><small>{localTime} · LOCAL</small></span>
          </div>
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
          <button className={panel ? "active" : ""} onClick={() => openWorldPanel("people")}>
            <Users />
            <span>PEOPLE</span>
          </button>
          <button className={panel ? "active" : ""} onClick={() => openWorldPanel("chat")}>
            <MessageCircle />
            <span>CHAT</span>
          </button>
          <button onClick={() => window.dispatchEvent(new Event("davespace-toggle-third-person"))}>
            <Camera />
            <span>CHANGE VIEW</span>
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
        <button className="mobile-jump" onPointerDown={() => window.dispatchEvent(new CustomEvent("vrspace-mobile-move", { detail: { direction: "jump", active: true } }))} onPointerUp={() => window.dispatchEvent(new CustomEvent("vrspace-mobile-move", { detail: { direction: "jump", active: false } }))}>JUMP</button>
        {panel && (
          <aside className="social-panel">
            <button className="close" onClick={() => setPanel(false)}>
              <X />
            </button>
            <header className="world-menu-header">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
              <div><small>DAVESPACE QUICK MENU</small><h1>Hi, {name}</h1><p>{worlds.find((item) => item.id === world)?.name} · {online} online · {localTime}</p></div>
              <span><i /> LIVE</span>
            </header>
            <section className="page-card quick-panel">
              <small>QUICK ACTIONS</small><h2>What would you like to do?</h2>
              <div className="tool-row">
                <button onClick={toggleMic}>{mic ? <Mic /> : <MicOff />}<span>{mic ? "Mute" : "Unmute"}</span><small>Voice controls</small></button>
                <button onClick={() => join(worlds[(worlds.findIndex((item) => item.id === world) + 1) % worlds.length].id)}><Compass /><span>Travel</span><small>Next world</small></button>
                <button onClick={() => window.dispatchEvent(new Event("davespace-cycle-avatar"))}><UserRound /><span>Avatar</span><small>Change look</small></button>
                <button onClick={() => window.dispatchEvent(new Event("davespace-toggle-third-person"))}><Camera /><span>Camera</span><small>Change view</small></button>
              </div>
            </section>
            <section id="world-people" className="page-card world-player-panel">
              <small>PEOPLE HERE</small>
              <h2>Players in this world</h2>
              <div className="world-player-row self">
                <b>{name[0]?.toUpperCase()}</b><span><strong>{name}</strong><small>YOU · {avatarId.toUpperCase()}</small></span>
              </div>
              {worldPlayers.length === 0 && <p className="player-empty">Waiting for another player to join…</p>}
              {worldPlayers.map((player) => (
                <div key={player.peerId} role="button" tabIndex={0} className={`world-player-row ${selectedPlayer?.peerId === player.peerId ? "selected" : ""}`} onClick={() => selectWorldPlayer(player)} onKeyDown={(event) => event.key === "Enter" && selectWorldPlayer(player)}>
                  <b>{player.name[0]?.toUpperCase()}</b><span><strong>{player.name}</strong><small>ONLINE · {player.avatarId.toUpperCase()}</small></span>
                  <button className="quick-friend" onClick={(event) => { event.stopPropagation(); addPlayerFriend(player); }}><UserPlus /> ADD</button>
                  <em>VIEW</em>
                </div>
              ))}
              {selectedPlayer && (
                <div className="player-details">
                  <div className="player-details-avatar">{selectedPlayer.name[0]?.toUpperCase()}</div>
                  <div><small>SELECTED PLAYER</small><h3>{selectedPlayer.name}</h3><p>Online now in {worlds.find((item) => item.id === world)?.name} · Avatar: {selectedPlayer.avatarId}</p></div>
                  <button onClick={() => addPlayerFriend(selectedPlayer)}><Plus /> ADD FRIEND</button>
                </div>
              )}
            </section>
            <div><Friends data={friends} add={add} /></div>
            <div id="world-chat"><Chat {...{ chat, draft, setDraft, send }} /></div>
            <YouTubePlayer />
            <AvatarSelector selected={avatarId} select={(id) => { setAvatarId(id); localStorage.setItem("davespace-avatar", id); }} />
          </aside>
        )}
        <div className="move-tip">
          WASD MOVE · MOUSE LOOK · SHIFT SPRINT · V CHANGE VIEW · ESC LEAVE
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  return (
    <div className="hub">
      <aside>
        <div className="brand">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}davespace-logo.svg`}
            alt="DAVESPACE"
          />
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
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
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
            <time dateTime={new Date().toISOString()}>{localTime} LOCAL</time>
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
              <div className="hero-copy">
                <div className="hero-eyebrow"><i /> DAVESPACE IS OPEN</div>
                <h2>Your worlds.<br /><em>Your people.</em></h2>
                <p>
                  A bright social universe that lives in your browser. Meet friends,
                  share moments, create together and step straight into WebXR.
                </p>
                <div className="hero-pills"><span>● LIVE VOICE</span><span>8 PLAYABLE WORLDS</span><span>PC · MOBILE · VR</span></div>
                <button onClick={() => join("fireside")}>
                  <Headphones /> ENTER CAMPFIRE
                </button>
                <button className="desktop" onClick={() => setTab("worlds")}>
                  <Compass /> EXPLORE WORLDS
                </button>
                <div className="hero-stats"><span><b>{online}</b> LIVE NOW</span><span><b>24</b> WORLD IDEAS</span><span><b>0</b> DOWNLOADS</span></div>
              </div>
              <span>
                <Users /> PUBLIC SOCIAL HUB
              </span>
            </section>
            <WorldCards join={join} />
          </>
        )}
        {tab === "worlds" && (
          <section className="page-card">
            <WorldCards join={join} />
            <IdeasBoard />
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
              <img src={`${import.meta.env.BASE_URL}worlds/${worldImages[w.id]}`} alt={`${w.name} world preview`} />
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
function IdeasBoard() {
  const [saved, setSaved] = useState<string[]>(() => JSON.parse(localStorage.getItem("davespace-saved-ideas") ?? "[]"));
  const toggle = (title: string) => setSaved((current) => {
    const next = current.includes(title) ? current.filter((item) => item !== title) : [...current, title];
    localStorage.setItem("davespace-saved-ideas", JSON.stringify(next));
    return next;
  });
  return (
    <section className="ideas-board">
      <div className="ideas-heading"><div><small>DAVESPACE WORLD LAB</small><h2>What we could build next</h2><p>Save the concepts you like most. Your choices stay on this device.</p></div><Sparkles /></div>
      <div className="idea-grid">
        {worldIdeas.map(([title, tag, description], index) => (
          <article key={title} style={{ "--idea-hue": `${(index * 31 + 245) % 360}` } as React.CSSProperties}>
            <div><span>{tag}</span><b>{String(index + 1).padStart(2, "0")}</b></div>
            <h3>{title}</h3><p>{description}</p>
            <button className={saved.includes(title) ? "saved" : ""} onClick={() => toggle(title)}>{saved.includes(title) ? "★ SAVED" : "☆ SAVE IDEA"}</button>
          </article>
        ))}
      </div>
      <div className="feature-ideas"><small>PLATFORM IDEA BANK · {platformIdeas.length} FEATURES</small><h2>Social, creator and comfort ideas</h2><div>{platformIdeas.map((idea) => <span key={idea}>{idea}</span>)}</div></div>
    </section>
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
    <small>Default human: CC0 Night Striker · 65-joint skeleton with articulated fingers. Alternatives: Quaternius CC0.</small>
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
      <small>LIVE ON THE CAMPFIRE SCREEN</small>
      <h2>Shared browser & media</h2>
      <p>Paste a website, YouTube link, or direct MP4/WebM address. Direct media plays with video and audio on the 3D screen.</p>
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
