import { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import type { RendererProps } from "../element-registry";
import { localize } from "../i18n";
import styles from "./Model3dWidget.module.css";

export function Model3dWidget({ node, spec, inputs, locale = "fa" }: RendererProps) {
  const props = { ...spec.defaults, ...(node.props ?? {}) } as Record<string, unknown>;
  const equipmentType = (String(props.equipmentType || "tank")).toLowerCase() as "tank" | "motor" | "inverter" | "custom";
  const title = typeof props.title === "string" ? props.title : localize(spec.name, locale);
  const customColor = typeof props.color === "string" ? props.color : "#38bdf8";
  const customAccent = typeof props.accentColor === "string" ? props.accentColor : "#10b981";
  const widgetHeight = typeof props.height === "number" ? Math.max(260, props.height) : 380;

  const [isAutoSpin, setIsAutoSpin] = useState<boolean>(() => props.autoSpin !== false);
  const [isWireframe, setIsWireframe] = useState<boolean>(Boolean(props.wireframe));

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const dynamicPartRef = useRef<THREE.Mesh | THREE.Group | null>(null);
  const fluidMeshRef = useRef<THREE.Mesh | null>(null);

  // Extract telemetry values
  const levelVal = useMemo(() => {
    const v = inputs.level?.value ?? inputs.power?.value ?? props.level ?? 75;
    return typeof v === "number" ? v : parseFloat(String(v)) || 50;
  }, [inputs.level, inputs.power, props.level]);

  const speedVal = useMemo(() => {
    const v = inputs.speed?.value ?? inputs.rpm?.value ?? inputs.current?.value ?? props.speed ?? 1450;
    return typeof v === "number" ? v : parseFloat(String(v)) || 0;
  }, [inputs.speed, inputs.rpm, inputs.current, props.speed]);

  const tempVal = useMemo(() => {
    const v = inputs.temperature?.value ?? props.temperature ?? 48.5;
    return typeof v === "number" ? v.toFixed(1) : String(v);
  }, [inputs.temperature, props.temperature]);

  const statusKey = String(inputs.status?.value ?? props.status ?? "running").toLowerCase();

  // Three.js Scene Setup & Mouse Interaction
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || widgetHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 3.5, 9);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight1.position.set(8, 12, 10);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight2.position.set(-10, -4, -6);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x10b981, 1.5, 20);
    pointLight.position.set(0, 4, 4);
    scene.add(pointLight);

    // Ground Circular Grid
    const gridHelper = new THREE.GridHelper(12, 16, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = -2.2;
    scene.add(gridHelper);

    // Model Container
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // Build 3D Geometry based on equipmentType
    buildModel(equipmentType, modelGroup, customColor, customAccent, isWireframe);

    // Animation & Mouse Controls State
    let isMouseDown = false;
    let isRightDown = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let targetRotY = 0;
    let targetRotX = 0.2;
    let currentRotY = 0;
    let currentRotX = 0.2;
    let cameraDistance = 9;
    let panX = 0;
    let panY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isMouseDown = e.button === 0;
      isRightDown = e.button === 2;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      if (isMouseDown) {
        // Orbit rotation
        targetRotY += deltaX * 0.008;
        targetRotX += deltaY * 0.008;
        targetRotX = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, targetRotX));
      } else if (isRightDown) {
        // Pan
        panX += deltaX * 0.01;
        panY -= deltaY * 0.01;
      }
    };

    const onMouseUp = () => {
      isMouseDown = false;
      isRightDown = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraDistance += e.deltaY * 0.006;
      cameraDistance = Math.max(3.5, Math.min(22, cameraDistance));
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    const onDblClick = () => {
      targetRotX = 0.2;
      targetRotY = 0;
      cameraDistance = 9;
      panX = 0;
      panY = 0;
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("contextmenu", onContextMenu);
    container.addEventListener("dblclick", onDblClick);

    // Resize Observer
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
          for (const entry of entries) {
            const w = entry.contentRect.width;
            const h = entry.contentRect.height;
            if (w > 0 && h > 0) {
              camera.aspect = w / h;
              camera.updateProjectionMatrix();
              renderer.setSize(w, h);
            }
          }
        })
      : null;
    if (resizeObserver) resizeObserver.observe(container);

    // Animation Loop
    let animId = 0;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // Auto-spin logic
      if (isAutoSpin && !isMouseDown) {
        targetRotY += delta * 0.45;
      }

      // Smooth damping interpolation
      currentRotY += (targetRotY - currentRotY) * 0.08;
      currentRotX += (targetRotX - currentRotX) * 0.08;

      modelGroup.rotation.y = currentRotY;
      modelGroup.rotation.x = currentRotX;
      modelGroup.position.x = panX;
      modelGroup.position.y = panY;

      // Update camera distance
      camera.position.z = cameraDistance;

      // Dynamic animation: Impeller turbine spinning
      if (dynamicPartRef.current) {
        const speedFactor = Math.max(0.5, speedVal / 300);
        dynamicPartRef.current.rotation.x += delta * speedFactor * 4;
      }

      // Dynamic animation: 3D fluid level mesh scaling
      if (fluidMeshRef.current) {
        const targetScaleY = Math.max(0.05, Math.min(1.0, levelVal / 100));
        fluidMeshRef.current.scale.y += (targetScaleY - fluidMeshRef.current.scale.y) * 0.1;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      if (resizeObserver) resizeObserver.disconnect();
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("dblclick", onDblClick);

      // Clean Three.js memory
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, [equipmentType, customColor, customAccent, isWireframe, widgetHeight]);

  function buildModel(type: string, group: THREE.Group, primaryColor: string, accentCol: string, wireframe: boolean) {
    // Clear previous
    while (group.children.length > 0) {
      const child = group.children[0];
      if (child) group.remove(child);
    }
    dynamicPartRef.current = null;
    fluidMeshRef.current = null;

    const metalMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(primaryColor),
      metalness: 0.8,
      roughness: 0.25,
      wireframe,
    });

    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.6,
      roughness: 0.4,
      wireframe,
    });

    const accentMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(accentCol),
      metalness: 0.5,
      roughness: 0.3,
      wireframe,
    });

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe,
    });

    if (type === "tank") {
      // --- 3D STORAGE VESSEL / TANK ---
      // Tank Main Cylinder
      const tankGeo = new THREE.CylinderGeometry(1.6, 1.6, 3.4, 32);
      const tankMesh = new THREE.Mesh(tankGeo, metalMaterial);
      tankMesh.castShadow = true;
      group.add(tankMesh);

      // Top Dome
      const topDomeGeo = new THREE.SphereGeometry(1.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const topDome = new THREE.Mesh(topDomeGeo, metalMaterial);
      topDome.position.y = 1.7;
      group.add(topDome);

      // Bottom Dome
      const botDome = new THREE.Mesh(topDomeGeo, metalMaterial);
      botDome.rotation.x = Math.PI;
      botDome.position.y = -1.7;
      group.add(botDome);

      // Weld Seam Rings
      for (const y of [-0.9, 0, 0.9]) {
        const ringGeo = new THREE.TorusGeometry(1.63, 0.04, 16, 40);
        const ring = new THREE.Mesh(ringGeo, accentMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        group.add(ring);
      }

      // 4 Leg Supports
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const legGeo = new THREE.CylinderGeometry(0.1, 0.14, 1.4, 16);
        const leg = new THREE.Mesh(legGeo, darkMaterial);
        leg.position.set(Math.cos(angle) * 1.35, -2.1, Math.sin(angle) * 1.35);
        group.add(leg);
      }

      // Nozzle / Pipe on side
      const pipeGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.0, 16);
      const pipe = new THREE.Mesh(pipeGeo, darkMaterial);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(1.8, -0.6, 0);
      group.add(pipe);

      // Flange
      const flangeGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16);
      const flange = new THREE.Mesh(flangeGeo, accentMaterial);
      flange.rotation.z = Math.PI / 2;
      flange.position.set(2.3, -0.6, 0);
      group.add(flange);

      // Top Valve & Relief
      const valveStem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 16), darkMaterial);
      valveStem.position.y = 3.4;
      group.add(valveStem);

      const valveHandwheel = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 16, 32), accentMaterial);
      valveHandwheel.rotation.x = Math.PI / 2;
      valveHandwheel.position.y = 3.7;
      group.add(valveHandwheel);

      // 3D Liquid Level Mesh inside glass sight gauge
      const sightTubeGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.8, 16);
      const sightTube = new THREE.Mesh(sightTubeGeo, new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.35 }));
      sightTube.position.set(-1.8, 0, 0);
      group.add(sightTube);

      const fluidGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.8, 16);
      const fluidMesh = new THREE.Mesh(fluidGeo, glowMaterial);
      fluidMesh.position.set(-1.8, 0, 0);
      fluidMesh.scale.y = Math.max(0.1, levelVal / 100);
      group.add(fluidMesh);
      fluidMeshRef.current = fluidMesh;
    } else if (type === "motor") {
      // --- 3D INDUSTRIAL PUMP & MOTOR ---
      // Motor Body Cylinder
      const motorGeo = new THREE.CylinderGeometry(1.3, 1.3, 2.8, 24);
      const motorMesh = new THREE.Mesh(motorGeo, metalMaterial);
      motorMesh.rotation.z = Math.PI / 2;
      motorMesh.position.set(-1.2, 0, 0);
      group.add(motorMesh);

      // Motor Cooling Fins (Ribs)
      for (let i = 0; i < 7; i++) {
        const finGeo = new THREE.TorusGeometry(1.36, 0.04, 12, 32);
        const fin = new THREE.Mesh(finGeo, accentMaterial);
        fin.rotation.y = Math.PI / 2;
        fin.position.x = -2.2 + i * 0.35;
        group.add(fin);
      }

      // Terminal Connection Box
      const tBoxGeo = new THREE.BoxGeometry(0.8, 0.6, 0.8);
      const tBox = new THREE.Mesh(tBoxGeo, darkMaterial);
      tBox.position.set(-1.2, 1.4, 0);
      group.add(tBox);

      // Coupling Guard
      const couplingGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.8, 20);
      const coupling = new THREE.Mesh(couplingGeo, darkMaterial);
      coupling.rotation.z = Math.PI / 2;
      coupling.position.set(0.5, 0, 0);
      group.add(coupling);

      // Volute Pump Casing
      const pumpCasingGeo = new THREE.TorusGeometry(1.4, 0.55, 20, 36);
      const pumpCasing = new THREE.Mesh(pumpCasingGeo, metalMaterial);
      pumpCasing.rotation.y = Math.PI / 2;
      pumpCasing.position.set(1.6, 0, 0);
      group.add(pumpCasing);

      // Discharge Nozzle (Vertical)
      const dischargeGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.5, 16);
      const discharge = new THREE.Mesh(dischargeGeo, accentMaterial);
      discharge.position.set(1.6, 1.6, 0);
      group.add(discharge);

      // Suction Nozzle (Axial)
      const suctionGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 16);
      const suction = new THREE.Mesh(suctionGeo, accentMaterial);
      suction.rotation.z = Math.PI / 2;
      suction.position.set(2.8, 0, 0);
      group.add(suction);

      // Impeller Group (Rotates dynamically with speed/RPM)
      const impellerGroup = new THREE.Group();
      impellerGroup.position.set(1.6, 0, 0);
      for (let b = 0; b < 6; b++) {
        const bladeGeo = new THREE.BoxGeometry(0.08, 0.9, 0.25);
        const blade = new THREE.Mesh(bladeGeo, glowMaterial);
        blade.rotation.x = (b * Math.PI) / 3;
        impellerGroup.add(blade);
      }
      group.add(impellerGroup);
      dynamicPartRef.current = impellerGroup;

      // Baseplate Skid
      const baseGeo = new THREE.BoxGeometry(5.2, 0.35, 2.6);
      const baseplate = new THREE.Mesh(baseGeo, darkMaterial);
      baseplate.position.y = -1.6;
      group.add(baseplate);
    } else {
      // --- 3D POWER INVERTER / ELECTRICAL CABINET ---
      // Cabinet Body
      const cabGeo = new THREE.BoxGeometry(2.6, 4.0, 1.6);
      const cabMesh = new THREE.Mesh(cabGeo, darkMaterial);
      group.add(cabMesh);

      // Front Door Inset
      const doorGeo = new THREE.BoxGeometry(2.3, 3.7, 0.05);
      const doorMesh = new THREE.Mesh(doorGeo, metalMaterial);
      doorMesh.position.z = 0.81;
      group.add(doorMesh);

      // Digital Display Screen
      const screenGeo = new THREE.BoxGeometry(1.2, 0.8, 0.08);
      const screenMesh = new THREE.Mesh(screenGeo, glowMaterial);
      screenMesh.position.set(0, 0.9, 0.85);
      group.add(screenMesh);

      // Screen Frame
      const frameGeo = new THREE.BoxGeometry(1.36, 0.96, 0.04);
      const frameMesh = new THREE.Mesh(frameGeo, darkMaterial);
      frameMesh.position.set(0, 0.9, 0.83);
      group.add(frameMesh);

      // Status Indicator LEDs
      for (let l = 0; l < 3; l++) {
        const ledGeo = new THREE.SphereGeometry(0.08, 12, 12);
        const ledColor = l === 0 ? 0x10b981 : l === 1 ? 0xf59e0b : 0xef4444;
        const led = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: ledColor }));
        led.position.set(-0.35 + l * 0.35, 0.25, 0.87);
        group.add(led);
      }

      // Ventilation Louvers (Grilles)
      for (let v = 0; v < 8; v++) {
        const louverGeo = new THREE.BoxGeometry(1.8, 0.05, 0.03);
        const louver = new THREE.Mesh(louverGeo, darkMaterial);
        louver.position.set(0, -0.4 - v * 0.16, 0.85);
        group.add(louver);
      }

      // Side Cooling Heatsink Fins
      for (let s = 0; s < 12; s++) {
        const finGeo = new THREE.BoxGeometry(0.04, 3.4, 0.25);
        const finL = new THREE.Mesh(finGeo, accentMaterial);
        finL.position.set(-1.32, 0, -0.6 + s * 0.11);
        group.add(finL);

        const finR = new THREE.Mesh(finGeo, accentMaterial);
        finR.position.set(1.32, 0, -0.6 + s * 0.11);
        group.add(finR);
      }

      // High Voltage Bushings on Top
      for (let b = 0; b < 3; b++) {
        const bushingGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.8, 16);
        const bushing = new THREE.Mesh(bushingGeo, accentMaterial);
        bushing.position.set(-0.7 + b * 0.7, 2.4, 0);
        group.add(bushing);
      }
    }
  }

  const handleResetView = () => {
    if (cameraRef.current && modelGroupRef.current) {
      cameraRef.current.position.set(0, 3.5, 9);
      cameraRef.current.lookAt(0, 0, 0);
      modelGroupRef.current.rotation.set(0.2, 0, 0);
      modelGroupRef.current.position.set(0, 0, 0);
    }
  };

  return (
    <div className={styles.container} data-renderer="builtin.model-3d@1" dir="rtl">
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.icon}>🧊</span>
          <span className={styles.title}>{title || "مدل صنعتی سه‌بعدی تعاملی"}</span>
          <span className={styles.badge}>
            {equipmentType === "tank" ? "مخزن فرآیندی 3D" : equipmentType === "motor" ? "الکتروپمپ 3D" : "اینورتر صنعتی 3D"}
          </span>
        </div>

        <div className={styles.toolbar}>
          <button
            type="button"
            className={`${styles.toolBtn} ${isAutoSpin ? styles.toolBtnActive : ""}`}
            onClick={() => setIsAutoSpin((s) => !s)}
            title="چرخش خودکار تجهیز حول محور اصلی"
          >
            <span>🔄</span>
            <span>{isAutoSpin ? "چرخش: فعال" : "چرخش: متوقف"}</span>
          </button>

          <button
            type="button"
            className={`${styles.toolBtn} ${isWireframe ? styles.toolBtnActive : ""}`}
            onClick={() => setIsWireframe((w) => !w)}
            title="تغییر حالت نمایش به وایرفریم (اسکلتی)"
          >
            <span>🌐</span>
            <span>{isWireframe ? "وایرفریم" : "توپر"}</span>
          </button>

          <button
            type="button"
            className={styles.toolBtn}
            onClick={handleResetView}
            title="بازنشانی زاویه دید دوربین به حالت اولیه"
          >
            <span>🔍</span>
            <span>ریست زاویه</span>
          </button>
        </div>
      </div>

      {/* 3D WebGL Viewport */}
      <div ref={mountRef} className={styles.viewport} style={{ height: widgetHeight }}>
        {/* Floating Live Telemetry Cards in 3D Space */}
        <div className={styles.telemetryOverlay}>
          {equipmentType === "tank" ? (
            <>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>سطح مخزن 3D</span>
                <div className={styles.metricValRow}>
                  <span>{levelVal.toFixed(1)}</span>
                  <span className={styles.metricUnit}>%</span>
                </div>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>دمای سیال</span>
                <div className={styles.metricValRow}>
                  <span>{tempVal}</span>
                  <span className={styles.metricUnit}>°C</span>
                </div>
              </div>
            </>
          ) : equipmentType === "motor" ? (
            <>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>سرعت دورانی توربین</span>
                <div className={styles.metricValRow}>
                  <span>{Math.round(speedVal)}</span>
                  <span className={styles.metricUnit}>RPM</span>
                </div>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>دمای یاتاقان</span>
                <div className={styles.metricValRow}>
                  <span>{tempVal}</span>
                  <span className={styles.metricUnit}>°C</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>توان فعال</span>
                <div className={styles.metricValRow}>
                  <span>{(speedVal / 10).toFixed(1)}</span>
                  <span className={styles.metricUnit}>kW</span>
                </div>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>وضعیت اینورتر</span>
                <div className={styles.metricValRow} style={{ color: "#10b981", fontSize: "0.88rem" }}>
                  <span>{statusKey === "running" ? "در حال کار" : "عادی"}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Mouse Navigation Help Badge */}
        <div className={styles.controlsHelp}>
          <span>🖱️ چرخش ۳۶۰ درجه: کلیک چپ و درگ | زوم: اسکرول ماوس | جابه‌جایی: کلیک راست | ریست: دوبار کلیک</span>
        </div>
      </div>
    </div>
  );
}
