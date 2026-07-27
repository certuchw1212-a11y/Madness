import * as React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * Ring Gallery — Framer Code Component
 *
 * A dense ring of cards oriented tangentially (like books on a curved
 * shelf), viewed with a tilted perspective camera so the ring reads as a
 * real 3D orbit. Drag to spin it, hover to preview, click a card to open
 * a cinema-marquee detail panel.
 *
 * All content (images, tags, titles, descriptions) is editable from the
 * Framer property panel via the `items` array below.
 */

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

interface RingItem {
    image?: { src: string; alt?: string }
    tag: string
    title: string
    description: string
}

interface RingGalleryProps {
    items?: RingItem[]
    cardCount: number
    cardWidth: number
    cardHeight: number
    overlap: number
    radiusScale: number
    tilt: number
    autoRotate: boolean
    backgroundColor: string
    accentColor: string
    textColor: string
    style?: React.CSSProperties
}

// ---------------------------------------------------------------------
// Constants (geometry/motion tuning — not exposed as props, matches the
// reference-matched values from the standalone HTML/CSS/JS version)
// ---------------------------------------------------------------------

const TANGENT_SPIN = 90 // deg — orients cards like books on a shelf, not petals facing out
const TILT_RANGE = 7 // deg of parallax tilt swing from cursor Y
const PARALLAX_X = 16 // px of horizontal drift from cursor X
const BOB_AMPLITUDE = 9 // px
const BOB_PERIOD = 6200 // ms
const ROTATE_SENSITIVITY = 0.28 // deg per px dragged
const DRAG_CLICK_THRESHOLD = 5 // px, below this a pointerup counts as a click
const AUTOROTATE_SPEED = 0.006 // deg per ms (~2.2deg/s)
const IDLE_DELAY = 1400 // ms of no interaction before auto-rotate resumes
const MOMENTUM_FRICTION = 0.94 // per ~16.7ms frame
const MAX_DEPTH_BLUR = 7 // px of blur applied to the far side of the ring
const MAX_DEPTH_DIM = 0.3 // how much dimmer the far side gets (0-1)
const FOCUS_FACING = 0.75 // cards within ~41deg of dead-center stay perfectly sharp
const DEG2RAD = Math.PI / 180
const HOVER_POP = 34 // px a hovered card pushes toward the camera
const PERSPECTIVE = 4200 // px

const BULB_ROW_COUNT = 11
const BULB_COL_COUNT = 6

// ---------------------------------------------------------------------
// Fallback placeholder image (used only when a slot has no `image` set)
// ---------------------------------------------------------------------

function placeholderSrc(bg: string, fg: string, label: string) {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">
      <rect width="800" height="1000" fill="${bg}"/>
      <text x="50" y="900" font-family="Helvetica, Arial, sans-serif"
            font-size="56" font-weight="700" fill="${fg}">${label}</text>
    </svg>`
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg)
}

const DEFAULT_ITEMS: RingItem[] = [
    { tag: "MODE", title: "Woman with umbrella walks past lululemon storefront", description: "Calle mojada, un paraguas blanco y una vitrina roja: fotografía urbana de campaña.", image: { src: placeholderSrc("#c0392b", "#ffffff", "MODE") } },
    { tag: "BEST", title: "Best Practices", description: "Una guía de referencia rápida sobre lo que funciona, curada para el equipo.", image: { src: placeholderSrc("#111318", "#e8622c", "BEST") } },
    { tag: "START", title: "Getting Started", description: "El primer paso: una introducción clara antes de entrar en detalle.", image: { src: placeholderSrc("#b1c7d6", "#1c2b36", "START") } },
    { tag: "LINES", title: "Modern architectural lines and patterns", description: "Fachadas que repiten un mismo trazo hasta convertirse en textura.", image: { src: placeholderSrc("#1b1f24", "#c9ccd1", "LINES") } },
    { tag: "GLOW", title: "Neon glow abstract composition", description: "Luz de neón curvándose sobre sí misma en una composición abstracta.", image: { src: placeholderSrc("#7a1f16", "#ffd8c2", "GLOW") } },
    { tag: "DUSK", title: "Coastal sunset gradient", description: "El horizonte se incendia sobre la costa en los últimos minutos de luz.", image: { src: placeholderSrc("#e3572b", "#fff1e0", "DUSK") } },
    { tag: "STYLE", title: "Street style portrait", description: "Un retrato tomado al paso, en su ambiente natural.", image: { src: placeholderSrc("#20242b", "#f4f4f4", "STYLE") } },
    { tag: "STUDIO", title: "Studio product shot", description: "Producto, luz controlada, fondo neutro: la toma de catálogo.", image: { src: placeholderSrc("#eceff1", "#20242b", "STUDIO") } },
]

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

export default function RingGallery({
    items,
    cardCount = 20,
    cardWidth = 185,
    cardHeight = 250,
    overlap = 0.78,
    radiusScale = 0.6,
    tilt = 20,
    autoRotate = true,
    backgroundColor = "#08080a",
    accentColor = "#e0532c",
    textColor = "#f2f0ea",
    style,
}: RingGalleryProps) {
    const sourceItems = items && items.length > 0 ? items : DEFAULT_ITEMS

    const sceneRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<HTMLDivElement>(null)
    const floatRef = useRef<HTMLDivElement>(null)
    const ringRef = useRef<HTMLDivElement>(null)
    const ringSpinRef = useRef<HTMLDivElement>(null)
    const slotRefs = useRef<(HTMLDivElement | null)[]>([])
    const cardRefs = useRef<(HTMLDivElement | null)[]>([])
    const modalCloseRef = useRef<HTMLButtonElement>(null)

    const [preview, setPreview] = useState<RingItem | null>(null)
    const [modalItem, setModalItem] = useState<RingItem | null>(null)
    const [modalOpen, setModalOpen] = useState(false)

    const reduceMotion = useMemo(
        () =>
            typeof window !== "undefined" &&
            window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
        []
    )

    // Stagger each bulb's flicker so the sign reads as individually-wired
    // bulbs rather than one uniform pulse.
    const bulbDelays = useMemo(() => {
        const make = (n: number) =>
            Array.from({ length: n }, () => (Math.random() * -3).toFixed(2) + "s")
        return {
            top: make(BULB_ROW_COUNT),
            bottom: make(BULB_ROW_COUNT),
            left: make(BULB_COL_COUNT),
            right: make(BULB_COL_COUNT),
            corners: make(4),
        }
    }, [])

    const angleStep = 360 / cardCount
    const radius = Math.round(
        (cardWidth / 2 / Math.tan(Math.PI / cardCount)) * (1 / overlap) * radiusScale
    )

    function slotTransform(baseAngle: number, z: number) {
        return `rotateY(${baseAngle}deg) translateZ(${z}px) rotateY(${TANGENT_SPIN}deg)`
    }

    // ---- Imperative drag / momentum / auto-rotate / depth-of-field loop ----
    // Mirrors the standalone HTML/CSS/JS version: mutating refs and DOM style
    // directly every frame, rather than React state, keeps this smooth at
    // 60fps instead of re-rendering the whole tree per frame.
    useEffect(() => {
        const stage = stageRef.current
        const floatEl = floatRef.current
        const ring = ringRef.current
        const ringSpin = ringSpinRef.current
        if (!stage || !floatEl || !ring || !ringSpin) return

        let rotation = angleStep / 2 // no card sits perfectly dead-center by default
        let dragging = false
        let dragStartX = 0
        let startRotation = 0
        let lastX = 0
        let lastT = 0
        let velocity = 0
        let momentumVelocity = 0
        let lastInteraction = performance.now()
        let mouseNormX = 0.5
        let mouseNormY = 0.5
        let modalOpenNow = false
        let raf = 0

        function setSpin(deg: number) {
            if (ringSpin) ringSpin.style.transform = `rotateY(${deg}deg)`
        }

        function onPointerDown(e: PointerEvent) {
            if (modalOpenNow) return
            dragging = true
            wasDragRef.current = false
            dragStartX = e.clientX
            startRotation = rotation
            lastX = e.clientX
            lastT = performance.now()
            velocity = 0
            stage?.classList.add("rg-grabbing")
        }

        function onPointerMove(e: PointerEvent) {
            if (!dragging) return
            const now = performance.now()
            const dt = Math.max(now - lastT, 1)
            const dx = e.clientX - lastX
            velocity = dx / dt
            rotation = startRotation + (e.clientX - dragStartX) * ROTATE_SENSITIVITY
            if (Math.abs(e.clientX - dragStartX) > DRAG_CLICK_THRESHOLD) wasDragRef.current = true
            lastX = e.clientX
            lastT = now
            lastInteraction = now
            setSpin(rotation)
        }

        function onPointerUp() {
            if (!dragging) return
            dragging = false
            stage?.classList.remove("rg-grabbing")
            momentumVelocity = velocity * ROTATE_SENSITIVITY
            lastInteraction = performance.now()
        }

        function onMouseMove(e: MouseEvent) {
            const rect = stage!.getBoundingClientRect()
            mouseNormX = (e.clientX - rect.left) / rect.width
            mouseNormY = (e.clientY - rect.top) / rect.height
        }

        // Deliberately no setPointerCapture: capturing on the stage causes
        // Chromium to retarget the synthetic "click" event to the capturing
        // element, so individual cards never see clicks.
        stage.addEventListener("pointerdown", onPointerDown)
        window.addEventListener("pointermove", onPointerMove)
        window.addEventListener("pointerup", onPointerUp)
        window.addEventListener("pointercancel", onPointerUp)
        stage.addEventListener("mousemove", onMouseMove)

        let recenterY = 0
        let lastTick = performance.now()

        function tick(now: number) {
            const dt = Math.min(now - lastTick, 48)
            lastTick = now

            if (!dragging) {
                if (Math.abs(momentumVelocity) > 0.0015) {
                    momentumVelocity *= Math.pow(MOMENTUM_FRICTION, dt / 16.7)
                    rotation += momentumVelocity * dt
                    setSpin(rotation)
                } else if (
                    autoRotate &&
                    !modalOpenNow &&
                    !reduceMotion &&
                    now - lastInteraction > IDLE_DELAY
                ) {
                    rotation += AUTOROTATE_SPEED * dt
                    setSpin(rotation)
                }
            }

            if (!reduceMotion) {
                const t = tilt + (mouseNormY - 0.5) * TILT_RANGE
                ring!.style.transform = `rotateX(${t}deg) translateZ(${-radius}px)`

                const bob =
                    Math.sin(((now % BOB_PERIOD) / BOB_PERIOD) * Math.PI * 2) * BOB_AMPLITUDE
                const parX = (0.5 - mouseNormX) * PARALLAX_X
                floatEl!.style.transform = `translate(${parX}px, ${recenterY + bob}px)`
            } else {
                ring!.style.transform = `rotateX(${tilt}deg) translateZ(${-radius}px)`
                floatEl!.style.transform = `translateY(${recenterY}px)`
            }

            // Cinematic depth of field: cards facing the camera stay sharp,
            // cards rotating toward the far side blur and dim progressively.
            for (let i = 0; i < cardCount; i++) {
                const card = cardRefs.current[i]
                if (!card) continue
                const baseAngle = angleStep * i
                const facing = Math.cos((baseAngle + rotation) * DEG2RAD)
                const depth =
                    facing >= FOCUS_FACING
                        ? 0
                        : (FOCUS_FACING - facing) / (FOCUS_FACING + 1)
                const blur = depth * MAX_DEPTH_BLUR
                const brightness = 1 - depth * MAX_DEPTH_DIM
                card.style.setProperty("--rg-depth-blur", `${blur.toFixed(2)}px`)
                card.style.setProperty("--rg-depth-brightness", brightness.toFixed(2))
            }

            raf = requestAnimationFrame(tick)
        }

        ring.style.transform = `rotateX(${tilt}deg) translateZ(${-radius}px)`
        setSpin(rotation)

        // The container centers the ring's *untransformed* box, not the
        // perspective projection of the full 360deg cylinder — near cards
        // blow up and far cards shrink asymmetrically, so the visual oval
        // doesn't sit on that center. Measure the front and back card slots
        // once and shift the scene so the full closed ring lands in view.
        const frontRect = slotRefs.current[0]?.getBoundingClientRect()
        const backSlot = slotRefs.current[Math.round(cardCount / 2)]
        const backRect = backSlot?.getBoundingClientRect()
        const stageRect = stage.getBoundingClientRect()
        if (frontRect && backRect) {
            const ovalMidY =
                (frontRect.top + frontRect.bottom + backRect.top + backRect.bottom) / 4
            recenterY = stageRect.top + stageRect.height / 2 - ovalMidY
            floatEl.style.transform = `translateY(${recenterY}px)`
        }

        raf = requestAnimationFrame(tick)

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") closeModalRef.current()
        }
        window.addEventListener("keydown", onKeyDown)

        return () => {
            cancelAnimationFrame(raf)
            stage.removeEventListener("pointerdown", onPointerDown)
            window.removeEventListener("pointermove", onPointerMove)
            window.removeEventListener("pointerup", onPointerUp)
            window.removeEventListener("pointercancel", onPointerUp)
            stage.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("keydown", onKeyDown)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardCount, cardWidth, overlap, radiusScale, tilt, autoRotate, reduceMotion])

    // Tracks drag-vs-click per pointer session; read by each slot's onClick.
    const wasDragRef = useRef(false)
    const closeModalRef = useRef(() => {})

    function openModal(item: RingItem) {
        setModalItem(item)
        setModalOpen(true)
        setPreview(null)
    }
    function closeModal() {
        setModalOpen(false)
    }
    closeModalRef.current = closeModal

    useEffect(() => {
        if (modalOpen) modalCloseRef.current?.focus()
    }, [modalOpen])

    const slots = useMemo(
        () => Array.from({ length: cardCount }, (_, i) => i),
        [cardCount]
    )

    return (
        <div
            ref={sceneRef}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                minHeight: 480,
                overflow: "hidden",
                background: backgroundColor,
                fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                color: textColor,
                ...style,
            }}
        >
            <style>{`
                .rg-vignette { position:absolute; inset:0; pointer-events:none; z-index:1;
                    background: radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.75) 100%); }
                .rg-grain { position:absolute; inset:0; pointer-events:none; z-index:2; opacity:0.05;
                    mix-blend-mode: overlay;
                    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>"); }
                .rg-floor-glow { position:absolute; left:50%; top:50%; width:900px; height:260px;
                    margin:-130px 0 0 -450px; pointer-events:none; z-index:0; filter: blur(40px);
                    animation: rg-glow-pulse 7s ease-in-out infinite; }
                @keyframes rg-glow-pulse { 0%,100% { opacity:.7; transform:scale(1);} 50% { opacity:1; transform:scale(1.06);} }
                .rg-hint { position:absolute; bottom:22px; left:50%; transform:translateX(-50%);
                    font-size:12px; letter-spacing:.04em; z-index:10; pointer-events:none; opacity:.55; }
                .rg-preview { position:absolute; top:24px; left:24px; width:160px; z-index:10; padding:10px;
                    background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.09); border-radius:12px;
                    backdrop-filter: blur(16px); pointer-events:none; }
                .rg-preview img { display:block; width:100%; height:100px; object-fit:cover; border-radius:6px; background:#111; }
                .rg-preview p { margin:8px 0 0; font-size:12.5px; font-weight:600; line-height:1.35;
                    overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
                .rg-stage { position:relative; z-index:3; width:100%; height:100%; display:flex;
                    align-items:center; justify-content:center; perspective:${PERSPECTIVE}px; cursor:grab; touch-action:pan-y; }
                .rg-stage.rg-grabbing { cursor:grabbing; }
                .rg-float, .rg-ring, .rg-ring-spin, .rg-slot { transform-style: preserve-3d; }
                .rg-ring { position:relative; }
                .rg-ring-spin { position:absolute; inset:0; }
                .rg-slot { position:absolute; top:0; left:0; }
                .rg-card { position:relative; width:100%; height:100%; transform-style:preserve-3d;
                    cursor:pointer; transition:transform .35s ease;
                    --rg-depth-blur:0px; --rg-depth-brightness:1; }
                .rg-card:focus-visible { outline:2px solid ${accentColor}; outline-offset:2px; }
                .rg-face { position:absolute; inset:0; border-radius:8px; overflow:hidden; background:#111;
                    box-shadow: 0 18px 40px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.13), 0 0 20px rgba(255,255,255,.05);
                    backface-visibility:hidden; filter: blur(var(--rg-depth-blur)) brightness(var(--rg-depth-brightness));
                    transition: box-shadow .35s ease; }
                .rg-face--front { transform: rotateY(0deg); }
                .rg-face--back { transform: rotateY(180deg); }
                .rg-face img { width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }
                .rg-slot:hover .rg-card { transform:scale(1.06); }
                .rg-slot:hover .rg-face { box-shadow: 0 30px 60px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.16), 0 0 40px rgba(255,255,255,.08); }
                .rg-modal { position:absolute; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; }
                .rg-modal[hidden] { display:none; }
                .rg-modal-backdrop { position:absolute; inset:0; background:rgba(4,4,5,.78); backdrop-filter:blur(6px);
                    opacity:0; transition:opacity .3s ease; }
                .rg-modal.rg-open .rg-modal-backdrop { opacity:1; }
                .rg-marquee { position:relative; width:min(820px,92%); max-height:90%; padding:32px 28px;
                    background: radial-gradient(ellipse at 50% 0%, rgba(255,180,90,.12), transparent 55%),
                        linear-gradient(160deg, rgba(255,255,255,.07), transparent 22%),
                        repeating-linear-gradient(128deg, rgba(255,255,255,.025) 0 2px, transparent 2px 6px),
                        linear-gradient(155deg, #3c2a15, #1c130a 55%, #0d0906);
                    border-radius:12px;
                    box-shadow: 0 50px 120px rgba(0,0,0,.7), inset 0 2px 2px rgba(255,255,255,.1),
                        inset 0 -3px 6px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,200,130,.12);
                    opacity:0; transform:scale(0.96) translateY(10px); transition:opacity .3s ease, transform .3s ease; }
                .rg-modal.rg-open .rg-marquee { opacity:1; transform:scale(1) translateY(0); }
                .rg-bulbs { position:absolute; display:flex; pointer-events:none; }
                .rg-bulbs--top, .rg-bulbs--bottom { left:30px; right:30px; justify-content:space-between; }
                .rg-bulbs--top { top:11px; } .rg-bulbs--bottom { bottom:11px; }
                .rg-bulbs--left, .rg-bulbs--right { top:32px; bottom:32px; flex-direction:column; justify-content:space-between; }
                .rg-bulbs--left { left:11px; } .rg-bulbs--right { right:11px; }
                .rg-corner { position:absolute; z-index:1; }
                .rg-corner--tl { top:11px; left:11px; } .rg-corner--tr { top:11px; right:11px; }
                .rg-corner--bl { bottom:11px; left:11px; } .rg-corner--br { bottom:11px; right:11px; }
                .rg-bulb { display:block; width:11px; height:11px; border-radius:50%;
                    background: radial-gradient(circle at 35% 28%, #fffdf2 0%, #ffe19a 22%, #ffb64a 48%, #d9791c 72%, #5c3410 100%);
                    box-shadow: inset -1px -1px 2px rgba(0,0,0,.55), inset 1px 1px 1px rgba(255,255,255,.55),
                        0 0 6px 2px rgba(255,180,70,.9), 0 0 18px 7px rgba(255,130,20,.4);
                    animation: rg-bulb-flicker 2.6s ease-in-out infinite; }
                @keyframes rg-bulb-flicker { 0%,100% { opacity:1; } 50% { opacity:.82; } }
                .rg-bezel { position:relative; padding:9px; border-radius:8px;
                    background: linear-gradient(155deg, #4d3419 0%, #2a1c0f 45%, #17100a 100%);
                    box-shadow: inset 0 2px 3px rgba(255,255,255,.18), inset 0 -2px 4px rgba(0,0,0,.65); }
                .rg-rivet { position:absolute; width:6px; height:6px; border-radius:50%;
                    background: radial-gradient(circle at 35% 30%, #f0d9a8, #96702c 55%, #3a2510 100%);
                    box-shadow: 0 1px 1px rgba(0,0,0,.6), inset 0 0 1px rgba(255,255,255,.5); }
                .rg-rivet--tl { top:4px; left:4px; } .rg-rivet--tr { top:4px; right:4px; }
                .rg-rivet--bl { bottom:4px; left:4px; } .rg-rivet--br { bottom:4px; right:4px; }
                .rg-panel { position:relative; width:100%; max-height:calc(90vh - 86px); overflow:auto;
                    display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); background:#0c0c0e;
                    border-radius:5px; box-shadow: inset 0 0 40px rgba(0,0,0,.5); }
                .rg-panel img { width:100%; height:100%; min-height:260px; object-fit:cover; display:block; }
                .rg-panel-body { padding:32px 30px; display:flex; flex-direction:column; justify-content:center; gap:10px; }
                .rg-eyebrow { margin:0; font-size:11px; font-weight:700; letter-spacing:.14em; color:${accentColor}; }
                .rg-title { margin:0; font-family: ui-serif, Georgia, 'Times New Roman', serif; font-size:26px;
                    font-weight:500; line-height:1.25; text-wrap:balance; }
                .rg-desc { margin:4px 0 0; font-size:14.5px; line-height:1.6; max-width:42ch; opacity:.65; }
                .rg-close { position:absolute; top:14px; right:14px; width:34px; height:34px; display:flex;
                    align-items:center; justify-content:center; border-radius:50%; border:1px solid rgba(255,255,255,.09);
                    background:rgba(0,0,0,.35); color:inherit; font-size:18px; line-height:1; cursor:pointer; }
                .rg-close:hover { background:rgba(255,255,255,.1); }
                .rg-close:focus-visible { outline:2px solid ${accentColor}; outline-offset:2px; }
                @media (max-width: 640px) {
                    .rg-panel { grid-template-columns:1fr; }
                    .rg-panel img { min-height:200px; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .rg-bulb, .rg-floor-glow { animation-duration:.001ms !important; }
                }
            `}</style>

            <div className="rg-vignette" />
            <div className="rg-grain" />
            <div
                className="rg-floor-glow"
                style={{
                    background: `radial-gradient(ellipse, ${hexToRgba(accentColor, 0.16)}, transparent 70%)`,
                }}
            />

            <div className="rg-preview" style={{ display: preview ? "block" : "none" }}>
                {preview && (
                    <>
                        <img src={preview.image?.src} alt="" />
                        <p>{preview.title}</p>
                    </>
                )}
            </div>

            <div className="rg-stage" ref={stageRef}>
                <div className="rg-float" ref={floatRef}>
                    <div
                        className="rg-ring"
                        ref={ringRef}
                        style={{ width: cardWidth, height: cardHeight }}
                    >
                        <div className="rg-ring-spin" ref={ringSpinRef}>
                            {slots.map((i) => {
                                const data = sourceItems[i % sourceItems.length]
                                const baseAngle = angleStep * i
                                return (
                                    <div
                                        key={i}
                                        className="rg-slot"
                                        ref={(el) => (slotRefs.current[i] = el)}
                                        style={{
                                            width: cardWidth,
                                            height: cardHeight,
                                            transform: slotTransform(baseAngle, radius),
                                        }}
                                        onMouseEnter={(e) => {
                                            setPreview(data)
                                            const slot = e.currentTarget
                                            slot.style.transform = slotTransform(
                                                baseAngle,
                                                radius + HOVER_POP
                                            )
                                        }}
                                        onMouseLeave={(e) => {
                                            setPreview(null)
                                            const slot = e.currentTarget
                                            slot.style.transform = slotTransform(baseAngle, radius)
                                        }}
                                        onClick={() => {
                                            if (wasDragRef.current) return
                                            openModal(data)
                                        }}
                                    >
                                        <div
                                            className="rg-card"
                                            ref={(el) => (cardRefs.current[i] = el)}
                                            tabIndex={0}
                                            role="button"
                                            aria-label={`Ampliar: ${data.title}`}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault()
                                                    openModal(data)
                                                }
                                            }}
                                        >
                                            <div className="rg-face rg-face--front">
                                                <img src={data.image?.src} alt={data.title} loading="lazy" />
                                            </div>
                                            <div className="rg-face rg-face--back">
                                                <img src={data.image?.src} alt="" loading="lazy" />
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <p className="rg-hint">Arrastrá para girar · clic en una tarjeta para ampliar</p>

            <div className={"rg-modal" + (modalOpen ? " rg-open" : "")} hidden={!modalOpen}>
                <div className="rg-modal-backdrop" onClick={closeModal} />
                <div className="rg-marquee">
                    <div className="rg-bulbs rg-bulbs--top">
                        {bulbDelays.top.map((d, i) => (
                            <span className="rg-bulb" key={i} style={{ animationDelay: d }} />
                        ))}
                    </div>
                    <div className="rg-bulbs rg-bulbs--bottom">
                        {bulbDelays.bottom.map((d, i) => (
                            <span className="rg-bulb" key={i} style={{ animationDelay: d }} />
                        ))}
                    </div>
                    <div className="rg-bulbs rg-bulbs--left">
                        {bulbDelays.left.map((d, i) => (
                            <span className="rg-bulb" key={i} style={{ animationDelay: d }} />
                        ))}
                    </div>
                    <div className="rg-bulbs rg-bulbs--right">
                        {bulbDelays.right.map((d, i) => (
                            <span className="rg-bulb" key={i} style={{ animationDelay: d }} />
                        ))}
                    </div>
                    <span className="rg-bulb rg-corner rg-corner--tl" style={{ animationDelay: bulbDelays.corners[0] }} />
                    <span className="rg-bulb rg-corner rg-corner--tr" style={{ animationDelay: bulbDelays.corners[1] }} />
                    <span className="rg-bulb rg-corner rg-corner--bl" style={{ animationDelay: bulbDelays.corners[2] }} />
                    <span className="rg-bulb rg-corner rg-corner--br" style={{ animationDelay: bulbDelays.corners[3] }} />

                    <div className="rg-bezel">
                        <span className="rg-rivet rg-rivet--tl" />
                        <span className="rg-rivet rg-rivet--tr" />
                        <span className="rg-rivet rg-rivet--bl" />
                        <span className="rg-rivet rg-rivet--br" />

                        <div
                            className="rg-panel"
                            role="dialog"
                            aria-modal="true"
                            aria-label={modalItem?.title}
                        >
                            <img src={modalItem?.image?.src} alt={modalItem?.title || ""} />
                            <div className="rg-panel-body">
                                <p className="rg-eyebrow">{modalItem?.tag}</p>
                                <h2 className="rg-title">{modalItem?.title}</h2>
                                <p className="rg-desc">{modalItem?.description}</p>
                            </div>
                            <button
                                className="rg-close"
                                ref={modalCloseRef}
                                aria-label="Cerrar"
                                onClick={closeModal}
                            >
                                &times;
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function hexToRgba(hex: string, alpha: number) {
    const clean = hex.replace("#", "")
    const full =
        clean.length === 3
            ? clean
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : clean
    const r = parseInt(full.substring(0, 2), 16) || 224
    const g = parseInt(full.substring(2, 4), 16) || 83
    const b = parseInt(full.substring(4, 6), 16) || 44
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}


addPropertyControls(RingGallery, {
    items: {
        type: ControlType.Array,
        title: "Tarjetas",
        control: {
            type: ControlType.Object,
            controls: {
                image: { type: ControlType.ResponsiveImage, title: "Imagen" },
                tag: { type: ControlType.String, title: "Categoría", defaultValue: "TAG" },
                title: { type: ControlType.String, title: "Título", defaultValue: "Título" },
                description: {
                    type: ControlType.String,
                    title: "Descripción",
                    defaultValue: "",
                    displayTextArea: true,
                },
            },
        },
        defaultValue: DEFAULT_ITEMS,
    },
    cardCount: {
        type: ControlType.Number,
        title: "Cantidad de tarjetas",
        min: 6,
        max: 40,
        step: 1,
        defaultValue: 20,
    },
    cardWidth: {
        type: ControlType.Number,
        title: "Ancho de tarjeta",
        min: 60,
        max: 320,
        step: 1,
        defaultValue: 185,
    },
    cardHeight: {
        type: ControlType.Number,
        title: "Alto de tarjeta",
        min: 80,
        max: 420,
        step: 1,
        defaultValue: 250,
    },
    radiusScale: {
        type: ControlType.Number,
        title: "Separación",
        min: 0.3,
        max: 1.5,
        step: 0.01,
        defaultValue: 0.6,
    },
    tilt: {
        type: ControlType.Number,
        title: "Inclinación",
        min: 5,
        max: 60,
        step: 1,
        defaultValue: 20,
    },
    overlap: {
        type: ControlType.Number,
        title: "Densidad",
        min: 0.4,
        max: 1.2,
        step: 0.01,
        defaultValue: 0.78,
    },
    autoRotate: {
        type: ControlType.Boolean,
        title: "Auto-rotar",
        defaultValue: true,
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Fondo",
        defaultValue: "#08080a",
    },
    accentColor: {
        type: ControlType.Color,
        title: "Acento",
        defaultValue: "#e0532c",
    },
    textColor: {
        type: ControlType.Color,
        title: "Texto",
        defaultValue: "#f2f0ea",
    },
})
