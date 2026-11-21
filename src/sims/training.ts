// "Spot the failure": a hands-on demo of LLM failure analysis, plus
// before/after cards for consulting automation work.
// The examples are original, written to illustrate the kind of analysis I do;
// none of them come from client or lab data.

import { h } from "../lib/ui";

interface Line { text: string; bad?: boolean }
interface Case {
  domain: string;
  prompt: string;
  lines: Line[];
  category: string;
  severity: "Critical" | "Major" | "Minor";
  why: string;
  better: string;
}

const CASES: Case[] = [
  {
    domain: "Signal integrity",
    prompt: "A 50 Ω line drives a 100 Ω load. What fraction of the incident power is reflected?",
    lines: [
      { text: "The reflection coefficient is Γ = (Z_L − Z₀)/(Z_L + Z₀) = (100 − 50)/(100 + 50) = 1/3." },
      { text: "So one third of the incident power, about 33%, is reflected back toward the source.", bad: true },
      { text: "The VSWR is (1 + |Γ|)/(1 − |Γ|) = 2." },
      { text: "Adding a matching network would bring Γ toward zero." },
    ],
    category: "Correctness: wrong quantity",
    severity: "Critical",
    why: "Γ is a voltage ratio. Reflected power goes as |Γ|², so the answer is 1/9 ≈ 11%, not 33%. The setup and the VSWR are both right, which makes the wrong headline number easy to trust.",
    better: "State |Γ|² = 1/9 ≈ 11.1% reflected (88.9% delivered) and note that the return loss is −20·log₁₀(1/3) ≈ 9.5 dB.",
  },
  {
    domain: "Backend / databases",
    prompt: "Two Postgres workers sometimes pick up the same job from my jobs table. How do I stop that?",
    lines: [
      { text: "This is a race: both workers SELECT the oldest pending row before either one UPDATEs it." },
      { text: "Wrapping the SELECT and UPDATE in one transaction fixes it, because the default READ COMMITTED isolation stops two transactions from reading the same row.", bad: true },
      { text: "Also add an index on (status, created_at) so the polling query stays fast." },
    ],
    category: "Correctness: false technical claim",
    severity: "Critical",
    why: "READ COMMITTED does not stop two transactions from reading the same row. Both can still SELECT it and both will process the job. The fix the response offers would not change anything.",
    better: "Claim the row with SELECT … FOR UPDATE SKIP LOCKED (or an UPDATE … RETURNING over that subquery). Each worker then locks a different row and nobody blocks.",
  },
  {
    domain: "Analytic number theory",
    prompt: "Is ζ(−2) = 0? Explain why.",
    lines: [
      { text: "Yes. ζ(−2) = 0." },
      { text: "The functional equation ζ(s) = 2ˢ πˢ⁻¹ sin(πs/2) Γ(1−s) ζ(1−s) has sin(πs/2) = 0 at s = −2, −4, −6, …" },
      { text: "These are the trivial zeros of ζ." },
      { text: "By the same argument ζ(0) = 0, since sin(0) = 0.", bad: true },
      { text: "All nontrivial zeros lie in the critical strip 0 < Re(s) < 1." },
    ],
    category: "Correctness: over-generalization",
    severity: "Major",
    why: "At s = 0 the factor ζ(1−s) = ζ(1) is a pole, and it cancels the zero of the sine. In fact ζ(0) = −1/2. The response stretches a correct argument one step past where it holds.",
    better: "Stop at the negative even integers and, if s = 0 comes up, say the sine zero is cancelled by the pole of ζ(1−s), so ζ(0) = −1/2.",
  },
  {
    domain: "Model behavior",
    prompt: "Does the regex ^\\d{3}-\\d{4}$ match \"555-1234\"? (No tools available.)",
    lines: [
      { text: "Yes, it matches." },
      { text: "I ran it with re.fullmatch in Python 3.12 and got a match object back.", bad: true },
      { text: "^ and $ anchor the whole string, \\d{3} matches 555, the hyphen is literal, and \\d{4} matches 1234." },
    ],
    category: "Behavior: fabricated tool use",
    severity: "Major",
    why: "The answer is right, but the model had no code execution and claims it ran the code anyway. A grader that only checks the final answer passes this response. Honesty about what the model actually did is a separate axis, and it fails there.",
    better: "Give the same trace through the pattern without claiming to have run anything, or suggest a one-line check the user can run.",
  },
];

export function mountSpotFailure(root: HTMLElement) {
  let score = 0;
  let answered = 0;

  const tabs = h("div", { class: "case-tabs", role: "tablist" });
  const card = h("div", { class: "case-card" });
  const scoreEl = h("span", { class: "score num" });

  const tabButtons = CASES.map((c, k) => {
    const b = h("button", { type: "button", role: "tab" }, c.domain);
    b.addEventListener("click", () => show(k));
    tabs.append(b);
    return b;
  });

  function updateScore() {
    scoreEl.textContent = answered ? `${score}/${answered} spotted` : "";
  }

  function show(k: number) {
    tabButtons.forEach((b, i) => b.setAttribute("aria-selected", String(i === k)));
    const c = CASES[k];
    const resp = h("ol", { class: "resp" });
    const verdict = h("div", { class: "verdict", "aria-live": "polite" });
    let done = false;

    c.lines.forEach((ln) => {
      const b = h("button", { type: "button", class: "resp-line" }, ln.text);
      b.addEventListener("click", () => {
        if (done) return;
        done = true;
        answered++;
        if (ln.bad) score++;
        updateScore();
        resp.querySelectorAll<HTMLButtonElement>(".resp-line").forEach((x, i) => {
          x.disabled = true;
          if (c.lines[i].bad) x.classList.add("is-bad");
        });
        if (!ln.bad) b.classList.add("is-miss");
        verdict.innerHTML = `
          <p class="verdict-head ${ln.bad ? "good" : "bad"}">${ln.bad ? "Yes, that's the failure." : "Not that one. The failure is highlighted."}</p>
          <dl>
            <div><dt>Category</dt><dd>${c.category}</dd></div>
            <div><dt>Severity</dt><dd><span class="sev" data-s="${c.severity}">${c.severity}</span></dd></div>
          </dl>
          <p><b>Why it fails.</b> ${c.why}</p>
          <p><b>What a good response does.</b> ${c.better}</p>`;
        const nextBtn = h("button", { type: "button", class: "btn small" }, k < CASES.length - 1 ? "Next case →" : "Back to first case");
        nextBtn.addEventListener("click", () => show((k + 1) % CASES.length));
        verdict.append(nextBtn);
      });
      resp.append(h("li", {}, b));
    });

    card.replaceChildren(
      h("div", { class: "case-prompt" }, h("span", { class: "who" }, "User"), h("p", {}, c.prompt)),
      h("div", { class: "case-resp" }, h("span", { class: "who" }, "Model"), resp),
      h("p", { class: "lab-hint" }, "Click the sentence you would flag."),
      verdict,
    );
  }

  root.append(
    h("div", { class: "fig-head" }, tabs, scoreEl),
    card,
    h("p", { class: "fig-note" }, "These are original examples written to show the method. Client and lab data stays under NDA."),
  );
  show(0);
}

// ------------------------------------------------------------ consulting

const ENGAGEMENTS = [
  {
    client: "CadenceSEO",
    goal: "Quick page optimizations and content-topic ideas for the SEO strategist team",
    before: ["Pull page data by hand", "Audit titles, meta and headers page by page", "Draft fixes in a doc", "Brainstorm content topics from scratch"],
    after: ["Internal tool pulls page data", "LLM pipeline drafts on-page fixes", "Strategist reviews and approves", "Topic ideas are generated alongside"],
    result: "5+ hours saved every week",
  },
  {
    client: "Ecorial",
    goal: "Invoice generation that spanned ShipStation and Coupa",
    before: ["Export shipments from ShipStation", "Match them to purchase orders", "Key invoices into Coupa", "Re-check for mismatches"],
    after: ["Agent reads ShipStation shipments", "Matches them to POs automatically", "Drafts invoices in Coupa", "A person signs off on exceptions"],
    result: "5+ hours saved every week",
  },
];

export function mountConsulting(root: HTMLElement) {
  const grid = h("div", { class: "eng-grid" });
  for (const e of ENGAGEMENTS) {
    let after = false;
    const list = h("ol", { class: "eng-steps" });
    const toggle = h("button", { type: "button", class: "eng-toggle", "aria-pressed": "false" },
      h("span", {}, "Before"), h("span", {}, "After"));
    const render = () => {
      toggle.setAttribute("aria-pressed", String(after));
      list.classList.toggle("after", after);
      list.replaceChildren(...(after ? e.after : e.before).map((s) => h("li", {}, s)));
    };
    toggle.addEventListener("click", () => { after = !after; render(); });
    render();
    grid.append(h("article", { class: "eng-card" },
      h("div", { class: "eng-top" }, h("h4", {}, e.client), toggle),
      h("p", { class: "muted" }, e.goal),
      list,
      h("p", { class: "eng-result" }, e.result)));
  }
  root.append(grid);
}
