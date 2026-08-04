/* ==========================================================================
   Interactive connector map
   - Flat SVG world outline (no 3D), black background, gray trace.
   - Add/remove points below in POINTS and CONNECTIONS.
   - Hovering (or tapping, or tabbing via keyboard) a connector line, or a
     node, lights up the connector(s) with a gold glow + traveling pulse.

   HOW TO ADD YOUR OWN POINTS
   ---------------------------------------------------------------------
   1) Add an entry to POINTS: { id, x, y, label, labelPos }
        - id: unique short string, used to reference the point in CONNECTIONS
        - x, y: position in the map's 1000x500 coordinate space
                (roughly: x=0 far west … x=1000 far east,
                          y=0 far north … y=500 far south)
        - label: text shown next to the dot
        - labelPos: "left" or "right" (optional, defaults to "right") —
                    which side of the dot the label text is drawn on
   2) Add a pair to CONNECTIONS: ["idA", "idB"]
        This draws one arcing line between those two points.
   That's it — the script builds the SVG groups, hit-areas and events
   automatically, so you don't need to touch the rendering code.
   ========================================================================== */

const POINTS = [
  { id: "cdmx", x: 233, y: 188, label: "Ciudad de México", labelPos: "left" },
  { id: "miami", x: 284, y: 171, label: "Miami", labelPos: "right" },
  { id: "madrid", x: 490, y: 131, label: "Madrid", labelPos: "right" },
  { id: "dubai", x: 649, y: 172, label: "Dubái", labelPos: "right" },
];

const CONNECTIONS = [
  ["cdmx", "miami"],
  ["miami", "madrid"],
  ["madrid", "dubai"],
  ["cdmx", "madrid"],
  ["miami", "dubai"],
];

const VB_W = 1000;
const VB_H = 500;

const svg = document.getElementById("world-map");
const linesLayer = document.getElementById("lines-layer");
const nodesLayer = document.getElementById("nodes-layer");

const NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

function pointById(id) {
  const p = POINTS.find((pt) => pt.id === id);
  if (!p) throw new Error(`Unknown point id "${id}" in CONNECTIONS`);
  return p;
}

/** Builds a quadratic-bezier "flight path" arc between two points. */
function arcPath(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // bulge upward, proportional to the distance between the points
  const cy = my - dist * 0.22;
  return `M ${a.x} ${a.y} Q ${mx} ${cy} ${b.x} ${b.y}`;
}

const nodeGroups = new Map(); // id -> <g class="node">
const connectorsByNode = new Map(); // id -> [connector <g> ...]

function registerConnectorForNode(id, group) {
  if (!connectorsByNode.has(id)) connectorsByNode.set(id, []);
  connectorsByNode.get(id).push(group);
}

function setNodeActive(id, active) {
  const g = nodeGroups.get(id);
  if (g) g.classList.toggle("is-active", active);
}

function setConnectorActive(group, active) {
  group.classList.toggle("is-active", active);
  const from = group.dataset.from;
  const to = group.dataset.to;
  setNodeActive(from, active);
  setNodeActive(to, active);
}

// --- draw connectors -------------------------------------------------
CONNECTIONS.forEach(([fromId, toId], i) => {
  const a = pointById(fromId);
  const b = pointById(toId);
  const d = arcPath(a, b);

  const group = el("g", {
    class: "connector-group",
    "data-from": fromId,
    "data-to": toId,
  });

  const hit = el("path", {
    class: "connector-hit",
    d,
    tabindex: "0",
    role: "img",
    "aria-label": `Conexión entre ${a.label} y ${b.label}`,
  });
  const line = el("path", { class: "connector-line", d });
  const pulse = el("path", { class: "connector-pulse", d });

  group.append(hit, line, pulse);
  linesLayer.appendChild(group);

  const activate = () => setConnectorActive(group, true);
  const deactivate = () => setConnectorActive(group, false);

  hit.addEventListener("pointerenter", activate);
  hit.addEventListener("pointerleave", deactivate);
  hit.addEventListener("focus", activate);
  hit.addEventListener("blur", deactivate);
  // touch: tap to toggle
  hit.addEventListener("click", (e) => {
    e.stopPropagation();
    const nowActive = !group.classList.contains("is-active");
    document
      .querySelectorAll(".connector-group.is-active, .node.is-active")
      .forEach((n) => n.classList.remove("is-active"));
    if (nowActive) setConnectorActive(group, true);
  });

  registerConnectorForNode(fromId, group);
  registerConnectorForNode(toId, group);
});

// --- draw nodes --------------------------------------------------------
POINTS.forEach((p) => {
  const group = el("g", {
    class: "node",
    "data-id": p.id,
    tabindex: "0",
    role: "img",
    "aria-label": p.label,
  });

  const halo = el("circle", { class: "node-halo", cx: p.x, cy: p.y, r: 6 });
  const dot = el("circle", { class: "node-dot", cx: p.x, cy: p.y, r: 4 });
  const isLeft = p.labelPos === "left";
  const label = el("text", {
    class: "node-label",
    x: p.x + (isLeft ? -8 : 8),
    y: p.y - 8,
    "text-anchor": isLeft ? "end" : "start",
  });
  label.textContent = p.label;

  group.append(halo, dot, label);
  nodesLayer.appendChild(group);
  nodeGroups.set(p.id, group);

  const highlightRelated = (on) => {
    (connectorsByNode.get(p.id) || []).forEach((connGroup) =>
      setConnectorActive(connGroup, on)
    );
  };

  group.addEventListener("pointerenter", () => highlightRelated(true));
  group.addEventListener("pointerleave", () => highlightRelated(false));
  group.addEventListener("focus", () => highlightRelated(true));
  group.addEventListener("blur", () => highlightRelated(false));
});

// clicking empty map area clears any tap-activated state (touch devices)
svg.addEventListener("click", () => {
  document
    .querySelectorAll(".connector-group.is-active, .node.is-active")
    .forEach((n) => n.classList.remove("is-active"));
});
