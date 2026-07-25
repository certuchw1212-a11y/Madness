// Ring Gallery component
// Swap `image` for real photo URLs/paths. `placeholder()` is only a
// self-contained stand-in so the demo works with no network requests.
function placeholder(bg, fg, label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="560">
      <rect width="400" height="560" fill="${bg}"/>
      <text x="30" y="500" font-family="Helvetica, Arial, sans-serif"
            font-size="30" font-weight="700" fill="${fg}">${label}</text>
    </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

const ITEMS = [
  { title: "Woman with umbrella walks past lululemon storefront", image: placeholder("#c0392b", "#ffffff", "MODE") },
  { title: "Best Practices", image: placeholder("#111318", "#e8622c", "BEST") },
  { title: "Getting Started", image: placeholder("#b1c7d6", "#1c2b36", "START") },
  { title: "Modern architectural lines and patterns", image: placeholder("#1b1f24", "#c9ccd1", "LINES") },
  { title: "Neon glow abstract composition", image: placeholder("#7a1f16", "#ffd8c2", "GLOW") },
  { title: "Coastal sunset gradient", image: placeholder("#e3572b", "#fff1e0", "DUSK") },
  { title: "Street style portrait", image: placeholder("#20242b", "#f4f4f4", "STYLE") },
  { title: "Studio product shot", image: placeholder("#eceff1", "#20242b", "STUDIO") },
];

const CARD_COUNT = 32; // how many card slots make up the full ring
const CARD_WIDTH = 140; // must match --card-w in style.css
const OVERLAP = 0.78; // <1 packs cards closer together (denser fan look)

function initRingGallery() {
  const ring = document.getElementById("ring");
  const preview = document.getElementById("preview");
  const previewImage = document.getElementById("previewImage");
  const previewTitle = document.getElementById("previewTitle");

  const angleStep = 360 / CARD_COUNT;
  const radius = Math.round(
    (CARD_WIDTH / 2 / Math.tan(Math.PI / CARD_COUNT)) * (1 / OVERLAP)
  );
  document.documentElement.style.setProperty("--radius", radius + "px");

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < CARD_COUNT; i++) {
    const data = ITEMS[i % ITEMS.length];

    const slot = document.createElement("div");
    slot.className = "card-slot";
    slot.style.transform = `rotateY(${angleStep * i}deg) translateZ(${radius}px)`;

    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.src = data.image;
    img.alt = data.title;
    img.loading = "lazy";

    card.appendChild(img);
    slot.appendChild(card);

    slot.addEventListener("mouseenter", () => showPreview(data));
    slot.addEventListener("mouseleave", hidePreview);

    fragment.appendChild(slot);
  }

  ring.appendChild(fragment);

  function showPreview(data) {
    previewImage.src = data.image;
    previewImage.alt = data.title;
    previewTitle.textContent = data.title;
    preview.hidden = false;
  }

  function hidePreview() {
    preview.hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", initRingGallery);
