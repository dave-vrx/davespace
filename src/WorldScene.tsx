import { useEffect, useRef } from "react";
import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";
import { joinRoom, selfId } from "trystero";
export type WorldId = "fireside" | "neon" | "garden" | "studio";
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
  audioStream,
  onExit,
}: {
  world: WorldId;
  playerName: string;
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
      }[world];
    scene.background = new THREE.Color(palette[0]);
    scene.fog = new THREE.FogExp2(palette[0], 0.024);
    const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 120),
      rig = new THREE.Group();
    camera.position.set(0, 1.7, 7);
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
    const room = joinRoom(
      { appId: "vrspace-webxr-social-v1" },
      `public-${world}`,
    );
    const poseAction = room.makeAction<{
      p: number[];
      q: number[];
      l: number[];
      r: number[];
    }>("pose");
    const nameAction = room.makeAction<string>("name");
    const chatAction = room.makeAction<string>("chat");
    const remoteAvatars = new Map<string, THREE.Group>();
    const remoteNames = new Map<string, string>();
    const peerAudio = new Map<string, HTMLAudioElement>();
    const publishPresence = () =>
      window.dispatchEvent(
        new CustomEvent("vrspace-presence", { detail: remoteAvatars.size + 1 }),
      );
    const ensurePeer = (peerId: string) => {
      let avatar = remoteAvatars.get(peerId);
      if (!avatar) {
        avatar = makeRemoteAvatar(remoteNames.get(peerId) ?? "Guest");
        remoteAvatars.set(peerId, avatar);
        scene.add(avatar);
      }
      return avatar;
    };
    nameAction.onMessage = (peerName, { peerId }) => {
      remoteNames.set(peerId, peerName);
      const old = remoteAvatars.get(peerId);
      if (old) scene.remove(old);
      remoteAvatars.delete(peerId);
      ensurePeer(peerId);
    };
    poseAction.onMessage = (pose, { peerId }) => {
      const avatar = ensurePeer(peerId);
      avatar.position.fromArray(pose.p);
      avatar.quaternion.fromArray(pose.q);
      const left = avatar.getObjectByName("left-hand");
      const right = avatar.getObjectByName("right-hand");
      if (left) left.position.fromArray(pose.l).sub(avatar.position);
      if (right) right.position.fromArray(pose.r).sub(avatar.position);
    };
    chatAction.onMessage = (message) => {
      window.dispatchEvent(
        new CustomEvent("vrspace-chat", { detail: message }),
      );
    };
    const sendChat = (event: Event) =>
      chatAction.send((event as CustomEvent<string>).detail);
    window.addEventListener("vrspace-send-chat", sendChat);
    room.onPeerJoin = (peerId) => {
      ensurePeer(peerId);
      publishPresence();
      nameAction.send(playerName, { target: peerId });
      if (audioStream) room.addStream(audioStream, { target: peerId });
    };
    room.onPeerLeave = (peerId) => {
      const avatar = remoteAvatars.get(peerId);
      if (avatar) scene.remove(avatar);
      remoteAvatars.delete(peerId);
      publishPresence();
      peerAudio.get(peerId)?.remove();
      peerAudio.delete(peerId);
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
    if (audioStream) room.addStream(audioStream);
    const body = makeBody();
    camera.add(body);
    const xrMenu = makeXRMenu();
    xrMenu.visible = false;
    rig.add(xrMenu);
    const toggleXRMenu = () => {
      xrMenu.visible = !xrMenu.visible;
      if (xrMenu.visible) {
        const view = renderer.xr.isPresenting
          ? renderer.xr.getCamera()
          : camera;
        view.getWorldPosition(xrMenu.position);
        view.getWorldQuaternion(xrMenu.quaternion);
        xrMenu.translateZ(-1.35);
        rig.worldToLocal(xrMenu.position);
      }
    };
    const controllers = [
        renderer.xr.getController(0),
        renderer.xr.getController(1),
      ],
      ray = new THREE.Raycaster();
    let held: THREE.Mesh | null = null,
      parent: THREE.Object3D | null = null;
    controllers.forEach((c, i) => {
      // Controllers must share the locomotion rig or hands stay behind when moving.
      rig.add(c);
      c.add(makeHand(i ? "right" : "left"));
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
              window.dispatchEvent(new Event("vrspace-enable-audio"));
            if (action === "social")
              window.dispatchEvent(new Event("vrspace-toggle-menu"));
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
    handFactory.setPath(
      "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/",
    );
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
      lastY = 0;
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
        if (e.code === "Escape") onExit();
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
            h.object.position.x += 0.8;
            if (h.object.position.x > 4) h.object.position.x = -4;
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
      yWasPressed = false;
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
        let yPressed = false;
        for (const source of renderer.xr.getSession()?.inputSources ?? []) {
          const axes = source.gamepad?.axes;
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
              yPressed = Boolean(
                source.gamepad?.buttons[4]?.pressed ||
                  source.gamepad?.buttons[5]?.pressed,
              );
            }
          }
        }
        if (yPressed && !yWasPressed) toggleXRMenu();
        yWasPressed = yPressed;
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
      if (t - lastPose > 0.05) {
        const head = renderer.xr.isPresenting
          ? renderer.xr.getCamera()
          : camera;
        head.getWorldPosition(headPosition);
        head.getWorldQuaternion(headQuaternion);
        if (renderer.xr.isPresenting) {
          controllers[0].getWorldPosition(leftPosition);
          controllers[1].getWorldPosition(rightPosition);
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
          p: headPosition.toArray(),
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
      window.removeEventListener("vrspace-mobile-move", mobileMove);
      window.removeEventListener("vrspace-enable-audio", unlockAudio);
      room.leave();
      peerAudio.forEach((audio) => audio.remove());
      renderer.dispose();
      root.replaceChildren();
    };
  }, [world, playerName, audioStream, onExit]);
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
function makeHand(side: string) {
  const g = new THREE.Group(),
    hologram = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { glow: { value: new THREE.Color(0x70f1bd) } },
      vertexShader:
        "varying vec3 n;varying vec3 p;void main(){n=normalize(normalMatrix*normal);p=(modelViewMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*vec4(p,1.);}",
      fragmentShader:
        "uniform vec3 glow;varying vec3 n;varying vec3 p;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(-p))),2.);float scan=.7+.3*sin(p.y*90.);gl_FragColor=vec4(glow,(.3+rim*.7)*scan);}",
    }),
    p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.06), hologram);
  g.add(p);
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.018, 0.09, 3, 6),
      hologram,
    );
    f.position.set((i - 2) * 0.027, 0.1, -0.02);
    g.add(f);
  }
  g.scale.x = side === "left" ? -1 : 1;
  return g;
}
function makeRemoteAvatar(name: string) {
  const group = new THREE.Group();
  const skin = M(0xd5a17d),
    cloth = M(0x536fff, 0.08);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 2), skin);
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.42, 5, 10),
    cloth,
  );
  torso.position.y = -0.48;
  group.add(head, torso);
  for (const [side, x] of [
    ["left-hand", -0.35],
    ["right-hand", 0.35],
  ] as const) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), skin);
    hand.name = side;
    hand.position.set(x, -0.25, -0.15);
    group.add(hand);
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
  label.position.y = 0.5;
  label.scale.set(1.8, 0.45, 1);
  group.add(label);
  return group;
}
function makeXRMenu() {
  const group = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.78),
    new THREE.MeshBasicMaterial({
      color: 0x07131b,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
    }),
  );
  group.add(panel);
  const title = textSprite("VRSPACE", "#70f1bd", 0.28, 0.07);
  title.position.set(0, 0.29, 0.01);
  group.add(title);
  (
    [
      ["voice", "ENABLE VOICE"],
      ["social", "SOCIAL"],
      ["leave", "LEAVE"],
      ["close", "CLOSE"],
    ] as const
  ).forEach(([action, label], index) => {
    const button = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.15),
      new THREE.MeshBasicMaterial({
        color: action === "leave" ? 0x54242b : 0x15382f,
        side: THREE.DoubleSide,
      }),
    );
    button.position.set(
      index % 2 ? 0.24 : -0.24,
      0.1 - Math.floor(index / 2) * 0.2,
      0.012,
    );
    button.userData.action = action;
    group.add(button);
    const text = textSprite(
      label,
      action === "leave" ? "#ff9ba3" : "#eafff7",
      0.35,
      0.055,
    );
    text.position.copy(button.position);
    text.position.z = 0.02;
    group.add(text);
  });
  return group;
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
