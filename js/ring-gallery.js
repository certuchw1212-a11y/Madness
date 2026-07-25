// Ring Gallery component
// Swap `image` for real photo URLs/paths. `placeholder()` is only a
// self-contained stand-in so the demo works with no network requests.
function placeholder(bg, fg, label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">
      <rect width="800" height="1000" fill="${bg}"/>
      <text x="50" y="900" font-family="Helvetica, Arial, sans-serif"
            font-size="56" font-weight="700" fill="${fg}">${label}</text>
    </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

const ITEMS = [
  {
    tag: "MODE",
    title: "Woman with umbrella walks past lululemon storefront",
    desc: "Calle mojada, un paraguas blanco y una vitrina roja: fotografía urbana de campaña.",
    image: placeholder("#c0392b", "#ffffff", "MODE"),
  },
  {
    tag: "BEST",
    title: "Best Practices",
    desc: "Una guía de referencia rápida sobre lo que funciona, curada para el equipo.",
    image: placeholder("#111318", "#e8622c", "BEST"),
  },
  {
    tag: "START",
    title: "Getting Started",
    desc: "El primer paso: una introducción clara antes de entrar en detalle.",
    image: placeholder("#b1c7d6", "#1c2b36", "START"),
  },
  {
    tag: "LINES",
    title: "Modern architectural lines and patterns",
    desc: "Fachadas que repiten un mismo trazo hasta convertirse en textura.",
    image: placeholder("#1b1f24", "#c9ccd1", "LINES"),
  },
  {
    tag: "GLOW",
    title: "Neon glow abstract composition",
    desc: "Luz de neón curvándose sobre sí misma en una composición abstracta.",
    image: placeholder("#7a1f16", "#ffd8c2", "GLOW"),
  },
  {
    tag: "DUSK",
    title: "Coastal sunset gradient",
    desc: "El horizonte se incendia sobre la costa en los últimos minutos de luz.",
    image: placeholder("#e3572b", "#fff1e0", "DUSK"),
  },
  {
    tag: "STYLE",
    title: "Street style portrait",
    desc: "Un retrato tomado al paso, en su ambiente natural.",
    image: placeholder("#20242b", "#f4f4f4", "STYLE"),
  },
  {
    tag: "STUDIO",
    title: "Studio product shot",
    desc: "Producto, luz controlada, fondo neutro: la toma de catálogo.",
    image: placeholder("#eceff1", "#20242b", "STUDIO"),
  },
];

const CARD_COUNT = 32; // how many card slots make up the full ring
const CARD_WIDTH = 140; // must match --card-w in style.css
const OVERLAP = 0.78; // <1 packs cards closer together (denser fan look)

const BASE_TILT = 18; // deg, matches --ring-tilt default
const TILT_RANGE = 7; // deg of parallax tilt swing from cursor Y
const PARALLAX_X = 16; // px of horizontal drift from cursor X
const BOB_AMPLITUDE = 9; // px
const BOB_PERIOD = 6200; // ms
const ROTATE_SENSITIVITY = 0.28; // deg per px dragged
const DRAG_CLICK_THRESHOLD = 5; // px, below this a pointerup counts as a click
const AUTOROTATE_SPEED = 0.006; // deg per ms (~2.2deg/s)
const IDLE_DELAY = 1400; // ms of no interaction before auto-rotate resumes
const MOMENTUM_FRICTION = 0.94; // per ~16.7ms frame

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initRingGallery() {
  const stage = document.getElementById("stage");
  const floatEl = document.getElementById("floatEl");
  const ring = document.getElementById("ring");
  const ringSpin = document.getElementById("ringSpin");
  const preview = document.getElementById("preview");
  const previewImage = document.getElementById("previewImage");
  const previewTitle = document.getElementById("previewTitle");

  const modal = document.getElementById("modal");
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalClose = document.getElementById("modalClose");
  const modalImage = document.getElementById("modalImage");
  const modalEyebrow = document.getElementById("modalEyebrow");
  const modalTitle = document.getElementById("modalTitle");
  const modalDesc = document.getElementById("modalDesc");

  const angleStep = 360 / CARD_COUNT;
  const radius = Math.round(
    (CARD_WIDTH / 2 / Math.tan(Math.PI / CARD_COUNT)) * (1 / OVERLAP)
  );

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < CARD_COUNT; i++) {
    const data = ITEMS[i % ITEMS.length];

    const slot = document.createElement("div");
    slot.className = "card-slot";
    slot.style.transform = `rotateY(${angleStep * i}deg) translateZ(${radius}px)`;

    const card = document.createElement("div");
    card.className = "card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Ampliar: ${data.title}`);

    const img = document.createElement("img");
    img.src = data.image;
    img.alt = data.title;
    img.loading = "lazy";

    card.appendChild(img);
    slot.appendChild(card);

    slot.addEventListener("mouseenter", () => {
      showPreview(data);
      lastInteraction = performance.now();
    });
    slot.addEventListener("mouseleave", hidePreview);
    slot.addEventListener("click", () => {
      if (wasDrag) return;
      openModal(data);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(data);
      }
    });

    fragment.appendChild(slot);
  }

  ringSpin.appendChild(fragment);

  function showPreview(data) {
    previewImage.src = data.image;
    previewImage.alt = data.title;
    previewTitle.textContent = data.title;
    preview.hidden = false;
  }

  function hidePreview() {
    preview.hidden = true;
  }

  // ---- Drag-to-rotate + inertia + idle auto-rotate ----
  let rotation = 0;
  let dragging = false;
  let wasDrag = false;
  let dragStartX = 0;
  let startRotation = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0; // deg per ms
  let lastInteraction = performance.now();
  let modalOpen = false;
  let mouseNormX = 0.5;
  let mouseNormY = 0.5;

  function setSpin(deg) {
    ringSpin.style.transform = `rotateY(${deg}deg)`;
  }

  // Deliberately does NOT use setPointerCapture: capturing on `stage` causes
  // Chromium to retarget the synthetic "click" event to the capturing element,
  // so individual cards never see clicks. Plain window-level listeners avoid that.
  function onPointerDown(e) {
    if (modalOpen) return;
    dragging = true;
    wasDrag = false;
    dragStartX = e.clientX;
    startRotation = rotation;
    lastX = e.clientX;
    lastT = performance.now();
    velocity = 0;
    stage.classList.add("grabbing");
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(now - lastT, 1);
    const dx = e.clientX - lastX;
    velocity = dx / dt;
    rotation = startRotation + (e.clientX - dragStartX) * ROTATE_SENSITIVITY;
    if (Math.abs(e.clientX - dragStartX) > DRAG_CLICK_THRESHOLD) wasDrag = true;
    lastX = e.clientX;
    lastT = now;
    lastInteraction = now;
    setSpin(rotation);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("grabbing");
    momentumVelocity = velocity * ROTATE_SENSITIVITY; // deg per ms
    lastInteraction = performance.now();
  }

  stage.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  stage.addEventListener("mousemove", (e) => {
    mouseNormX = e.clientX / window.innerWidth;
    mouseNormY = e.clientY / window.innerHeight;
  });

  // ---- Modal ----
  function openModal(data) {
    modalOpen = true;
    modalImage.src = data.image;
    modalImage.alt = data.title;
    modalEyebrow.textContent = data.tag;
    modalTitle.textContent = data.title;
    modalDesc.textContent = data.desc;
    modal.hidden = false;
    hidePreview();
    requestAnimationFrame(() => modal.classList.add("is-open"));
    modalClose.focus();
  }

  function closeModal() {
    modalOpen = false;
    modal.classList.remove("is-open");
    lastInteraction = performance.now();
    setTimeout(() => {
      if (!modalOpen) modal.hidden = true;
    }, 300);
  }

  modalClose.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", closeModal);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalOpen) closeModal();
  });

  // ---- Main animation loop: momentum, idle auto-rotate, float, parallax ----
  let momentumVelocity = 0;
  let lastTick = performance.now();

  function tick(now) {
    const dt = Math.min(now - lastTick, 48);
    lastTick = now;

    if (!dragging) {
      if (Math.abs(momentumVelocity) > 0.0015) {
        momentumVelocity *= Math.pow(MOMENTUM_FRICTION, dt / 16.7);
        rotation += momentumVelocity * dt;
        setSpin(rotation);
      } else if (!modalOpen && !reduceMotion && now - lastInteraction > IDLE_DELAY) {
        rotation += AUTOROTATE_SPEED * dt;
        setSpin(rotation);
      }
    }

    if (!reduceMotion) {
      const tilt = BASE_TILT + (mouseNormY - 0.5) * TILT_RANGE;
      ring.style.transform = `rotateX(${tilt}deg) translateZ(${-radius}px)`;

      const bob = Math.sin((now % BOB_PERIOD) / BOB_PERIOD * Math.PI * 2) * BOB_AMPLITUDE;
      const parX = (0.5 - mouseNormX) * PARALLAX_X;
      floatEl.style.transform = `translate(${parX}px, ${bob}px)`;
    } else {
      ring.style.transform = `rotateX(${BASE_TILT}deg) translateZ(${-radius}px)`;
    }

    requestAnimationFrame(tick);
  }

  ring.style.transform = `rotateX(${BASE_TILT}deg) translateZ(${-radius}px)`;
  setSpin(rotation);
  requestAnimationFrame(tick);
}

document.addEventListener("DOMContentLoaded", initRingGallery);
