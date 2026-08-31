import { useEffect, useRef } from "react";
import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { joinRoom, selfId } from "trystero";
export type WorldId = "fireside" | "neon" | "garden" | "studio" | "ocean" | "moon" | "arcade" | "gallery";
const M = (c: number, e = 0) =>
  new THREE.MeshStandardMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: e,
    roughness: 0.72,
  });
export default function WorldScene({
  world,
  playerName,
  avatarId,
  audioStream,
  onExit,
}: {
  world: WorldId;
  playerName: string;
  avatarId: string;
  audioStream: MediaStream | null;
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const root = host.current,
      scene = new THREE.Scene(),
      palette = {
        fireside: [0x071019, 0x17291d],
        neon: [0x09051b, 0x25145c],
        garden: [0x081d20, 0x214d3f],
        studio: [0x0a1321, 0x253b55],
        ocean: [0x031a2b, 0x07536b],
        moon: [0x080b18, 0x30384f],
        arcade: [0x17051d, 0x4a164e],
        gallery: [0x10131c, 0x4d4439],
      }[world];
    scene.background = new THREE.Color(palette[0]);
    scene.fog = new THREE.FogExp2(palette[0], 0.024);
    const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 120),
      rig = new THREE.Group();
    camera.position.set(0, 1.7, 0);
    rig.add(camera);
    const spawnAngle =
      (([...selfId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 12) /
        12) *
      Math.PI *
      2;
    rig.position.set(Math.cos(spawnAngle) * 2.4, 0, Math.sin(spawnAngle) * 2.4);
    scene.add(rig);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    root.appendChild(renderer.domElement);
    const vr = VRButton.createButton(renderer);
    vr.className = "enter-vr";
    root.appendChild(vr);
    scene.add(new THREE.HemisphereLight(0xaee8ff, palette[1], 1.8));
    const key = new THREE.DirectionalLight(0xbad2ff, 2);
    key.position.set(-6, 10, 5);
    key.castShadow = true;
    scene.add(key);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(32, 32),
      M(palette[1]),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const animated: THREE.Object3D[] = [],
      grab: THREE.Mesh[] = [];
    build(world, scene, animated, grab);
    addAtmosphere(scene, world);
    const weather = world === "fireside" ? makeCampfireWeather(scene) : null;
    const room = joinRoom(
      { appId: "vrspace-webxr-social-v1" },
      `public-${world}`,
    );
    const poseAction = room.makeAction<{
      p: number[];
      h: number[];
      q: number[];
      l: number[];
      r: number[];
    }>("pose");
    const nameAction = room.makeAction<string>("name");
    const avatarAction = room.makeAction<string>("avatar");
    const chatAction = room.makeAction<string>("chat");
    const browserAction = room.makeAction<string>("browser");
    const placeAction = room.makeAction<{ kind: "portal"; p: number[] }>("place");
    const hitAction = room.makeAction<string>("hit");
    const remoteAvatars = new Map<string, THREE.Group>();
    const remoteNames = new Map<string, string>();
    const remoteAvatarIds = new Map<string, string>();
    let selectedPeerId: string | null = null;
    const avatarTemplates = new Map<string, THREE.Object3D>();
    const templateKey = (id: string) => id === "striker" ? "striker" : "explorer";
    const loadTemplate = (id: string, ready?: () => void) => {
      const key = templateKey(id);
      if (avatarTemplates.has(key)) return ready?.();
      const path = key === "striker" ? "avatars/night-striker/avatar.glb" : "avatars/quaternius/human.glb";
      new GLTFLoader().load(`${import.meta.env.BASE_URL}${path}`, (gltf) => {
        avatarTemplates.set(key, gltf.scene); ready?.();
      });
    };
    loadTemplate(avatarId);
    const peerAudio = new Map<string, HTMLAudioElement>();
    const publishPresence = () =>
      window.dispatchEvent(
        new CustomEvent("vrspace-presence", { detail: remoteAvatars.size + 1 }),
      );
    const publishPlayers = () =>
      window.dispatchEvent(new CustomEvent("davespace-world-players", {
        detail: [...remoteAvatars.keys()].map((peerId) => ({
          peerId,
          name: remoteNames.get(peerId) ?? "Guest",
          avatarId: remoteAvatarIds.get(peerId) ?? "striker",
        })),
      }));
    const applyPlayerSelection = () => remoteAvatars.forEach((avatar, peerId) => {
      const capsule = avatar.getObjectByName("player-selection-capsule");
      if (capsule) capsule.visible = peerId === selectedPeerId;
    });
    const selectPlayer = (event: Event) => {
      selectedPeerId = (event as CustomEvent<string | null>).detail;
      applyPlayerSelection();
    };
    window.addEventListener("davespace-select-player", selectPlayer);
    const ensurePeer = (peerId: string) => {
      let avatar = remoteAvatars.get(peerId);
      if (!avatar) {
        const selected = remoteAvatarIds.get(peerId) ?? "striker";
        avatar = makeRemoteAvatar(
          remoteNames.get(peerId) ?? "Guest",
          avatarTemplates.get(templateKey(selected)) ?? null,
          selected,
        );
        remoteAvatars.set(peerId, avatar);
        scene.add(avatar);
        applyPlayerSelection();
      }
      return avatar;
    };
    const rebuildPeer = (peerId: string) => {
      const old = remoteAvatars.get(peerId);
      const position = old?.position.clone();
      const quaternion = old?.quaternion.clone();
      if (old) scene.remove(old);
      remoteAvatars.delete(peerId);
      const next = ensurePeer(peerId);
      if (position) next.position.copy(position);
      if (quaternion) next.quaternion.copy(quaternion);
    };
    nameAction.onMessage = (peerName, { peerId }) => {
      remoteNames.set(peerId, peerName);
      rebuildPeer(peerId);
      publishPlayers();
      showHUDNotice(camera, `${peerName} joined the world`, "#72ffd0");
      window.dispatchEvent(new CustomEvent("davespace-system-notification", { detail: `${peerName} joined the world` }));
    };
    avatarAction.onMessage = (selected, { peerId }) => {
      remoteAvatarIds.set(peerId, selected);
      loadTemplate(selected, () => rebuildPeer(peerId));
      publishPlayers();
    };
    poseAction.onMessage = (pose, { peerId }) => {
      const avatar = ensurePeer(peerId);
      avatar.position.fromArray(pose.p);
      const headRotation = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().fromArray(pose.q),
        "YXZ",
      );
      avatar.rotation.set(0, headRotation.y, 0);
      // worldToLocal must see this packet's new root transform. Without this,
      // hands are converted through the previous frame and the arms telescope.
      avatar.updateMatrixWorld(true);
      const left = avatar.getObjectByName("left-hand");
      const right = avatar.getObjectByName("right-hand");
      if (left) left.position.fromArray(pose.l);
      if (right) right.position.fromArray(pose.r);
      const remoteHead = avatar.getObjectByName("avatar-head");
      if (remoteHead && pose.h) {
        const localHead = new THREE.Vector3().fromArray(pose.h);
        localHead.x = THREE.MathUtils.clamp(localHead.x, -1.5, 1.5);
        localHead.y = THREE.MathUtils.clamp(localHead.y, .7, 2.4);
        localHead.z = THREE.MathUtils.clamp(localHead.z, -1.5, 1.5);
        remoteHead.position.copy(localHead);
      }
      updateAvatarLimb(avatar, "left-arm", new THREE.Vector3(-0.22, 1.42, 0), left?.position);
      updateAvatarLimb(avatar, "right-arm", new THREE.Vector3(0.22, 1.42, 0), right?.position);
    };
    chatAction.onMessage = (message) => {
      window.dispatchEvent(
        new CustomEvent("vrspace-chat", { detail: message }),
      );
    };
    const sharedWorldScreen = scene.getObjectByName("shared-browser-screen") as THREE.Mesh | undefined;
    browserAction.onMessage = (url) => {
      window.dispatchEvent(new CustomEvent("davespace-browser-url", { detail: url }));
      if (sharedWorldScreen) applySharedMedia(sharedWorldScreen, url);
    };
    const sendChat = (event: Event) =>
      chatAction.send((event as CustomEvent<string>).detail);
    window.addEventListener("vrspace-send-chat", sendChat);
    const shareBrowser = (event: Event) => {
      const url = (event as CustomEvent<string>).detail;
      browserAction.send(url);
      if (sharedWorldScreen) applySharedMedia(sharedWorldScreen, url);
    };
    window.addEventListener("davespace-share-browser", shareBrowser);
    room.onPeerJoin = (peerId) => {
      ensurePeer(peerId);
      publishPresence();
      publishPlayers();
      nameAction.send(playerName, { target: peerId });
      avatarAction.send(avatarId, { target: peerId });
      if (audioStream) room.addStream(audioStream, { target: peerId });
    };
    room.onPeerLeave = (peerId) => {
      const departingName = remoteNames.get(peerId) ?? "A player";
      const avatar = remoteAvatars.get(peerId);
      if (avatar) scene.remove(avatar);
      remoteAvatars.delete(peerId);
      publishPresence();
      publishPlayers();
      peerAudio.get(peerId)?.remove();
      peerAudio.delete(peerId);
      showHUDNotice(camera, `${departingName} left the world`, "#ff8dbb");
      window.dispatchEvent(new CustomEvent("davespace-system-notification", { detail: `${departingName} left the world` }));
    };
    room.onPeerStream = (stream, peerId) => {
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.volume = 1;
      document.body.appendChild(audio);
      void audio.play().catch(() => undefined);
      peerAudio.set(peerId, audio);
    };
    const unlockAudio = () =>
      peerAudio.forEach((audio) => void audio.play().catch(() => undefined));
    window.addEventListener("vrspace-enable-audio", unlockAudio);
    nameAction.send(playerName);
    avatarAction.send(avatarId);
    let currentAvatarId = avatarId;
    const changeLocalAvatar = (event: Event) => {
      currentAvatarId = (event as CustomEvent<string>).detail;
      avatarAction.send(currentAvatarId);
    };
    window.addEventListener("davespace-avatar-changed", changeLocalAvatar);
    let sharedAudioStream = audioStream;
    const micHUD = makeMicHUD(!sharedAudioStream);
    camera.add(micHUD);
    if (sharedAudioStream) room.addStream(sharedAudioStream);
    const changeAudioStream = (event: Event) => {
      const next = (event as CustomEvent<MediaStream | null>).detail;
      if (sharedAudioStream) room.removeStream(sharedAudioStream);
      sharedAudioStream = next;
      if (sharedAudioStream) room.addStream(sharedAudioStream);
      updateMicHUD(micHUD, !sharedAudioStream);
    };
    window.addEventListener("davespace-audio-stream", changeAudioStream);
    const body = makeBody();
    camera.add(body);
    let localAvatar = makeRemoteAvatar(playerName, null, avatarId);
    localAvatar.visible = false;
    localAvatar.getObjectByName("nameplate-spine-anchor")!.visible = false;
    rig.add(localAvatar);
    loadTemplate(avatarId, () => {
      const upgraded = makeRemoteAvatar(playerName, avatarTemplates.get(templateKey(avatarId)) ?? null, avatarId);
      upgraded.visible = localAvatar.visible;
      upgraded.getObjectByName("nameplate-spine-anchor")!.visible = false;
      rig.remove(localAvatar);
      localAvatar = upgraded;
      rig.add(localAvatar);
    });
    let thirdPerson = false;
    const toggleThirdPerson = () => {
      if (renderer.xr.isPresenting) return;
      thirdPerson = !thirdPerson;
      localAvatar.visible = thirdPerson;
      body.visible = !thirdPerson;
      if (!thirdPerson) camera.position.set(0, 1.7, 0);
      showHUDNotice(camera, thirdPerson ? "Third-person view" : "First-person view", "#72ffd0");
    };
    window.addEventListener("davespace-toggle-third-person", toggleThirdPerson);
    const xrMenu = makeXRMenu(playerName);
    xrMenu.visible = false;
    scene.add(xrMenu);
    const toggleXRMenu = () => {
      if (!renderer.xr.isPresenting) {
        window.dispatchEvent(new Event("vrspace-toggle-menu"));
        return;
      }
      xrMenu.visible = !xrMenu.visible;
      if (xrMenu.visible) {
        grips[0].add(xrMenu);
        xrMenu.position.set(.16, .2, -.34);
        xrMenu.rotation.set(0, 0, 0);
        xrMenu.scale.setScalar(.52);
      }
    };
    const controllers = [
        renderer.xr.getController(0),
        renderer.xr.getController(1),
      ],
      grips = [renderer.xr.getControllerGrip(0), renderer.xr.getControllerGrip(1)],
      ray = new THREE.Raycaster();
    const portals: THREE.Mesh[] = [];
    const projectiles: THREE.Mesh[] = [];
    hitAction.onMessage = () => {
      showHUDNotice(camera, "TAGGED! Respawning…", "#ff5f91");
      rig.position.y += 1.2;
      window.setTimeout(() => rig.position.set(Math.cos(spawnAngle) * 2.4, 0, Math.sin(spawnAngle) * 2.4), 900);
    };
    let comfortMode = false;
    const menuTargets: THREE.Mesh[] = [];
    const refreshMenuTargets = () => {
      menuTargets.length = 0;
      xrMenu.traverse((object) => {
        if ((object as THREE.Mesh).isMesh && object.userData.action)
          menuTargets.push(object as THREE.Mesh);
      });
    };
    refreshMenuTargets();
    const transitionOutOfXR = (next: () => void) => {
      xrMenu.visible = false;
      const session = renderer.xr.getSession();
      if (session) void session.end().catch(() => undefined).finally(next);
      else next();
    };
    const runMenuAction = (action: string) => {
      if (action.startsWith("page:")) {
        renderXRMenuPage(xrMenu, action.slice(5), playerName);
        refreshMenuTargets();
        return;
      }
      if (action.startsWith("world:")) {
        const destination = action.slice(6) as WorldId;
        transitionOutOfXR(() => window.dispatchEvent(new CustomEvent("davespace-change-world", { detail: destination })));
        return;
      }
      if (action.startsWith("avatar:")) {
        const selected = action.slice(7);
        window.dispatchEvent(new CustomEvent("davespace-avatar-changed", { detail: selected }));
        showXRNotice(xrMenu, "AVATAR EQUIPPED", selected.toUpperCase());
        return;
      }
      if (action === "voice") window.dispatchEvent(new Event("davespace-toggle-mic"));
      if (action === "friends") showXRNotice(xrMenu, "FRIENDS ONLINE", "NovaSkye · PixelFox · OrbitDave");
      if (action === "messages") showXRNotice(xrMenu, "MESSAGES", "NovaSkye: Meet you by the fire!");
      if (action === "comfort") {
        comfortMode = !comfortMode;
        showXRNotice(xrMenu, "COMFORT MODE", comfortMode ? "ON · reduced movement speed" : "OFF · full movement speed");
      }
      if (action === "spawn-cube") spawnTool("cube", scene, grab);
      if (action === "spawn-pen") spawnTool("pen", scene, grab);
      if (action === "spawn-blaster") spawnTool("blaster", scene, grab);
      if (action === "spawn-target") spawnTool("target", scene, grab);
      if (action === "spawn-portal") {
        const portal = spawnTool("portal", scene, grab);
        portals.push(portal);
        placeAction.send({ kind: "portal", p: portal.position.toArray() });
      }
      if (action === "leave") transitionOutOfXR(onExit);
      if (action === "close") xrMenu.visible = false;
      if (action === "recenter") showXRNotice(xrMenu, "MENU RECENTERED", "Raise your left hand to position it");
    };
    placeAction.onMessage = (placed) => {
      if (placed.kind === "portal") {
        const portal = spawnTool("portal", scene, grab);
        portal.position.fromArray(placed.p);
        portals.push(portal);
        showHUDNotice(camera, "A friend dropped a portal", "#72ffd0");
      }
    };
    let held: THREE.Mesh | null = null,
      parent: THREE.Object3D | null = null;
    const controllerHandModels: (THREE.Object3D | null)[] = [null, null];
    const cursors = controllers.map(() => {
      const cursor = new THREE.Mesh(
        new THREE.RingGeometry(.012, .023, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false }),
      );
      cursor.visible = false; cursor.renderOrder = 2000; scene.add(cursor); return cursor;
    });
    controllers.forEach((c, i) => {
      // Controllers must share the locomotion rig or hands stay behind when moving.
      rig.add(c);
      rig.add(grips[i]);
      const controllerHand = new THREE.Group();
      controllerHand.name = "controller-hand-model";
      // Visual hands belong to the physical grip pose. The target-ray pose is
      // only for pointing and is angled differently on Quest controllers.
      grips[i].add(controllerHand);
      new GLTFLoader().load(
        `${import.meta.env.BASE_URL}hands/${i ? "right" : "left"}.glb`,
        (gltf) => {
          const model = gltf.scene;
          model.rotation.set(0, 0, 0);
          model.position.set(0, 0, 0);
          model.traverse((part) => {
            if ((part as THREE.Bone).isBone) {
              part.userData.openQuaternion = part.quaternion.clone();
            }
            if ((part as THREE.Mesh).isMesh) {
              const mesh = part as THREE.Mesh;
              mesh.castShadow = true;
              mesh.material = new THREE.MeshStandardMaterial({
                color: 0x161522,
                emissive: 0x6f36ff,
                emissiveIntensity: 0.28,
                roughness: 0.52,
                metalness: 0.18,
              });
            }
          });
          controllerHand.add(model);
          controllerHandModels[i] = model;
        },
      );
      c.addEventListener("connected", (event) => {
        controllerHand.visible = !(event.data as XRInputSource).hand;
      });
      c.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(),
            new THREE.Vector3(0, 0, -3),
          ]),
          new THREE.LineBasicMaterial({ color: 0x70f1bd }),
        ),
      );
      c.addEventListener("selectstart", () => {
        ray.setFromXRController(c);
        if (xrMenu.visible) {
          xrMenu.updateMatrixWorld(true);
          const menuHit = ray.intersectObjects(menuTargets, false)[0];
          if (menuHit) {
            try {
              runMenuAction(menuHit.object.userData.action);
            } catch {
              renderXRMenuPage(xrMenu, "home", playerName);
              refreshMenuTargets();
              showXRNotice(xrMenu, "MENU RECOVERED", "Please try that option again");
            }
            return;
          }
        }
        if (held?.userData.tool === "blaster") {
          const bolt = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), M(0xffd166, 2));
          c.getWorldPosition(bolt.position);
          bolt.userData.velocity = ray.ray.direction.clone().multiplyScalar(11);
          scene.add(bolt); projectiles.push(bolt); return;
        }
        const interactive = ray.intersectObjects(grab, false)[0]?.object as THREE.Mesh | undefined;
        if (interactive?.userData.activate) {
          interactive.userData.activate();
          if (interactive.userData.suika)
            showHUDNotice(camera, "Fruit dropped!", "#ffd166");
          else
            showHUDNotice(camera, "Shared browser controls opened", "#72ffd0");
          return;
        }
      });
      c.addEventListener("squeezestart", () => {
        ray.setFromXRController(c);
        const h = ray.intersectObjects(grab)[0];
        if (h) {
          held = h.object as THREE.Mesh;
          parent = held.parent;
          c.attach(held);
        }
      });
      c.addEventListener("squeezeend", () => {
        if (held && parent) {
          parent.attach(held);
          held = null;
        }
      });
    });
    const handFactory = new XRHandModelFactory();
    handFactory.setPath(`${import.meta.env.BASE_URL}hands/`);
    const trackedHands = [renderer.xr.getHand(0), renderer.xr.getHand(1)];
    trackedHands.forEach((hand) => {
      const model = handFactory.createHandModel(hand, "mesh");
      hand.add(model);
      rig.add(hand);
    });
    const keys = new Set<string>();
    const mobile = new Set<string>();
    const moveVelocity = new THREE.Vector3();
    const desiredVelocity = new THREE.Vector3();
    let yaw = 0,
      pitch = 0,
      drag = false,
      lastX = 0,
      lastY = 0,
      verticalVelocity = 0,
      jumpWasPressed = false;
    renderer.domElement.tabIndex = 0;
    renderer.domElement.focus();
    const kd = (e: KeyboardEvent) => {
        if (
          [
            "KeyW",
            "KeyA",
            "KeyS",
            "KeyD",
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Space",
          ].includes(e.code)
        )
          e.preventDefault();
        keys.add(e.code);
        if (e.code === "KeyM") toggleXRMenu();
        if (e.code === "KeyV" && !e.repeat) toggleThirdPerson();
        if (e.code === "Escape") toggleXRMenu();
      },
      ku = (e: KeyboardEvent) => keys.delete(e.code),
      look = (e: MouseEvent) => {
        if (document.pointerLockElement === renderer.domElement) {
          yaw -= e.movementX * 0.002;
          pitch = Math.max(-1.3, Math.min(1.3, pitch - e.movementY * 0.002));
        } else if (drag) {
          yaw -= (e.clientX - lastX) * 0.004;
          pitch = Math.max(
            -1.3,
            Math.min(1.3, pitch - (e.clientY - lastY) * 0.004),
          );
          lastX = e.clientX;
          lastY = e.clientY;
        }
      },
      down = (e: PointerEvent) => {
        drag = true;
        lastX = e.clientX;
        lastY = e.clientY;
        renderer.domElement.focus();
      },
      up = () => (drag = false),
      click = (e: MouseEvent) => {
        if (world === "studio" && e.detail === 2) {
          ray.setFromCamera(
            new THREE.Vector2(
              (e.clientX / root.clientWidth) * 2 - 1,
              (-e.clientY / root.clientHeight) * 2 + 1,
            ),
            camera,
          );
          const h = ray.intersectObjects(grab)[0];
          if (h) {
            if (h.object.userData.activate) {
              h.object.userData.activate();
            } else if (h.object.userData.npc) {
              const line = h.object.userData.line as string;
              showHUDNotice(camera, line, "#72ffd0");
              speechSynthesis.speak(new SpeechSynthesisUtterance(line));
            } else {
              h.object.position.x += 0.8;
              if (h.object.position.x > 4) h.object.position.x = -4;
            }
          }
        }
      };
    const mobileMove = (event: Event) => {
      const { direction, active } = (
        event as CustomEvent<{ direction: string; active: boolean }>
      ).detail;
      active ? mobile.add(direction) : mobile.delete(direction);
    };
    addEventListener("keydown", kd, { passive: false });
    addEventListener("keyup", ku);
    addEventListener("mousemove", look);
    addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("dblclick", click);
    window.addEventListener("vrspace-mobile-move", mobileMove);
    const resize = () => {
        renderer.setSize(root.clientWidth, root.clientHeight, false);
        camera.aspect = root.clientWidth / root.clientHeight;
        camera.updateProjectionMatrix();
      },
      ro = new ResizeObserver(resize);
    ro.observe(root);
    resize();
    const clock = new THREE.Clock();
    let lastPose = 0,
      lastTimeSave = 0,
      yWasPressed = false,
      xWasPressed = false;
    const headPosition = new THREE.Vector3(),
      headLocalPosition = new THREE.Vector3(),
      headQuaternion = new THREE.Quaternion();
    const leftPosition = new THREE.Vector3(),
      rightPosition = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05),
        t = clock.elapsedTime;
      if (t - lastTimeSave > 10) {
        const seconds = Number(localStorage.getItem("davespace-world-seconds") ?? 0) + 10;
        localStorage.setItem("davespace-world-seconds", String(seconds));
        lastTimeSave = t;
      }
      if (!renderer.xr.isPresenting) {
        if (thirdPerson) {
          camera.position.set(Math.sin(yaw) * 4.4, 2.65 + pitch * .55, Math.cos(yaw) * 4.4);
          camera.lookAt(0, 1.35, 0);
          localAvatar.rotation.y = yaw;
        } else {
          camera.position.set(0, 1.7, 0);
          camera.rotation.order = "YXZ";
          camera.rotation.set(pitch, yaw, 0);
        }
      }
      let forward =
          (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
          (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) +
          (mobile.has("forward") ? 1 : 0) -
          (mobile.has("back") ? 1 : 0),
        side =
          (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
          (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
          (mobile.has("right") ? 1 : 0) -
          (mobile.has("left") ? 1 : 0);
      if (renderer.xr.isPresenting) {
        let yPressed = false,
          xPressed = false;
        let jumpPressed = false;
        for (const source of renderer.xr.getSession()?.inputSources ?? []) {
          const axes = source.gamepad?.axes;
          if (source.handedness === "left" || source.handedness === "none") {
            const buttons = source.gamepad?.buttons ?? [];
            xPressed = Boolean(buttons[4]?.pressed);
            yPressed = Boolean(buttons[5]?.pressed);
          }
          if (source.handedness === "right") {
            const buttons = source.gamepad?.buttons ?? [];
            jumpPressed = Boolean(buttons[4]?.pressed || buttons[3]?.pressed);
          }
          const handIndex = source.handedness === "right" ? 1 : 0;
          const grip = Math.max(
            source.gamepad?.buttons[0]?.value ?? 0,
            source.gamepad?.buttons[1]?.value ?? 0,
          );
          curlControllerHand(
            controllerHandModels[handIndex],
            grip,
            source.handedness === "right",
          );
          if (axes && axes.length >= 2) {
            const x = axes[axes.length - 2],
              y = axes[axes.length - 1];
            if (source.handedness === "right") {
              // Smooth turn with the right stick.
              if (Math.abs(x) > 0.18) yaw -= x * 2.2 * dt;
            } else {
              // Walk and strafe with the left stick.
              if (Math.abs(x) > 0.15) side += x;
              if (Math.abs(y) > 0.15) forward -= y;
            }
          }
        }
        if (yPressed && !yWasPressed) toggleXRMenu();
        yWasPressed = yPressed;
        if (xPressed && !xWasPressed)
          window.dispatchEvent(new Event("davespace-toggle-mic"));
        xWasPressed = xPressed;
        if (jumpPressed && !jumpWasPressed && rig.position.y <= 0.001)
          verticalVelocity = 5.4;
        jumpWasPressed = jumpPressed;
        rig.rotation.y = yaw;
      } else {
        rig.rotation.y = 0;
      }
      const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)),
        r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)),
        maxSpeed = comfortMode ? 2.6 : keys.has("ShiftLeft") || keys.has("ShiftRight") ? 7 : 4.6;
      desiredVelocity.set(0, 0, 0)
        .addScaledVector(f, forward)
        .addScaledVector(r, side);
      if (desiredVelocity.lengthSq() > 1) desiredVelocity.normalize();
      desiredVelocity.multiplyScalar(maxSpeed);
      const response = desiredVelocity.lengthSq() > .001
        ? (renderer.xr.isPresenting ? 16 : 10)
        : (renderer.xr.isPresenting ? 20 : 7);
      moveVelocity.lerp(desiredVelocity, 1 - Math.exp(-response * dt));
      if (moveVelocity.lengthSq() < .0001) moveVelocity.set(0, 0, 0);
      rig.position.addScaledVector(moveVelocity, dt);
      if ((keys.has("Space") || mobile.has("jump")) && !jumpWasPressed && rig.position.y <= 0.001) {
        verticalVelocity = 5.4;
        jumpWasPressed = true;
      }
      if (!keys.has("Space") && !mobile.has("jump") && !renderer.xr.isPresenting)
        jumpWasPressed = false;
      verticalVelocity -= 13.5 * dt;
      rig.position.y += verticalVelocity * dt;
      if (rig.position.y < 0) {
        rig.position.y = 0;
        verticalVelocity = 0;
      }
      if (t - lastPose > 0.05) {
      const head = renderer.xr.isPresenting
          ? renderer.xr.getCamera()
          : camera;
        if (thirdPerson && !renderer.xr.isPresenting) {
          headPosition.set(rig.position.x, rig.position.y + 1.7, rig.position.z);
          headQuaternion.setFromEuler(new THREE.Euler(0, yaw, 0));
        } else {
          head.getWorldPosition(headPosition);
          head.getWorldQuaternion(headQuaternion);
        }
        // Head is transmitted in locomotion-root space. Quest runtimes expose
        // the XR camera in reference-space coordinates, while its world matrix
        // may omit the application's rig translation.
        headLocalPosition.copy(head.position);
        if (!renderer.xr.isPresenting) headLocalPosition.set(0, 1.7, 0);
        if (headLocalPosition.y < .5 || headLocalPosition.y > 2.6)
          headLocalPosition.set(0, 1.7, 0);
        if (renderer.xr.isPresenting) {
          leftPosition.copy(grips[0].position);
          rightPosition.copy(grips[1].position);
        } else {
          leftPosition.set(-0.32, 1.35, -0.18);
          rightPosition.set(0.32, 1.35, -0.18);
        }
        poseAction.send({
          p: rig.position.toArray(),
          h: headLocalPosition.toArray(),
          q: headQuaternion.toArray(),
          l: leftPosition.toArray(),
          r: rightPosition.toArray(),
        });
        lastPose = t;
      }
      animated.forEach((o, i) => {
        o.rotation.y += dt * (i % 2 ? 0.5 : -0.5);
        o.position.y +=
          (Math.sin(t * 2 + i) - Math.sin((t - dt) * 2 + i)) * 0.025;
      });
      const viewerPosition = new THREE.Vector3();
      (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(viewerPosition);
      remoteAvatars.forEach((avatar) => {
        animateRiggedFace(avatar, t);
        const plate = avatar.getObjectByName("avatar-nameplate");
        if (!plate) return;
        const platePosition = new THREE.Vector3();
        plate.getWorldPosition(platePosition);
        plate.lookAt(viewerPosition.x, platePosition.y, viewerPosition.z);
      });
      animateRiggedFace(localAvatar, t);
      weather?.update(t);
      const hoveredTargets: THREE.Mesh[] = [];
      menuTargets.forEach((target) => {
        (target.material as THREE.MeshBasicMaterial).color.set(0xffffff);
      });
      controllers.forEach((controller, index) => {
        const cursor = cursors[index];
        cursor.visible = false;
        if (!xrMenu.visible) return;
        xrMenu.updateMatrixWorld(true);
        ray.setFromXRController(controller);
        const hit = ray.intersectObjects(menuTargets, false)[0];
        if (hit) {
          hoveredTargets.push(hit.object as THREE.Mesh);
          cursor.visible = true;
          cursor.position.copy(hit.point);
          cursor.quaternion.copy(xrMenu.quaternion);
        }
      });
      if (hoveredTargets[0])
        (hoveredTargets[0].material as THREE.MeshBasicMaterial).color.set(0x8fffe6);
      for (const portal of portals) {
        portal.rotation.z += dt * .75;
        if (portal.position.distanceTo(rig.position) < 1.65 && !portal.userData.used) {
          portal.userData.used = true;
          const order: WorldId[] = ["fireside", "neon", "garden", "studio", "ocean", "moon", "arcade", "gallery"];
          window.dispatchEvent(new CustomEvent("davespace-change-world", { detail: order[(order.indexOf(world) + 1) % order.length] }));
        }
      }
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const bolt = projectiles[i];
        bolt.position.addScaledVector(bolt.userData.velocity, dt);
        const hit = [...remoteAvatars.entries()].find(([, avatar]) => avatar.position.distanceTo(bolt.position) < .65);
        if (hit) {
          hitAction.send("tagged", { target: hit[0] });
          scene.remove(bolt); projectiles.splice(i, 1); continue;
        }
        if (bolt.position.length() > 70) { scene.remove(bolt); projectiles.splice(i, 1); }
      }
      renderer.render(scene, camera);
    });
    return () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      removeEventListener("keydown", kd);
      removeEventListener("keyup", ku);
      removeEventListener("mousemove", look);
      removeEventListener("pointerup", up);
      window.removeEventListener("vrspace-send-chat", sendChat);
      window.removeEventListener("davespace-share-browser", shareBrowser);
      window.removeEventListener("vrspace-mobile-move", mobileMove);
      window.removeEventListener("vrspace-enable-audio", unlockAudio);
      window.removeEventListener("davespace-audio-stream", changeAudioStream);
      window.removeEventListener("davespace-avatar-changed", changeLocalAvatar);
      window.removeEventListener("davespace-toggle-third-person", toggleThirdPerson);
      window.removeEventListener("davespace-select-player", selectPlayer);
      room.leave();
      peerAudio.forEach((audio) => audio.remove());
      const sharedVideo = sharedWorldScreen?.userData.video as HTMLVideoElement | undefined;
      if (sharedVideo) { sharedVideo.pause(); sharedVideo.removeAttribute("src"); sharedVideo.load(); }
      renderer.dispose();
      root.replaceChildren();
    };
  }, [world, playerName, onExit]);
  return <div className="world-scene" ref={host} />;
}
function build(
  w: WorldId,
  s: THREE.Scene,
  a: THREE.Object3D[],
  g: THREE.Mesh[],
) {
  if (w === "fireside") {
    for (let i = 0; i < 25; i++) {
      const n = (i / 25) * Math.PI * 2,
        r = 14 + (i % 4),
        t = new THREE.Group(),
        tr = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.38, 3.2, 6),
          M(0x51311d),
        );
      tr.position.y = 1.6;
      t.add(tr);
      for (let j = 0; j < 3; j++) {
        const c = new THREE.Mesh(
          new THREE.ConeGeometry(1.35 - j * 0.15, 2.6, 7),
          M(j % 2 ? 0x1c4b33 : 0x286344),
        );
        c.position.y = 3 + j * 0.85;
        t.add(c);
      }
      t.position.set(Math.cos(n) * r, 0, Math.sin(n) * r - 2);
      s.add(t);
    }
    const fire = new THREE.Group();
    fire.position.z = -2.5;
    for (let i = 0; i < 10; i++) {
      const n = (i / 10) * Math.PI * 2,
        x = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24), M(0x69716f));
      x.position.set(Math.cos(n) * 0.85, 0.18, Math.sin(n) * 0.85);
      fire.add(x);
    }
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, 0.95, 6),
        M([0xffd45b, 0xff7934, 0xe93620][i % 3], 2.6),
      );
      f.position.set((i - 3) * 0.13, 0.75, Math.sin(i) * 0.13);
      fire.add(f);
      a.push(f);
    }
    const light = new THREE.PointLight(0xff7138, 34, 15);
    light.position.y = 1;
    fire.add(light);
    s.add(fire);
    // Social seating, lanterns and tents make the lobby read as a place rather
    // than a geometry demo while keeping the draw count headset-friendly.
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.65, .24, .42), M(0x6d3c24));
      seat.position.set(Math.cos(angle) * 3.25, .42, Math.sin(angle) * 3.25 - 2.5);
      seat.rotation.y = -angle;
      seat.castShadow = true; s.add(seat);
      const lantern = new THREE.PointLight(0xffba65, 4, 5);
      lantern.position.set(Math.cos(angle) * 5.3, 1.35, Math.sin(angle) * 5.3 - 2.5); s.add(lantern);
    }
    for (const x of [-7, 7]) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.5, 4), M(x < 0 ? 0x7854d8 : 0x2da78f, .08));
      tent.position.set(x, 1.25, -5); tent.rotation.y = Math.PI / 4; tent.castShadow = true; s.add(tent);
    }
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), M(0xdde9ff, 1.1));
    moon.position.set(-10, 12, -22); s.add(moon);
    [[-4, -1, 0xffd166], [4, -2, 0x72ffd0], [0, -6, 0xff6f9f]].forEach(([x, z, color], index) => {
      const pet = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10), M(Number(color), .2));
      body.scale.set(1.35, .8, 1); body.position.y = .28;
      const ear = new THREE.Mesh(new THREE.ConeGeometry(.08, .22, 5), M(Number(color), .12)); ear.position.set(-.1, .52, 0);
      const ear2 = ear.clone(); ear2.position.x = .1;
      const eyes = textSprite("••", "#101329", .16, .07); eyes.position.set(0, .31, -.2);
      pet.add(body, ear, ear2, eyes); pet.position.set(Number(x), 0, Number(z)); pet.userData.petIndex = index;
      s.add(pet); a.push(pet);
    });
    screen(s, g, "browser");
  }
  if (w === "neon") {
    for (let i = 0; i < 18; i++) {
      const h = 3 + ((i * 7) % 9),
        b = new THREE.Mesh(
          new THREE.BoxGeometry(2, h, 2),
          M(i % 2 ? 0x151631 : 0x24204e),
        );
      b.position.set(((i % 6) - 2.5) * 4, h / 2, -7 - Math.floor(i / 6) * 4);
      s.add(b);
    }
    for (let i = 0; i < 9; i++) {
      const x = new THREE.Mesh(
        new THREE.TorusGeometry(2 + i * 0.3, 0.025, 6, 64),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x7c4dff : 0x2fffe2 }),
      );
      x.rotation.x = Math.PI / 2;
      x.position.y = 0.1;
      s.add(x);
      a.push(x);
    }
    const p = new THREE.PointLight(0xff33cc, 35, 25);
    p.position.set(-4, 4, 0);
    s.add(p);
  }
  if (w === "garden") {
    for (let i = 0; i < 40; i++) {
      const n = (i / 40) * Math.PI * 2,
        r = 3 + ((i * 5) % 20),
        h = 0.6 + (i % 5) * 0.13,
        st = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.06, h, 5),
          M(0x3b9f69),
        );
      st.position.set(Math.cos(n) * r, h / 2, Math.sin(n) * r);
      s.add(st);
      const b = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.18 + (i % 3) * 0.05),
        M([0x70f1bd, 0x72b6ff, 0xd78cff][i % 3], 1.7),
      );
      b.position.set(st.position.x, h + 0.1, st.position.z);
      s.add(b);
      a.push(b);
    }
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(5, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x288c9c,
        transparent: true,
        opacity: 0.72,
        roughness: 0.1,
      }),
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.y = 0.03;
    s.add(pond);
  }
  if (w === "studio") {
    s.add(new THREE.GridHelper(30, 30, 0x38bdf8, 0x1c344c));
    for (let i = 0; i < 16; i++) {
      const geo =
          i % 3 === 0
            ? new THREE.BoxGeometry(0.75, 0.75, 0.75)
            : i % 3 === 1
              ? new THREE.SphereGeometry(0.5, 16, 12)
              : new THREE.ConeGeometry(0.5, 1, 6),
        o = new THREE.Mesh(
          geo,
          M([0x38bdf8, 0x70f1bd, 0xff8a5c, 0x9a78ff][i % 4], 0.12),
        );
      o.position.set(
        ((i % 4) - 1.5) * 2,
        0.55,
        (Math.floor(i / 4) - 1.5) * 2 - 2,
      );
      o.castShadow = true;
      s.add(o);
      g.push(o);
    }
    screen(s, g);
  }
  if (["ocean", "moon", "arcade", "gallery"].includes(w)) {
    const colors: Record<string, number[]> = {
      ocean: [0x29d9ff, 0x0a718f, 0x72ffd0], moon: [0xd9e4ff, 0x687499, 0x91a7ff],
      arcade: [0xff4fad, 0x754dff, 0x39f1da], gallery: [0xffcf73, 0xf28f52, 0x76d5ff],
    };
    const c = colors[w];
    for (let i = 0; i < 28; i++) {
      const angle = i * 0.73, radius = 3 + (i % 7) * 1.65;
      const geometry = w === "ocean" ? new THREE.ConeGeometry(.25, 1.6, 7)
        : w === "moon" ? new THREE.DodecahedronGeometry(.35 + (i % 3) * .12)
        : w === "arcade" ? new THREE.BoxGeometry(.6, 1.1, .35)
        : new THREE.TorusKnotGeometry(.2, .06, 40, 7);
      const object = new THREE.Mesh(geometry, M(c[i % 3], .35));
      object.position.set(Math.cos(angle) * radius, .7 + (i % 4) * .45, Math.sin(angle) * radius - 3);
      object.castShadow = true; s.add(object); a.push(object);
    }
    if (w === "arcade") screen(s, g, "suika");
    if (w === "gallery") screen(s, g);
  }
}
function addAtmosphere(scene: THREE.Scene, world: WorldId) {
  const count = 900,
    positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const radius = 4 + Math.random() * 27,
      angle = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0.4 + Math.random() * 13;
    positions[i * 3 + 2] = Math.sin(angle) * radius - 4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const color =
    world === "fireside"
      ? 0xffb86b
      : world === "neon"
        ? 0x8b5cff
        : world === "garden"
          ? 0x70f1bd
          : 0x38bdf8;
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { pointColor: { value: new THREE.Color(color) } },
    vertexShader:
      "void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=18./-p.z;gl_Position=projectionMatrix*p;}",
    fragmentShader:
      "uniform vec3 pointColor;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);gl_FragColor=vec4(pointColor,a*.65);}",
  });
  scene.add(new THREE.Points(geometry, material));
}
function makeCampfireWeather(scene: THREE.Scene) {
  const count = 520;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - .5) * 34;
    positions[i * 3 + 1] = Math.random() * 14;
    positions[i * 3 + 2] = (Math.random() - .5) * 34;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xa9ddff, size: .035, transparent: true, opacity: .58 }));
  rain.visible = false; scene.add(rain);
  let nextChange = 18, mode = 0;
  return { update(time: number) {
    if (time > nextChange) {
      mode = (mode + 1 + Math.floor(Math.random() * 2)) % 3;
      rain.visible = mode === 2;
      scene.background = new THREE.Color(mode === 0 ? 0x071019 : mode === 1 ? 0x241737 : 0x07131f);
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density = mode === 2 ? .046 : .024;
      nextChange = time + 28 + Math.random() * 38;
      window.dispatchEvent(new CustomEvent("davespace-system-notification", { detail: ["Campfire skies are clear", "Aurora moving overhead", "A rain shower is passing through"][mode] }));
    }
    if (rain.visible) {
      const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        let y = attr.getY(i) - .13;
        if (y < .1) y = 14;
        attr.setY(i, y);
      }
      attr.needsUpdate = true;
    }
  }};
}
function screen(s: THREE.Scene, grab: THREE.Mesh[], mode?: "browser" | "suika") {
  const f = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.2, 0.2), M(0x101b28));
  f.position.set(0, 2.5, -9);
  s.add(f);
  const d = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 2.8),
    new THREE.MeshBasicMaterial({ color: 0x1c5b78 }),
  );
  d.position.set(0, 2.5, -8.88);
  s.add(d);
  if (mode === "browser") {
    d.name = "shared-browser-screen";
    const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0,0,960,540); gradient.addColorStop(0,"#17143f"); gradient.addColorStop(1,"#073342");
    ctx.fillStyle=gradient; ctx.fillRect(0,0,960,540); ctx.fillStyle="#72ffd0"; ctx.font="900 54px system-ui"; ctx.fillText("SHARED SCREEN",56,88);
    ctx.fillStyle="#fff"; ctx.font="800 34px system-ui"; ctx.fillText("Browse · watch · listen together",56,160);
    ctx.fillStyle="#aeb7d4"; ctx.font="600 25px system-ui"; ctx.fillText("Point + trigger to open media controls",56,440);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    (d.material as THREE.MeshBasicMaterial).map=texture; (d.material as THREE.MeshBasicMaterial).color.set(0xffffff);
    d.userData.activate=()=>window.dispatchEvent(new Event("vrspace-toggle-menu")); grab.push(d);
  }
  if (mode === "suika") {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext("2d")!; let score = Number(localStorage.getItem("davespace-suika-score") ?? 0);
    const draw = () => {
      const gradient = ctx.createLinearGradient(0,0,640,360); gradient.addColorStop(0,"#35236f"); gradient.addColorStop(1,"#112d42");
      ctx.fillStyle=gradient; ctx.fillRect(0,0,640,360); ctx.fillStyle="#fff"; ctx.font="900 34px system-ui"; ctx.fillText("SUIKA CAMP",28,48);
      ctx.fillStyle="#72ffd0"; ctx.font="700 20px system-ui"; ctx.fillText(`SCORE  ${score}`,470,45);
      const fruit=["🍒","🍓","🍇","🍋","🍊","🍎","🍐","🍑","🍍","🍈","🍉"];
      ctx.font="48px serif"; for(let i=0;i<18;i++) ctx.fillText(fruit[(i+score)%fruit.length],35+(i%9)*66,125+Math.floor(i/9)*90+(i%3)*10);
      const minutes=Math.floor(Number(localStorage.getItem("davespace-world-seconds")??0)/60);
      ctx.fillStyle="#ffd166"; ctx.font="800 18px system-ui"; ctx.fillText(`POINT + TRIGGER TO DROP · TIME IN WORLDS ${minutes}m`,28,335);
    };
    draw(); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    (d.material as THREE.MeshBasicMaterial).map=texture; (d.material as THREE.MeshBasicMaterial).color.set(0xffffff);
    d.userData.suika=true; d.userData.activate=()=>{ score += 1 + Math.floor(Math.random()*8); localStorage.setItem("davespace-suika-score",String(score)); draw(); texture.needsUpdate=true; };
    grab.push(d);
  }
}

function applySharedMedia(screen: THREE.Mesh, url: string) {
  const previous = screen.userData.video as HTMLVideoElement | undefined;
  if (previous) { previous.pause(); previous.removeAttribute("src"); previous.load(); }
  const isDirectMedia = /\.(mp4|webm|ogv|mov|m4v)(?:[?#]|$)/i.test(url);
  if (isDirectMedia) {
    const video = document.createElement("video");
    video.src = url; video.crossOrigin = "anonymous"; video.playsInline = true;
    video.loop = true; video.volume = .85; video.preload = "auto";
    const texture = new THREE.VideoTexture(video); texture.colorSpace = THREE.SRGBColorSpace;
    const material = screen.material as THREE.MeshBasicMaterial;
    material.map?.dispose(); material.map = texture; material.color.set(0xffffff); material.needsUpdate = true;
    screen.userData.video = video;
    screen.userData.activate = () => video.paused ? void video.play().catch(() => undefined) : video.pause();
    void video.play().catch(() => undefined);
    return;
  }
  const canvas = document.createElement("canvas"); canvas.width = 960; canvas.height = 540;
  const ctx = canvas.getContext("2d")!; ctx.fillStyle="#0b1028"; ctx.fillRect(0,0,960,540);
  ctx.fillStyle="#72ffd0"; ctx.font="900 50px system-ui"; ctx.fillText("SHARED BROWSER",52,82);
  ctx.fillStyle="#fff"; ctx.font="700 29px system-ui"; ctx.fillText("This page is synchronized for everyone",52,145);
  ctx.fillStyle="#aeb7d4"; ctx.font="600 23px system-ui";
  const display = url.length > 62 ? `${url.slice(0,59)}…` : url; ctx.fillText(display,52,225);
  ctx.fillStyle="#ffd166"; ctx.fillText("Point + trigger to open the browser and media controls",52,455);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  const material = screen.material as THREE.MeshBasicMaterial; material.map?.dispose(); material.map=texture; material.color.set(0xffffff); material.needsUpdate=true;
  screen.userData.video = undefined;
  screen.userData.activate = () => window.dispatchEvent(new Event("vrspace-toggle-menu"));
}
function makeRemoteAvatar(
  name: string,
  template: THREE.Object3D | null = null,
  avatarId = "striker",
) {
  const group = new THREE.Group();
  const isAdmin = name.trim().toLowerCase() === "dave";
  const skin = M(0xd5a17d),
    cloth = M(0x536fff, 0.08);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.205, 3), M(0x15172a, .18));
  head.name = "avatar-head";
  head.position.y = 1.67;
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(.165, 20, 10, -.95, 1.9, .72, 1.05),
    new THREE.MeshPhysicalMaterial({ color: 0x5cf4ea, emissive: 0x5b38ff, emissiveIntensity: 1.3, metalness: .55, roughness: .12 }),
  );
  visor.rotation.x = -.18;
  visor.position.set(0, .01, -.105);
  head.add(visor);
  if (isAdmin) {
    (head.material as THREE.MeshStandardMaterial).color.set(0xd5a17d);
    visor.visible = false;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.19, 14, 8, 0, Math.PI * 2, 0, 1.4), M(0xffffff, .05));
    hair.position.y = .1;
    const beard = new THREE.Mesh(new THREE.ConeGeometry(.13, .28, 12), M(0xffffff, .04));
    beard.position.set(0, -.18, -.12); beard.rotation.x = Math.PI;
    head.add(hair, beard);
  }
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.42, 5, 10),
    cloth,
  );
  torso.position.y = 1.12;
  if (template) {
    const model = cloneSkeleton(template);
    const initialBox = new THREE.Box3().setFromObject(model);
    const height = initialBox.getSize(new THREE.Vector3()).y || 1;
    model.scale.setScalar(1.68 / height);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.position.y = -box.min.y;
    model.rotation.y = Math.PI;
    model.name = "rigged-human-model";
    model.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) {
        const mesh = part as THREE.Mesh;
        mesh.castShadow = true;
        const avatarTints: Record<string, number> = { coral: 0xff648d, mint: 0x38e0bd, sapphire: 0x3b82f6, solar: 0xffd166, violet: 0xa56bff, arctic: 0xe8f4ff };
        if (avatarTints[avatarId] || isAdmin) {
          const material = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
          if (material.color) material.color.lerp(new THREE.Color(isAdmin ? 0xffffff : avatarTints[avatarId]), isAdmin ? .88 : .38);
          mesh.material = material;
        }
      }
    });
    group.add(model);
    head.visible = false;
    torso.visible = false;
  }
  group.add(head, torso);
  for (const [side, x] of [
    ["left-hand", -0.35],
    ["right-hand", 0.35],
  ] as const) {
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.11, 5, 10), skin);
    hand.name = side;
    hand.position.set(x, 1.25, -0.15);
    hand.visible = !template;
    group.add(hand);
  }
  for (const [name, x] of [["left-arm", -0.2], ["right-arm", 0.2]] as const) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 5, 10), cloth);
    arm.name = name;
    arm.position.set(x, 1.15, 0);
    arm.visible = !template;
    group.add(arm);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(4,12,18,.82)";
  context.roundRect(8, 8, 496, 112, 34);
  context.fill();
  if (isAdmin) { context.strokeStyle = "#ffd166"; context.lineWidth = 8; context.stroke(); }
  context.font = "700 48px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = isAdmin ? "#ffd166" : "#70f1bd";
  context.fillText(isAdmin ? "★ ADMIN · DAVE" : name.slice(0, 20), 256, 66);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, .45),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
  label.name = "avatar-nameplate";
  label.renderOrder = 1200;
  const spineAnchor = new THREE.Group();
  spineAnchor.name = "nameplate-spine-anchor";
  spineAnchor.position.y = 1.42;
  label.position.y = 0.7;
  spineAnchor.add(label);
  group.add(spineAnchor);
  const selectionCapsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(.42, 1.15, 10, 24),
    new THREE.MeshBasicMaterial({
      color: 0x8b72ff,
      transparent: true,
      opacity: .16,
      depthWrite: false,
      wireframe: true,
    }),
  );
  selectionCapsule.name = "player-selection-capsule";
  selectionCapsule.position.y = .93;
  selectionCapsule.visible = false;
  selectionCapsule.renderOrder = 1100;
  group.add(selectionCapsule);
  return group;
}
function animateRiggedFace(avatar: THREE.Object3D, time: number) {
  if (avatar.userData.faceParts === undefined) {
    const eyes: THREE.Object3D[] = [];
    avatar.traverse((part) => {
      if (/^eyes?$/i.test(part.name)) {
        part.userData.openScaleY = part.scale.y;
        eyes.push(part);
      }
    });
    avatar.userData.faceParts = eyes;
    avatar.userData.blinkOffset = Math.random() * 4.2;
  }
  const phase = (time + avatar.userData.blinkOffset) % 4.2;
  const blink = phase > 3.98 && phase < 4.16
    ? Math.max(.06, Math.abs(phase - 4.07) / .09)
    : 1;
  (avatar.userData.faceParts as THREE.Object3D[]).forEach((eye) => {
    eye.scale.y = (eye.userData.openScaleY ?? 1) * blink;
  });
}
function curlControllerHand(
  model: THREE.Object3D | null,
  amount: number,
  right: boolean,
) {
  if (!model) return;
  model.traverse((part) => {
    if (!(part as THREE.Bone).isBone || !part.userData.openQuaternion) return;
    const name = part.name.toLowerCase();
    if (!/(thumb|index|middle|ring|little|pinky)/.test(name)) return;
    const base = (part.userData.openQuaternion as THREE.Quaternion).clone();
    const curl = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        0,
        0,
        (right ? -1 : 1) * amount * (name.includes("thumb") ? 0.55 : 1.15),
      ),
    );
    part.quaternion.slerp(base.multiply(curl), 0.35);
  });
}
function makeXRMenu(playerName: string) {
  const group = new THREE.Group();
  group.name = "davespace-xr-dashboard";
  renderXRMenuPage(group, "home", playerName);
  return group;
}

function renderXRMenuPage(group: THREE.Group, page: string, playerName: string) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(object as THREE.Sprite).isSprite) return;
    if (mesh.isMesh) mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      const textured = material as THREE.MeshBasicMaterial;
      textured.map?.dispose();
      material.dispose();
    });
  });
  group.clear();
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.32),
    new THREE.MeshBasicMaterial({
      map: makeMenuSurface(playerName),
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
    }),
  );
  group.add(panel);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.54, 1.36),
    new THREE.MeshBasicMaterial({ color: 0x774cff, side: THREE.DoubleSide }),
  );
  glow.position.z = -0.006;
  group.add(glow);
  const pages: Record<string, [string, string][]> = {
    home: [["page:worlds","◈  WORLDS"],["page:social","◎  SOCIAL"],["page:create","✦  CREATE"],["page:avatar","♙  AVATAR"],["page:settings","⚙  SETTINGS"],["voice","◉  VOICE"],["leave","↗  LEAVE"],["close","×  CLOSE"]],
    worlds: [["world:fireside","🔥 CAMPFIRE"],["world:neon","◆ NEON"],["world:garden","✦ GARDEN"],["world:studio","⬡ STUDIO"],["world:ocean","≈ OCEAN"],["world:moon","◐ MOON"],["world:arcade","✣ ARCADE"],["world:gallery","◇ GALLERY"],["page:home","← BACK"]],
    social: [["friends","◎ FRIENDS ONLINE"],["messages","✦ MESSAGES"],["voice","◉ VOICE TOGGLE"],["page:home","← BACK"]],
    create: [["spawn-pen","✎ SPAWN PEN"],["spawn-cube","⬡ SPAWN BLOCK"],["spawn-portal","◉ DROP PORTAL"],["spawn-blaster","⚡ BLASTER"],["page:home","← BACK"]],
    avatar: [["avatar:explorer","CAMP EXPLORER"],["avatar:striker","NIGHT STRIKER"],["avatar:coral","CORAL SCOUT"],["avatar:mint","MINT VOYAGER"],["avatar:sapphire","SAPPHIRE PILOT"],["avatar:solar","SOLAR RANGER"],["avatar:violet","VIOLET DRIFTER"],["avatar:arctic","ARCTIC WALKER"],["page:home","← BACK"]],
    settings: [["comfort","COMFORT MODE"],["voice","MICROPHONE"],["recenter","RECENTER MENU"],["page:home","← BACK"]],
  };
  const title = textSprite(page === "home" ? `DAVESPACE · ${playerName}` : page.toUpperCase(), "#ffffff", .72, .08);
  title.position.set(0, .47, .02); group.add(title);
  (pages[page] ?? pages.home).forEach(([action, label], index) => {
    const button = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.17),
      new THREE.MeshBasicMaterial({
        map: makeMenuButton(label, action === "leave" ? "danger" : action.includes("back") ? "tool" : "primary"),
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    button.position.set(
      index % 2 ? 0.34 : -0.34,
      0.27 - Math.floor(index / 2) * 0.205,
      0.012,
    );
    button.userData.action = action;
    group.add(button);
  });
  if ((pages[page] ?? pages.home).length < 9) {
    const footer = textSprite("Y  CLOSE     X  MUTE     TRIGGER  SELECT", "#a9b4da", 0.78, 0.045);
    footer.position.set(0, -0.59, 0.022);
    group.add(footer);
  }
  group.userData.page = page;
}

function makeMenuSurface(playerName: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(.64, .62745);
  const gradient = ctx.createLinearGradient(0, 0, 1200, 816);
  gradient.addColorStop(0, "#17143f");
  gradient.addColorStop(0.55, "#090d25");
  gradient.addColorStop(1, "#071b28");
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.roundRect(8, 8, 1184, 800, 54); ctx.fill();
  ctx.strokeStyle = "rgba(137,112,255,.9)"; ctx.lineWidth = 6; ctx.stroke();
  ctx.fillStyle = "#7657ff"; ctx.beginPath(); ctx.arc(72, 70, 34, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#62f4d3"; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(72, 70, 50, 18, -0.45, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = "900 46px system-ui"; ctx.fillText("DAVESPACE", 135, 84);
  ctx.fillStyle = "#aeb7db"; ctx.font = "600 22px system-ui"; ctx.fillText("QUICK MENU", 426, 82);
  ctx.fillStyle = "#61f1cf"; ctx.textAlign = "right"; ctx.fillText(`${playerName.toUpperCase()}  •  LIVE`, 1120, 82);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,.055)"; ctx.beginPath(); ctx.roundRect(48, 128, 1104, 590, 34); ctx.fill();
  ctx.fillStyle = "#8f9ac4"; ctx.font = "700 20px system-ui"; ctx.fillText("SOCIAL & TRAVEL", 85, 168); ctx.fillText("CREATE & PLAY", 635, 168);
  ctx.fillStyle = "#fff"; ctx.font = "800 28px system-ui"; ctx.fillText("Point and pull the trigger", 85, 690);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeMenuButton(label: string, tone: "primary" | "tool" | "danger") {
  const canvas = document.createElement("canvas");
  canvas.width = 384; canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(384 / 620, 96 / 150);
  const colors = tone === "danger" ? ["#6f2448", "#421a38"] : tone === "tool" ? ["#145168", "#133246"] : ["#4936a5", "#29245f"];
  const gradient = ctx.createLinearGradient(0, 0, 620, 150);
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(4, 4, 612, 142, 30); ctx.fill();
  ctx.strokeStyle = tone === "danger" ? "#ff6fae" : tone === "tool" ? "#58e8ed" : "#9d8aff"; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = "800 30px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, 310, 77);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function showXRNotice(menu: THREE.Group, title: string, message: string) {
  menu.getObjectByName("xr-notice")?.removeFromParent();
  const notice = new THREE.Group();
  notice.name = "xr-notice";
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(1.08, 0.22),
    new THREE.MeshBasicMaterial({ color: 0x17143f, transparent: true, opacity: 0.98 }),
  );
  notice.add(card);
  const heading = textSprite(title, "#71f3d0", 0.25, 0.05);
  heading.position.set(-0.34, 0.045, 0.01);
  const body = textSprite(message, "#ffffff", 0.7, 0.045);
  body.position.set(0.1, -0.04, 0.01);
  notice.add(heading, body);
  notice.position.set(0, -0.62, 0.03);
  menu.add(notice);
  window.setTimeout(() => notice.removeFromParent(), 4200);
}

function showHUDNotice(camera: THREE.Camera, message: string, color: string) {
  const notice = textSprite(message, color, 0.72, 0.08);
  notice.position.set(0, 0.34, -1.05);
  notice.renderOrder = 999;
  camera.add(notice);
  window.setTimeout(() => notice.removeFromParent(), 3800);
}

function makeMicHUD(muted: boolean) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeMicTexture(muted),
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    }),
  );
  sprite.name = "microphone-status";
  sprite.position.set(-0.42, -0.27, -1);
  sprite.scale.set(0.09, 0.09, 1);
  sprite.renderOrder = 1000;
  return sprite;
}

function updateMicHUD(sprite: THREE.Sprite, muted: boolean) {
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.map = makeMicTexture(muted);
  material.needsUpdate = true;
}

function makeMicTexture(muted: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = muted ? "#ef334f" : "#ffffff";
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.roundRect(48, 22, 32, 55, 16); ctx.fill();
  ctx.beginPath(); ctx.arc(64, 62, 31, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(64, 93); ctx.lineTo(64, 109); ctx.moveTo(45, 109); ctx.lineTo(83, 109); ctx.stroke();
  if (muted) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(28, 25); ctx.lineTo(101, 103); ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function spawnTool(kind: "cube" | "pen" | "target" | "portal" | "blaster", scene: THREE.Scene, grab: THREE.Mesh[]) {
  const geometry = kind === "pen"
    ? new THREE.CylinderGeometry(0.025, 0.025, 0.48, 10)
    : kind === "blaster"
      ? new THREE.BoxGeometry(.12, .18, .48)
    : kind === "target" || kind === "portal"
      ? new THREE.TorusGeometry(0.42, 0.08, 10, 28)
      : new THREE.BoxGeometry(0.42, 0.42, 0.42);
  const object = new THREE.Mesh(geometry, M(kind === "pen" ? 0xffd45b : kind === "target" ? 0xff4fa3 : 0x6f7cff, 0.45));
  object.position.set((Math.random() - 0.5) * 1.2, 1.25, -2.2);
  object.castShadow = true;
  object.userData.tool = kind;
  scene.add(object);
  grab.push(object);
  return object;
}

function updateAvatarLimb(
  avatar: THREE.Group,
  name: string,
  shoulder: THREE.Vector3,
  hand?: THREE.Vector3,
) {
  const limb = avatar.getObjectByName(name) as THREE.Mesh | undefined;
  if (!limb || !hand) return;
  const direction = hand.clone().sub(shoulder);
  const length = Math.max(0.12, direction.length());
  limb.position.copy(shoulder).addScaledVector(direction, 0.5);
  limb.scale.set(1, length / 0.6, 1);
  limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}
function textSprite(
  text: string,
  color: string,
  width: number,
  height: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "800 48px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 64);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(width, height, 1);
  return sprite;
}
function makeBody() {
  const g = new THREE.Group(),
    cloth = M(0x536fff),
    skin = M(0xd5a17d);
  // Body is head-relative so looking down shows the local chest and arms.
  g.position.set(0, -0.67, -0.16);
  for (const x of [-0.28, 0.28]) {
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055, 0.4, 4, 8),
      cloth,
    );
    arm.position.set(x, -0.08, 0);
    arm.rotation.z = x > 0 ? -0.25 : 0.25;
    g.add(arm);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skin);
    h.position.set(x * 1.25, -0.35, 0);
    g.add(h);
  }
  const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.38, 4, 10), cloth);
  c.position.y = -0.18;
  g.add(c);
  return g;
}
