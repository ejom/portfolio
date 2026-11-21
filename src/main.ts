import "./styles.css";
import { mountScope, mountTerminal } from "./hero";
import { mountBattery } from "./sims/battery";
import { mountBuck } from "./sims/buck";
import { mountHfss } from "./sims/hfss";
import { mountIrDrop } from "./sims/irdrop";
import { mountAme, mountWorkflow } from "./sims/software";
import { mountConsulting, mountSpotFailure } from "./sims/training";

type Mode = "ee" | "sw";
const root = document.documentElement;

function setMode(mode: Mode, persist = true) {
  root.dataset.mode = mode;
  root.style.colorScheme = mode === "ee" ? "dark" : "light";
  document.querySelectorAll<HTMLButtonElement>("[data-mode-toggle]").forEach((b) => {
    b.setAttribute("aria-checked", String(mode === "sw"));
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "ee" ? "#04060A" : "#FBF8F1");
  if (persist) {
    try { localStorage.setItem("mode", mode); } catch { /* storage unavailable */ }
  }
  window.dispatchEvent(new Event("modechange"));
}

document.querySelectorAll<HTMLButtonElement>("[data-mode-toggle]").forEach((b) =>
  b.addEventListener("click", () => setMode(root.dataset.mode === "ee" ? "sw" : "ee")));
document.querySelectorAll<HTMLButtonElement>("[data-set-mode]").forEach((b) =>
  b.addEventListener("click", () => setMode(b.dataset.setMode as Mode)));
setMode((root.dataset.mode as Mode) || "ee", false);

// Follow the OS theme until the visitor picks a side themselves.
matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
  let saved: string | null = null;
  try { saved = localStorage.getItem("mode"); } catch { /* ignore */ }
  if (!saved) setMode(e.matches ? "sw" : "ee", false);
});

// Mount each interactive section when it first nears the viewport.
const mounts: Record<string, (el: HTMLElement) => void> = {
  hfss: mountHfss,
  buck: mountBuck,
  battery: mountBattery,
  irdrop: mountIrDrop,
  workflow: mountWorkflow,
  ame: mountAme,
  failure: mountSpotFailure,
  consulting: mountConsulting,
};
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const el = e.target as HTMLElement;
    io.unobserve(el);
    el.classList.remove("loading");
    mounts[el.dataset.mount!]?.(el);
  }
}, { rootMargin: "400px 0px" });
document.querySelectorAll<HTMLElement>("[data-mount]").forEach((el) => io.observe(el));

mountScope(document.getElementById("scope") as HTMLCanvasElement);
mountTerminal(document.getElementById("term")!);

// Mobile nav
const navBtn = document.querySelector<HTMLButtonElement>(".nav-menu")!;
const nav = document.querySelector<HTMLElement>(".nav-links")!;
navBtn.addEventListener("click", () => {
  const open = navBtn.getAttribute("aria-expanded") !== "true";
  navBtn.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("open", open);
});
nav.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("a")) {
    navBtn.setAttribute("aria-expanded", "false");
    nav.classList.remove("open");
  }
});

// Project filter chips
const chips = document.querySelectorAll<HTMLButtonElement>("[data-filter]");
chips.forEach((chip) => chip.addEventListener("click", () => {
  const f = chip.dataset.filter!;
  chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
  document.querySelectorAll<HTMLElement>(".project").forEach((p) => {
    p.hidden = f !== "all" && !p.dataset.side!.includes(f);
  });
}));

document.getElementById("year")!.textContent = String(new Date().getFullYear());
