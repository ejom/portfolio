# Portfolio TODO

## About me: hobbies and photos
Planned as an "Off the clock" section between Experience and Contact.

- [ ] List 3–5 hobbies. For each, write one or two sentences on what you do and why you like it (e.g. a sport, a game, building or making things, the outdoors around Flagstaff).
- [ ] Pick 4–8 photos of you: hobbies, the lab or cleanroom, the team, conferences, travel.
  - Put them in `public/img/about/`.
  - Landscape works best, with the long side at least 1600 px. They'll be resized and compressed.
  - Add a short caption for each, and note which ones should not be shown publicly.
- [ ] Optional: a photo for any project that has a physical side (bench setup, scope captures, the HFSS workstation if allowed).

## Content to confirm
- [ ] **HFSS card wording.** "Insertion/return loss" and "via pitch suppressing parasitic plane modes" are my reading of your description. Fix anything that's off.
- [ ] **Consulting before/after steps.** The steps for CadenceSEO and Ecorial are my guesses at those workflows. Only "5+ hours saved a week" comes from the resume.
- [ ] **HFSS data.** If ASU allows it, add exported S-parameters (`.s2p`/CSV) or screenshots. They can be plotted next to the analytical model.
- [ ] **Buck converter number.** The card now says 16.3 A, the refined peak. The repo's `duty_sweep.py` grid reports 14.8 A at D₀. Consider noting the finer grid in the EE599 repo too.

## Links and files
- [ ] **Capstone team website.** Link it from the AME card once it's published.
- [ ] **AME app screenshots** (`EE-Team-Website/images/app-*.png`). Add them to the AME lab after confirming the sponsor is OK with that.
- [ ] **Resume.** Export a PDF to `public/docs/` and point the Resume button at it (it currently serves the `.docx`).
- [ ] **PV inverter link.** Make sure https://github.com/ejom/PV-Inverter-Simulink is public, or remove the link.
- [ ] **Laplacient Social repo** (`cadence-marketing`). It's not linked right now. Link it only if it should be public.

## Repo housekeeping
- [ ] **Untrack the transcript.** `SSR_TSRPT.pdf` was committed before the `.gitignore` existed. Run `git rm --cached SSR_TSRPT.pdf`, and don't push the old commit anywhere public. If you want it out of history entirely, start the repo fresh, since there's only one commit.
- [ ] Decide whether to keep the original `profile.png` (738 KB) in the repo root. The site uses `public/img/profile.jpg` (88 KB).

## Launch
- [ ] Pick a host (Cloudflare Pages, Vercel or GitHub Pages). Build command `npm run build`, output `dist/`.
- [ ] Custom domain (e.g. a subdomain of laplacient.com).
- [ ] Add social preview tags (`og:image`, `og:title`) once the URL is known.
