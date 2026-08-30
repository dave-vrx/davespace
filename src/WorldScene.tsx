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
    const remoteAvatars = new Map<string, THREE.Group>();
    const remoteNames = new Map<string, string>();
    const remoteAvatarIds = new Map<string, string>();
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
    const ensurePeer = (peerId: string) => {
      let avatar = remoteAvatars.get(peerId);
      if (!avatar) {
        const selected = remoteAvatarIds.get(peerId) ?? "explorer";
        avatar = makeRemoteAvatar(
          remoteNames.get(peerId) ?? "Guest",
          avatarTemplates.get(templateKey(selected)) ?? null,
          selected,
        );
        remoteAvatars.set(peerId, avatar);
        scene.add(avatar);
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
      showHUDNotice(camera, `${peerName} joined the world`, "#72ffd0");
      window.dispatchEvent(new CustomEvent("davespace-system-notification", { detail: `${peerName} joined the world` }));
    };
    avatarAction.onMessage = (selected, { peerId }) => {
      remoteAvatarIds.set(peerId, selected);
      loadTemplate(selected, () => rebuildPeer(peerId));
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
      if (left) left.position.copy(avatar.worldToLocal(new THREE.Vector3().fromArray(pose.l)));
      if (right) right.position.copy(avatar.worldToLocal(new THREE.Vector3().fromArray(pose.r)));
      const remoteHead = avatar.getObjectByName("avatar-head");
      if (remoteHead && pose.h)
        remoteHead.position.copy(
          avatar.worldToLocal(new THREE.Vector3().fromArray(pose.h)),
        );
      updateAvatarLimb(avatar, "left-arm", new THREE.Vector3(-0.22, 1.42, 0), left?.position);
      updateAvatarLimb(avatar, "right-arm", new THREE.Vector3(0.22, 1.42, 0), right?.position);
    };
    chatAction.onMessage = (message) => {
      window.dispatchEvent(
        new CustomEvent("vrspace-chat", { detail: message }),
      );
    };
    browserAction.onMessage = (url) => {
      window.dispatchEvent(new CustomEvent("davespace-browser-url", { detail: url }));
    };
    const sendChat = (event: Event) =>
      chatAction.send((event as CustomEvent<string>).detail);
    window.addEventListener("vrspace-send-chat", sendChat);
    const shareBrowser = (event: Event) =>
      browserAction.send((event as CustomEvent<string>).detail);
    window.addEventListener("davespace-share-browser", shareBrowser);
    room.onPeerJoin = (peerId) => {
      ensurePeer(peerId);
      publishPresence();
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
        const head = new THREE.Vector3();
        renderer.xr.getCamera().getWorldPosition(head);
        grips[0].getWorldPosition(xrMenu.position);
        xrMenu.position.add(new THREE.Vector3(0, 0.28, -0.12).applyQuaternion(rig.quaternion));
        xrMenu.lookAt(head);
        xrMenu.scale.setScalar(0.68);
      }
    };
    const controllers = [
        renderer.xr.getController(0),
        renderer.xr.getController(1),
      ],
      grips = [renderer.xr.getControllerGrip(0), renderer.xr.getControllerGrip(1)],
      ray = new THREE.Raycaster();
    const portals: THREE.Mesh[] = [];
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
          const menuHit = ray
            .intersectObjects(xrMenu.children, true)
            .find((hit) => hit.object.userData.action);
          if (menuHit) {
            const action = menuHit.object.userData.action;
            if (action === "voice")
              window.dispatchEvent(new Event("davespace-toggle-mic"));
            if (action === "social")
              showXRNotice(xrMenu, "FRIENDS", "NovaSkye · PixelFox · OrbitDave");
            if (action === "worlds") {
              const order: WorldId[] = ["fireside", "neon", "garden", "studio", "ocean", "moon", "arcade", "gallery"];
              window.dispatchEvent(new CustomEvent("davespace-change-world", {
                detail: order[(order.indexOf(world) + 1) % order.length],
              }));
            }
            if (action === "messages")
              showXRNotice(xrMenu, "MESSAGES", "Open world chat · notifications enabled");
            if (action === "avatar")
              showXRNotice(xrMenu, "AVATAR", `Equipped: ${avatarId} · use desktop selector for previews`);
            if (action === "settings")
              showXRNotice(xrMenu, "SETTINGS", "Y menu · X mute · comfort turning enabled");
            if (action === "spawn-cube") spawnTool("cube", scene, grab);
            if (action === "spawn-pen") spawnTool("pen", scene, grab);
            if (action === "spawn-target") spawnTool("target", scene, grab);
            if (action === "spawn-portal") {
              const portal = spawnTool("portal", scene, grab);
              portals.push(portal);
              placeAction.send({ kind: "portal", p: portal.position.toArray() });
            }
            if (action === "leave") onExit();
            if (action === "close") xrMenu.visible = false;
            return;
          }
        }
        const h = ray.intersectObjects(grab)[0];
        if (h) {
          held = h.object as THREE.Mesh;
          parent = held.parent;
          c.attach(held);
        }
      });
      c.addEventListener("selectend", () => {
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
            if (h.object.userData.npc) {
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
      yWasPressed = false,
      xWasPressed = false;
    const headPosition = new THREE.Vector3(),
      headQuaternion = new THREE.Quaternion();
    const leftPosition = new THREE.Vector3(),
      rightPosition = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05),
        t = clock.elapsedTime;
      if (!renderer.xr.isPresenting) {
        camera.rotation.order = "YXZ";
        camera.rotation.set(pitch, yaw, 0);
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
        speed =
          (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 7 : 4.6) * dt;
      if (forward) rig.position.addScaledVector(f, forward * speed);
      if (side) rig.position.addScaledVector(r, side * speed);
      if (keys.has("Space") && !jumpWasPressed && rig.position.y <= 0.001) {
        verticalVelocity = 5.4;
        jumpWasPressed = true;
      }
      if (!keys.has("Space") && !renderer.xr.isPresenting)
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
        head.getWorldPosition(headPosition);
        head.getWorldQuaternion(headQuaternion);
        if (renderer.xr.isPresenting) {
          grips[0].getWorldPosition(leftPosition);
          grips[1].getWorldPosition(rightPosition);
        } else {
          leftPosition
            .copy(headPosition)
            .add(
              new THREE.Vector3(-0.32, -0.35, -0.18).applyQuaternion(
                headQuaternion,
              ),
            );
          rightPosition
            .copy(headPosition)
            .add(
              new THREE.Vector3(0.32, -0.35, -0.18).applyQuaternion(
                headQuaternion,
              ),
            );
        }
        poseAction.send({
          p: rig.position.toArray(),
          h: headPosition.toArray(),
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
      weather?.update(t);
      for (const portal of portals) {
        portal.rotation.z += dt * .75;
        if (portal.position.distanceTo(rig.position) < 1.65 && !portal.userData.used) {
          portal.userData.used = true;
          const order: WorldId[] = ["fireside", "neon", "garden", "studio", "ocean", "moon", "arcade", "gallery"];
          window.dispatchEvent(new CustomEvent("davespace-change-world", { detail: order[(order.indexOf(world) + 1) % order.length] }));
        }
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
      room.leave();
      peerAudio.forEach((audio) => audio.remove());
      renderer.dispose();
      root.replaceChildren();
    };
  }, [world, playerName, avatarId, onExit]);
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
    [[-4, -1, "Ember", "Welcome to Campfire. The weather changes around us."], [4, -2, "Milo", "Try the shared browser or drop a portal from your hand menu."], [0, -6, "Nova", "I am a local guide NPC. Double click me to talk."]].forEach(([x, z, name, line]) => {
      const npc = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .7, 5, 10), M(0x6257ff, .16)); body.position.y = .9;
      const head = new THREE.Mesh(new THREE.SphereGeometry(.18, 14, 10), M(0x17203a, .25)); head.position.y = 1.55; head.userData.npc = true; head.userData.line = line;
      const label = textSprite(String(name), "#72ffd0", .75, .16); label.position.y = 1.95;
      npc.add(body, head, label); npc.position.set(Number(x), 0, Number(z)); s.add(npc); g.push(head);
    });
    screen(s);
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
    screen(s);
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
    if (w === "arcade" || w === "gallery") screen(s);
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
function screen(s: THREE.Scene) {
  const f = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.2, 0.2), M(0x101b28));
  f.position.set(0, 2.5, -9);
  s.add(f);
  const d = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 2.8),
    new THREE.MeshBasicMaterial({ color: 0x1c5b78 }),
  );
  d.position.set(0, 2.5, -8.88);
  s.add(d);
}
function makeRemoteAvatar(
  name: string,
  template: THREE.Object3D | null = null,
  avatarId = "explorer",
) {
  const group = new THREE.Group();
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
    model.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) {
        const mesh = part as THREE.Mesh;
        mesh.castShadow = true;
        if (avatarId === "coral" || avatarId === "mint") {
          const material = (mesh.material as THREE.Material).clone() as THREE.MeshStandardMaterial;
          if (material.color) material.color.lerp(new THREE.Color(avatarId === "coral" ? 0xff648d : 0x38e0bd), .38);
          mesh.material = material;
        }
      }
    });
    group.add(model);
    head.visible = true;
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
    group.add(hand);
  }
  for (const [name, x] of [["left-arm", -0.2], ["right-arm", 0.2]] as const) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.5, 5, 10), cloth);
    arm.name = name;
    arm.position.set(x, 1.15, 0);
    group.add(arm);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(4,12,18,.82)";
  context.roundRect(8, 8, 496, 112, 34);
  context.fill();
  context.font = "700 48px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#70f1bd";
  context.fillText(name.slice(0, 20), 256, 66);
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthTest: false,
    }),
  );
  label.position.y = 2.12;
  label.scale.set(1.8, 0.45, 1);
  const spineAnchor = new THREE.Group();
  spineAnchor.name = "nameplate-spine-anchor";
  spineAnchor.position.y = 1.42;
  label.position.y = 0.7;
  spineAnchor.add(label);
  group.add(spineAnchor);
  return group;
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
  (
    [
      ["worlds", "◈  WORLDS"],
      ["social", "◎  FRIENDS"],
      ["messages", "✦  MESSAGES"],
      ["voice", "◉  VOICE"],
      ["spawn-pen", "✎  SPAWN PEN"],
      ["spawn-cube", "⬡  SPAWN PROP"],
      ["spawn-portal", "◉  DROP PORTAL"],
      ["leave", "↗  LEAVE WORLD"],
      ["avatar", "♙  AVATAR"],
      ["settings", "⚙  SETTINGS"],
    ] as const
  ).forEach(([action, label], index) => {
    const button = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.145),
      new THREE.MeshBasicMaterial({
        map: makeMenuButton(label, action === "leave" ? "danger" : index < 4 ? "primary" : "tool"),
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    button.position.set(
      index % 2 ? 0.34 : -0.34,
      0.22 - Math.floor(index / 2) * 0.18,
      0.012,
    );
    button.userData.action = action;
    group.add(button);
  });
  const footer = textSprite("Y  CLOSE     X  MUTE     TRIGGER  SELECT", "#a9b4da", 0.78, 0.045);
  footer.position.set(0, -0.59, 0.022);
  group.add(footer);
  return group;
}

function makeMenuSurface(playerName: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 816;
  const ctx = canvas.getContext("2d")!;
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
  canvas.width = 620; canvas.height = 150;
  const ctx = canvas.getContext("2d")!;
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

function spawnTool(kind: "cube" | "pen" | "target" | "portal", scene: THREE.Scene, grab: THREE.Mesh[]) {
  const geometry = kind === "pen"
    ? new THREE.CylinderGeometry(0.025, 0.025, 0.48, 10)
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
