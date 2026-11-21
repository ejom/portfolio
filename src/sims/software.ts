// Software-side interactives: the Laplacient Social agent workflow and the
// AME (capstone) container architecture.

import { h } from "../lib/ui";

const STEPS = [
  {
    title: "Brand context",
    plan: "—", post: "—",
    body: "Onboarding names a PostPeer profile and connects social accounts over hosted OAuth. The user saves company info, industry, target platforms and up to six reference images.",
    tech: ["Neon Auth (JWT, EdDSA/JWKS)", "PostPeer OAuth", "Cloudflare R2"],
  },
  {
    title: "Planner form",
    plan: "brainstorming", post: "—",
    body: "Pick post type, platforms, date and timezone. Only platforms that are connected and support the post type can be chosen, and the API rejects the rest, so no credits go to copy that can't publish.",
    tech: ["React + TypeScript", "FastAPI validation"],
  },
  {
    title: "Agent research",
    plan: "brainstorming", post: "—",
    body: "The form starts a Claude agent turn that runs in the background, saves after every step, and is picked back up by a worker after a restart. It can search the web for timely angles and pitch ideas.",
    tech: ["Anthropic SDK tool use", "background worker", "row locks"],
  },
  {
    title: "generate_post",
    plan: "in-progress", post: "in-progress",
    body: "Claude writes a caption for each platform and a media prompt. Images come from Nano Banana 2 (with brand references), and video from Veo 3.1 through fal's queue API. Assets are copied to R2.",
    tech: ["fal.ai queue", "Nano Banana 2 / Veo 3.1", "R2"],
  },
  {
    title: "Edit together",
    plan: "in-progress", post: "in-progress",
    body: "The user hand-edits captions, time and platforms, or asks for changes in chat. edit_post changes only what was asked, and every message shows Claude the hand edits.",
    tech: ["edit_post tool", "optimistic UI that keeps unsaved edits"],
  },
  {
    title: "Human approval",
    plan: "complete", post: "scheduled",
    body: "Only the user can approve, because Claude has no approve tool. Approval schedules the post in PostPeer with an idempotency key so retries never double-post, then locks the card.",
    tech: ["PostPeer scheduling", "idempotency keys", "Stripe credits"],
  },
];

export function mountWorkflow(root: HTMLElement) {
  let i = 0;
  const rail = h("ol", { class: "steps" });
  const panel = h("div", { class: "step-panel", "aria-live": "polite" });
  const prev = h("button", { type: "button", class: "btn ghost small" }, "← Back");
  const next = h("button", { type: "button", class: "btn small" }, "Next step →");

  const buttons = STEPS.map((s, k) => {
    const b = h("button", { type: "button" }, h("span", { class: "num" }, String(k + 1).padStart(2, "0")), s.title);
    b.addEventListener("click", () => go(k));
    rail.append(h("li", {}, b));
    return b;
  });

  function go(k: number) {
    i = Math.max(0, Math.min(STEPS.length - 1, k));
    const s = STEPS[i];
    buttons.forEach((b, k2) => {
      b.classList.toggle("done", k2 < i);
      b.setAttribute("aria-current", k2 === i ? "step" : "false");
    });
    panel.innerHTML = `
      <div class="state-row">
        <span>plan <b class="state" data-s="${s.plan}">${s.plan}</b></span>
        <span>post <b class="state" data-s="${s.post}">${s.post}</b></span>
      </div>
      <h4>${s.title}</h4>
      <p>${s.body}</p>
      <ul class="chips">${s.tech.map((t) => `<li>${t}</li>`).join("")}</ul>`;
    prev.toggleAttribute("disabled", i === 0);
    next.textContent = i === STEPS.length - 1 ? "Start over ↺" : "Next step →";
  }
  prev.addEventListener("click", () => go(i - 1));
  next.addEventListener("click", () => go(i === STEPS.length - 1 ? 0 : i + 1));

  root.append(h("div", { class: "workflow" }, rail, h("div", {}, panel, h("div", { class: "btn-row" }, prev, next))));
  go(0);
}

const AME_NODES: Record<string, string> = {
  host: "A directory on the Linux host, or a network share IT has mounted, bind-mounted read-only into the container. Each subdirectory becomes a source.",
  pg: "PostgreSQL 17 on a Unix socket only. It stores every extracted field with its provenance and confidence, uses pg_trgm for fuzzy search, and also serves as the job queue.",
  api: "FastAPI on :8000 serves the REST API (query, paginate, export JSON/CSV) and the built React frontend.",
  worker: "A supervisor plus N job processes for scan, extract and resolve. Jobs are claimed with FOR UPDATE SKIP LOCKED, with no Redis or broker. Extractors cover CSV, JSON, TIFF/EXIF, NetCDF/HDF5 and MP4.",
  sched: "Runs a cron scan per source and sweeps stale jobs.",
  ui: "A React + Vite + Tailwind UI to search, filter, browse and open detail views. The client network is offline, so everything ships in a single docker-save tarball.",
};

export function mountAme(root: HTMLElement) {
  const info = h("p", { class: "ame-info", "aria-live": "polite" }, "Select a component to see what it does.");
  const svg = `
  <svg viewBox="0 0 640 300" class="ame-svg" role="group" aria-label="AME single-container architecture">
    <defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--muted)"/></marker></defs>
    <rect x="8" y="8" width="624" height="284" rx="10" class="ame-host"/>
    <text x="22" y="30" class="ame-cap">Linux host · Docker Engine · offline</text>
    <rect x="182" y="44" width="436" height="236" rx="10" class="ame-container"/>
    <text x="196" y="64" class="ame-cap">container "ame" · tini → entrypoint.sh</text>
    ${node("host", 24, 120, 130, 64, "Test-data files", "bind mount, read-only")}
    ${node("worker", 200, 86, 190, 56, "ame worker", "scan · extract · resolve")}
    ${node("sched", 200, 160, 190, 48, "ame scheduler", "cron scans")}
    ${node("pg", 420, 86, 180, 56, "PostgreSQL 17", "metadata + job queue")}
    ${node("api", 420, 160, 180, 48, "ame api", "FastAPI :8000")}
    ${node("ui", 420, 226, 180, 44, "Web UI", "React · search · export")}
    <path d="M154 140 L198 120" class="ame-edge" marker-end="url(#ah)"/>
    <path d="M390 114 L418 114" class="ame-edge" marker-end="url(#ah)"/>
    <path d="M390 184 C404 184 404 140 418 128" class="ame-edge" marker-end="url(#ah)"/>
    <path d="M510 142 L510 158" class="ame-edge" marker-end="url(#ah)"/>
    <path d="M510 208 L510 224" class="ame-edge" marker-end="url(#ah)"/>
  </svg>`;
  const wrap = h("div", { class: "ame", html: svg });
  wrap.append(info);
  wrap.querySelectorAll<SVGGElement>(".ame-node").forEach((g) => {
    const show = () => {
      wrap.querySelectorAll(".ame-node").forEach((x) => x.classList.toggle("on", x === g));
      info.textContent = AME_NODES[g.dataset.k!];
    };
    g.addEventListener("click", show);
    g.addEventListener("focus", show);
    g.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") show(); });
  });
  root.append(wrap);
}

function node(k: string, x: number, y: number, w: number, hh: number, title: string, sub: string) {
  return `<g class="ame-node" data-k="${k}" tabindex="0" role="button" aria-label="${title}">
    <rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="7"/>
    <text x="${x + 12}" y="${y + 22}" class="t">${title}</text>
    <text x="${x + 12}" y="${y + 40}" class="s">${sub}</text></g>`;
}
