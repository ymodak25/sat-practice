import { QUESTION_BANK, SAT_SOURCES, SAT_TOPICS } from "./data.js";

const app = document.querySelector("#app");
const STORAGE_KEY = "northstar-sat-progress-v1";
const SESSION_KEY = "northstar-sat-openai-key-v1";
const MODEL_KEY = "northstar-sat-openai-model-v1";
const SESSION_SIZE = 5;

const allDomains = SAT_TOPICS.flatMap((section) =>
  section.domains.map((domain) => ({ ...domain, section: section.title, sectionId: section.id })),
);
const allSkills = allDomains.flatMap((domain) =>
  domain.skills.map((skill) => ({ ...skill, domainId: domain.id, domainTitle: domain.title, section: domain.section, sectionId: domain.sectionId })),
);
const skillsById = new Map(allSkills.map((skill) => [skill.id, skill]));
const domainsById = new Map(allDomains.map((domain) => [domain.id, domain]));

const initialPersistentState = {
  attempts: [],
  sessions: [],
  selectedSection: "All",
};

function loadPersistentState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return { ...initialPersistentState };
    return {
      attempts: Array.isArray(saved.attempts) ? saved.attempts : [],
      sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
      selectedSection: ["All", "Math", "Reading & Writing"].includes(saved.selectedSection)
        ? saved.selectedSection
        : "All",
    };
  } catch {
    return { ...initialPersistentState };
  }
}

const persistent = loadPersistentState();
const state = {
  view: "today",
  attempts: persistent.attempts,
  sessions: persistent.sessions,
  selectedSection: persistent.selectedSection,
  currentSet: null,
  lastSession: null,
  response: "",
  scratchOpen: false,
  scratchText: "",
  isGenerating: false,
  toast: null,
  settingsOpen: false,
  settingsTesting: false,
  settingsDraft: {
    apiKey: sessionStorage.getItem(SESSION_KEY) || "",
    model: localStorage.getItem(MODEL_KEY) || "gpt-5-mini",
  },
};

function saveProgress() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      attempts: state.attempts,
      sessions: state.sessions,
      selectedSection: state.selectedSection,
    }),
  );
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function multiline(value = "") {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function icon(name, size = 20) {
  const paths = {
    home: '<path d="M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-9Z"/><path d="M9 21v-6h6v6"/>',
    map: '<path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/><path d="M2 20h22"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2 2-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V20h-2.8v-.08A1.7 1.7 0 0 0 11 18.37a1.7 1.7 0 0 0-1.87.34l-.06.06-2-2 .06-.06A1.7 1.7 0 0 0 7.47 15a1.7 1.7 0 0 0-1.56-1.04H5.8v-2.8h.1A1.7 1.7 0 0 0 7.47 10a1.7 1.7 0 0 0-.34-1.87l-.06-.06 2-2 .06.06a1.7 1.7 0 0 0 1.87.34 1.7 1.7 0 0 0 1.04-1.56V4.8h2.8v.1A1.7 1.7 0 0 0 15.87 6.47a1.7 1.7 0 0 0 1.87-.34l.06-.06 2 2-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.56 1.04h.1v2.8h-.1A1.7 1.7 0 0 0 19.4 15Z"/>',
    spark: '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    check: '<path d="m5 12 4.2 4.2L19 6.5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 19h16"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    brain: '<path d="M9.5 4.5A3.3 3.3 0 0 0 4 7a3.1 3.1 0 0 0 .7 5.4A3.5 3.5 0 0 0 9 17.5V20h6v-2.5a3.5 3.5 0 0 0 4.3-5.1A3.1 3.1 0 0 0 20 7a3.3 3.3 0 0 0-5.5-2.5A3.5 3.5 0 0 0 12 3.5a3.5 3.5 0 0 0-2.5 1Z"/><path d="M9 9.5c1.5 0 2 1 2 2.5V14M15 9.5c-1.5 0-2 1-2 2.5V14M8 15.5h8"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    flag: '<path d="M5 22V4"/><path d="M5 5c4-2 6 2 10 0v9c-4 2-6-2-10 0"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}

function skillMeta(skillId) {
  return skillsById.get(skillId) || {
    id: skillId,
    title: "SAT skill",
    description: "Practice this SAT skill.",
    domainId: "",
    domainTitle: "SAT practice",
    section: "Math",
  };
}

function attemptsFor(skillId) {
  return state.attempts.filter((attempt) => attempt.skillId === skillId);
}

function getMastery(skillId) {
  const attempts = attemptsFor(skillId).slice(-8);
  if (!attempts.length) return null;
  const weighted = attempts.reduce((sum, attempt, index) => {
    const weight = index + 1;
    return sum + (attempt.correct ? weight : 0);
  }, 0);
  const totalWeight = (attempts.length * (attempts.length + 1)) / 2;
  return Math.round((weighted / totalWeight) * 100);
}

function totalAccuracy(attempts = state.attempts) {
  if (!attempts.length) return null;
  return Math.round((attempts.filter((attempt) => attempt.correct).length / attempts.length) * 100);
}

function getDomainMastery(domainId) {
  const attempts = state.attempts.filter((attempt) => attempt.domainId === domainId);
  return totalAccuracy(attempts);
}

function masteryLabel(score) {
  if (score === null) return "Not started";
  if (score >= 80) return "Strong";
  if (score >= 60) return "Building";
  return "Focus";
}

function getRecommendation() {
  const attempted = allSkills
    .map((skill) => ({ skill, score: getMastery(skill.id), count: attemptsFor(skill.id).length }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => a.score - b.score || b.count - a.count);
  if (attempted.length) return attempted[0].skill;
  return skillMeta("linear-equations-one-variable");
}

function getStrength() {
  const attempted = allSkills
    .map((skill) => ({ skill, score: getMastery(skill.id), count: attemptsFor(skill.id).length }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.score - a.score || b.count - a.count);
  return attempted[0]?.skill || null;
}

function getFilteredTopics() {
  if (state.selectedSection === "All") return SAT_TOPICS;
  return SAT_TOPICS.filter((section) => section.title === state.selectedSection);
}

function normalizeAnswer(value) {
  const string = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("−", "-")
    .replaceAll("$", "")
    .replaceAll(",", "")
    .replace(/\s+/g, "");
  return string;
}

function isCorrectAnswer(answer, expected) {
  const normalizedAnswer = normalizeAnswer(answer);
  const normalizedExpected = normalizeAnswer(expected);
  if (!normalizedAnswer) return false;
  if (normalizedAnswer === normalizedExpected) return true;
  const answerNumber = Number(normalizedAnswer);
  const expectedNumber = Number(normalizedExpected);
  return Number.isFinite(answerNumber) && Number.isFinite(expectedNumber) && Math.abs(answerNumber - expectedNumber) < 0.00001;
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
  } catch {
    return "Today";
  }
}

function scoreColor(score) {
  if (score === null) return "neutral";
  if (score >= 80) return "strong";
  if (score >= 60) return "building";
  return "focus";
}

function getQuestionPool({ section = "All", skillId } = {}) {
  let pool = QUESTION_BANK;
  if (section !== "All") pool = pool.filter((question) => question.section === section);
  return pool;
}

function deterministicShuffle(items, salt = 0) {
  return [...items].sort((a, b) => {
    const valueA = [...a.id].reduce((sum, character) => sum + character.charCodeAt(0), salt);
    const valueB = [...b.id].reduce((sum, character) => sum + character.charCodeAt(0), salt);
    return valueA - valueB;
  });
}

function makePracticeSet({ section = "All", skillId, count = SESSION_SIZE } = {}) {
  const pool = getQuestionPool({ section, skillId });
  const recommendation = getRecommendation();
  const chosenSkill = skillId || (recommendation.section === section || section === "All" ? recommendation.id : null);
  const focused = chosenSkill ? pool.filter((question) => question.skillId === chosenSkill) : [];
  const remaining = pool.filter((question) => !focused.some((candidate) => candidate.id === question.id));
  const weaknessOrder = deterministicShuffle(remaining, state.attempts.length)
    .map((question) => ({ question, score: getMastery(question.skillId) }))
    .sort((a, b) => (a.score ?? 50) - (b.score ?? 50));
  const questions = [...focused, ...weaknessOrder.map(({ question }) => question)].slice(0, Math.min(count, pool.length));
  return questions;
}

function questionForCurrent() {
  return state.currentSet?.questions[state.currentSet.index] || null;
}

function persistentMessage() {
  return state.settingsDraft.apiKey ? "AI practice is on" : "Original offline practice ready";
}

function navItem(id, label, glyph) {
  const active = state.view === id;
  return `<button class="nav-item ${active ? "is-active" : ""}" data-action="navigate" data-view="${id}" aria-current="${active ? "page" : "false"}">
    ${icon(glyph, 19)}<span>${label}</span>
  </button>`;
}

function appShell(content) {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <button class="brand" data-action="navigate" data-view="today" aria-label="Northstar SAT home">
          <span class="brand-mark">${icon("spark", 20)}</span>
          <span>northstar<span>sat</span></span>
        </button>
        <div class="nav-stack">
          <p class="side-label">Workspace</p>
          ${navItem("today", "Today", "home")}
          ${navItem("topics", "Topic map", "map")}
          ${navItem("progress", "Progress", "chart")}
        </div>
        <div class="sidebar-spacer"></div>
        <div class="sidebar-note">
          <span class="note-icon">${icon(state.settingsDraft.apiKey ? "spark" : "book", 16)}</span>
          <div><strong>${state.settingsDraft.apiKey ? "AI tuned" : "Practice ready"}</strong><span>${state.settingsDraft.apiKey ? "Personalized sets enabled" : "No key needed to start"}</span></div>
        </div>
        <button class="nav-item settings-button" data-action="open-settings">${icon("gear", 19)}<span>Settings</span></button>
      </aside>
      <main class="main-content">${content}</main>
    </div>
    ${renderSettingsModal()}
    ${state.toast ? `<div class="toast toast-${escapeHtml(state.toast.kind || "info")}">${icon(state.toast.kind === "error" ? "close" : "check", 17)}<span>${escapeHtml(state.toast.message)}</span></div>` : ""}
  `;
}

function renderTopbar(title, subtitle = "") {
  return `<header class="topbar">
    <div>
      <p class="eyebrow">Northstar SAT</p>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="topbar-subtitle">${escapeHtml(subtitle)}</p>` : ""}
    </div>
    <div class="topbar-actions">
      <span class="live-status"><i></i>${persistentMessage()}</span>
      <button class="icon-button mobile-settings" data-action="open-settings" aria-label="Open settings">${icon("gear", 20)}</button>
    </div>
  </header>`;
}

function renderToday() {
  const recommendation = getRecommendation();
  const recommendationMastery = getMastery(recommendation.id);
  const accuracy = totalAccuracy();
  const strength = getStrength();
  const hasAttempts = state.attempts.length > 0;

  return appShell(`
    ${renderTopbar("Your next smart step", hasAttempts ? "Your plan updates with every answer." : "Start with a short diagnostic. We’ll take it from there.")}
    <div class="content-grid today-grid">
      <section class="hero-panel">
        <div class="hero-glow"></div>
        <div class="hero-copy">
          <span class="pill pill-light">${icon("target", 15)} ${hasAttempts ? "Adaptive plan" : "Start your baseline"}</span>
          <h2>${hasAttempts ? `Build confidence in <em>${escapeHtml(recommendation.title)}</em>.` : "Find the skill that will move you forward."}</h2>
          <p>${hasAttempts ? `Your recent answers point to ${escapeHtml(recommendation.title)} as the highest-leverage place to practice next.` : "Take five original SAT-style questions across the official content domains. Your plan will become personalized as you go."}</p>
          <div class="hero-actions">
            <button class="button button-primary button-large" data-action="start-practice" data-skill-id="${escapeHtml(recommendation.id)}">
              ${icon("spark", 18)} ${hasAttempts ? "Practice this skill" : "Start 5-question check"}
            </button>
            <button class="button button-ghost-light" data-action="navigate" data-view="topics">Explore topics ${icon("arrow", 17)}</button>
          </div>
        </div>
        <div class="hero-metric">
          <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
          <div class="metric-card">
            <span>${hasAttempts ? "Mastery signal" : "Diagnostic"}</span>
            <strong>${recommendationMastery === null ? "5 Q" : `${recommendationMastery}%`}</strong>
            <small>${hasAttempts ? masteryLabel(recommendationMastery) : "a calm starting point"}</small>
          </div>
        </div>
      </section>

      <section class="section-heading quick-heading"><div><p class="eyebrow">Choose your lane</p><h2>What do you want to work on?</h2></div><span class="subtle-count">Official digital SAT domains</span></section>
      <section class="lane-grid">
        ${SAT_TOPICS.map((section) => {
          const sectionAttempts = state.attempts.filter((attempt) => attempt.section === section.title);
          const score = totalAccuracy(sectionAttempts);
          return `<article class="lane-card lane-${section.color}">
            <div class="lane-icon">${icon(section.id === "math" ? "layers" : "book", 22)}</div>
            <div class="lane-card-head"><div><h3>${section.title}</h3><p>${section.eyebrow}</p></div><span class="score-badge ${scoreColor(score)}">${score === null ? "New" : `${score}%`}</span></div>
            <p class="lane-description">${escapeHtml(section.description)}</p>
            <div class="lane-footer"><span>${section.domains.length} content domains</span><button class="text-button" data-action="start-practice" data-section="${escapeHtml(section.title)}">Practice ${icon("arrow", 16)}</button></div>
          </article>`;
        }).join("")}
      </section>

      <section class="section-heading"><div><p class="eyebrow">Your signals</p><h2>${hasAttempts ? "Learn from every attempt" : "Your practice signals will appear here"}</h2></div><button class="quiet-button" data-action="navigate" data-view="progress">View full progress ${icon("arrow", 16)}</button></section>
      <section class="signal-grid">
        <article class="signal-card accent-violet">
          <div class="signal-card-top"><span class="signal-icon">${icon("brain", 19)}</span><span>Adaptive focus</span></div>
          <h3>${hasAttempts ? escapeHtml(recommendation.title) : "Your first diagnostic"}</h3>
          <p>${hasAttempts ? `${attemptsFor(recommendation.id).length} attempt${attemptsFor(recommendation.id).length === 1 ? "" : "s"} · ${recommendation.domainTitle}` : "We’ll look for patterns before naming a weak spot."}</p>
          <button class="inline-button" data-action="start-practice" data-skill-id="${escapeHtml(recommendation.id)}">${hasAttempts ? "Drill this skill" : "Begin now"} ${icon("arrow", 15)}</button>
        </article>
        <article class="signal-card accent-teal">
          <div class="signal-card-top"><span class="signal-icon">${icon("chart", 19)}</span><span>Overall accuracy</span></div>
          <h3>${accuracy === null ? "—" : `${accuracy}%`}</h3>
          <p>${hasAttempts ? `${state.attempts.length} question${state.attempts.length === 1 ? "" : "s"} answered · weighted toward your latest work` : "A score appears after your first answer."}</p>
          <span class="signal-foot">${hasAttempts ? "Keep going—small sets add up." : "No pressure. Start anywhere."}</span>
        </article>
        <article class="signal-card accent-amber">
          <div class="signal-card-top"><span class="signal-icon">${icon("flag", 19)}</span><span>${strength ? "Current strength" : "How it works"}</span></div>
          <h3>${strength ? escapeHtml(strength.title) : "A smarter loop"}</h3>
          <p>${strength ? `${getMastery(strength.id)}% recent mastery · ${strength.domainTitle}` : "Answer → understand → practice the exact skill that needs attention."}</p>
          <button class="inline-button" data-action="navigate" data-view="topics">See the syllabus ${icon("arrow", 15)}</button>
        </article>
      </section>

      <section class="source-banner">
        <span class="source-icon">${icon("book", 20)}</span>
        <div><strong>Built from the official SAT content framework.</strong><p>Northstar uses the public College Board topic taxonomy and creates original practice—never scraped or copied test items.</p></div>
        <button class="text-button" data-action="navigate" data-view="topics">See sources ${icon("arrow", 16)}</button>
      </section>
    </div>
  `);
}

function renderMasteryBar(score) {
  const width = score === null ? 0 : score;
  return `<div class="mastery-bar" aria-label="${score === null ? "Not started" : `${score}% mastery`}"><span class="mastery-fill ${scoreColor(score)}" style="width:${width}%"></span></div>`;
}

function renderTopics() {
  const topics = getFilteredTopics();
  const totalSkillCount = topics.reduce((sum, section) => sum + section.domains.reduce((domainSum, domain) => domainSum + domain.skills.length, 0), 0);
  return appShell(`
    ${renderTopbar("Topic map", "Every official Digital SAT domain, organized into skills you can actually practice.")}
    <div class="content-grid topics-grid">
      <section class="topic-intro">
        <div><p class="eyebrow">Official syllabus</p><h2>Navigate ${totalSkillCount} skills with purpose.</h2><p>Choose a skill to drill it now, or let the adaptive plan decide where your next set will help most.</p></div>
        <div class="segmented-control" role="tablist" aria-label="Section filter">
          ${["All", "Math", "Reading & Writing"].map((section) => `<button class="${state.selectedSection === section ? "is-selected" : ""}" data-action="filter-section" data-section="${escapeHtml(section)}">${escapeHtml(section)}</button>`).join("")}
        </div>
      </section>
      <div class="taxonomy-list">
        ${topics.map((section) => `<section class="section-cluster">
          <div class="cluster-title"><div class="cluster-badge ${section.color}">${icon(section.id === "math" ? "layers" : "book", 20)}</div><div><p class="eyebrow">${escapeHtml(section.eyebrow)}</p><h2>${escapeHtml(section.title)}</h2></div><button class="quiet-button cluster-practice" data-action="start-practice" data-section="${escapeHtml(section.title)}">Mixed set ${icon("arrow", 16)}</button></div>
          <div class="domain-stack">
            ${section.domains.map((domain) => {
              const score = getDomainMastery(domain.id);
              return `<article class="domain-card">
                <div class="domain-card-top">
                  <div><div class="domain-title-line"><h3>${escapeHtml(domain.title)}</h3><span>${domain.weight}% of section</span></div><p>${escapeHtml(domain.description)}</p></div>
                  <div class="domain-score"><strong>${score === null ? "—" : `${score}%`}</strong><small>${masteryLabel(score)}</small></div>
                </div>
                ${renderMasteryBar(score)}
                <div class="skill-list">
                  ${domain.skills.map((skill) => {
                    const skillScore = getMastery(skill.id);
                    const attempts = attemptsFor(skill.id).length;
                    return `<article class="skill-row">
                      <div class="skill-state ${scoreColor(skillScore)}">${skillScore === null ? icon("target", 15) : skillScore >= 80 ? icon("check", 15) : icon("spark", 15)}</div>
                      <div class="skill-copy"><h4>${escapeHtml(skill.title)}</h4><p>${escapeHtml(skill.description)}</p></div>
                      <div class="skill-progress"><strong>${skillScore === null ? "—" : `${skillScore}%`}</strong><small>${attempts ? `${attempts} attempt${attempts === 1 ? "" : "s"}` : "New"}</small></div>
                      <button class="skill-practice" data-action="start-practice" data-skill-id="${escapeHtml(skill.id)}" aria-label="Practice ${escapeHtml(skill.title)}">Practice ${icon("chevron", 16)}</button>
                    </article>`;
                  }).join("")}
                </div>
              </article>`;
            }).join("")}
          </div>
        </section>`).join("")}
      </div>
      <section class="sources-card">
        <div class="sources-heading"><span>${icon("book", 19)}</span><div><p class="eyebrow">Research notes</p><h2>Canonical topic sources</h2></div></div>
        <p>The taxonomy above follows the public College Board descriptions. The practice questions in this app are original and independently generated.</p>
        <div class="source-links">${SAT_SOURCES.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)} ${icon("arrow", 15)}</a>`).join("")}</div>
      </section>
    </div>
  `);
}

function renderPractice() {
  const question = questionForCurrent();
  if (!question) return renderToday();
  const skill = skillMeta(question.skillId);
  const answerRecord = state.currentSet.responses[question.id];
  const hasSubmitted = Boolean(answerRecord);
  const progress = Math.round(((state.currentSet.index + (hasSubmitted ? 1 : 0)) / state.currentSet.questions.length) * 100);
  const choiceMarkup = question.type === "multiple_choice"
    ? `<div class="choice-list" role="radiogroup" aria-label="Answer choices">${question.choices.map((choice, index) => {
      const letter = String.fromCharCode(65 + index);
      const selected = state.response === choice;
      const isAnswer = choice === question.answer;
      const answerClass = hasSubmitted ? (isAnswer ? "is-correct" : selected ? "is-incorrect" : "") : selected ? "is-selected" : "";
      return `<button class="answer-choice ${answerClass}" data-action="select-choice" data-choice-index="${index}" ${hasSubmitted ? "disabled" : ""}>
        <span class="choice-letter">${letter}</span><span>${escapeHtml(choice)}</span>${hasSubmitted && isAnswer ? `<span class="choice-result">${icon("check", 17)}</span>` : ""}
      </button>`;
    }).join("")}</div>`
    : `<div class="grid-answer"><label for="student-response">Enter your answer</label><div class="grid-input-wrap"><input id="student-response" data-input="response" inputmode="decimal" autocomplete="off" placeholder="e.g. 12" value="${escapeHtml(state.response)}" ${hasSubmitted ? "disabled" : ""}/><span>Grid-in</span></div>${hasSubmitted ? `<p class="grid-answer-result ${answerRecord.correct ? "correct" : "incorrect"}">${answerRecord.correct ? "Correct answer" : "Correct answer:"} <strong>${escapeHtml(question.answer)}</strong></p>` : ""}</div>`;

  return appShell(`
    <div class="practice-layout">
      <header class="practice-topbar">
        <button class="back-link" data-action="navigate" data-view="today">${icon("chevron", 16)} Exit practice</button>
        <div class="practice-progress"><span>Question ${state.currentSet.index + 1} of ${state.currentSet.questions.length}</span><div class="practice-progress-track"><i style="width:${progress}%"></i></div></div>
        <span class="practice-mode">${state.currentSet.source === "ai" ? `${icon("spark", 15)} AI set` : `${icon("book", 15)} Practice set`}</span>
      </header>
      <div class="practice-body">
        <aside class="practice-meta">
          <span class="section-chip ${question.section === "Math" ? "math" : "rw"}">${escapeHtml(question.section)}</span>
          <div><p class="eyebrow">Skill</p><h3>${escapeHtml(skill.title)}</h3><p>${escapeHtml(skill.domainTitle)}</p></div>
          <div class="difficulty"><span>Difficulty</span><div>${["Easy", "Medium", "Hard"].map((difficulty) => `<i class="${question.difficulty === difficulty ? "active" : ""}"></i>`).join("")}</div><strong>${escapeHtml(question.difficulty)}</strong></div>
          <button class="scratch-toggle ${state.scratchOpen ? "is-open" : ""}" data-action="toggle-scratch">${icon("book", 17)} Scratchpad</button>
        </aside>
        <section class="question-stage">
          ${state.isGenerating ? `<div class="ai-generating"><span class="mini-spinner"></span><span>AI is refining a fresh set in the background. Your original practice is ready now.</span></div>` : ""}
          <div class="question-heading"><p class="eyebrow">${escapeHtml(skill.domainTitle)} · ${escapeHtml(question.difficulty)}</p><h1>Take your time. Show your thinking.</h1></div>
          <div class="question-stem">${multiline(question.stem)}</div>
          ${choiceMarkup}
          ${state.scratchOpen ? `<label class="scratchpad"><span>${icon("book", 16)} Private scratchpad</span><textarea data-input="scratch" placeholder="Jot down a formula, a quick outline, or your next step…">${escapeHtml(state.scratchText)}</textarea></label>` : ""}
          ${hasSubmitted ? renderFeedback(question, answerRecord) : `<div class="submit-row"><p>${question.type === "grid_in" ? "Enter a number, decimal, or fraction." : "Choose the best answer."}</p><button class="button button-primary" data-action="submit-answer" ${state.response ? "" : "disabled"}>Check answer ${icon("arrow", 17)}</button></div>`}
        </section>
      </div>
    </div>
  `);
}

function renderFeedback(question, answerRecord) {
  const ai = answerRecord.aiFeedback;
  const nextLabel = state.currentSet.index === state.currentSet.questions.length - 1 ? "See session results" : "Next question";
  return `<section class="feedback-panel ${answerRecord.correct ? "feedback-correct" : "feedback-incorrect"}">
    <div class="feedback-status"><span>${answerRecord.correct ? icon("check", 20) : icon("spark", 20)}</span><div><p>${answerRecord.correct ? "Nice work" : "Good attempt"}</p><h3>${answerRecord.correct ? "You got it." : "Here’s the key move."}</h3></div></div>
    <div class="feedback-explanation"><strong>${answerRecord.correct ? "Why it works" : "Walkthrough"}</strong><p>${escapeHtml(question.explanation)}</p></div>
    <div class="strategy-note"><span>${icon("target", 17)}</span><p><strong>Strategy:</strong> ${escapeHtml(question.strategy)}</p></div>
    ${state.settingsDraft.apiKey ? `<div class="ai-tutor-note"><span>${icon("spark", 16)}</span><div>${ai ? `<strong>${escapeHtml(ai.misconception)}</strong><p>${escapeHtml(ai.feedback)} ${escapeHtml(ai.nextStep)}</p>` : `<strong>Personal tutor is thinking…</strong><p>We’re adding a quick misconception check for this answer.</p>`}</div></div>` : ""}
    <div class="feedback-actions"><button class="button button-primary" data-action="next-question">${nextLabel} ${icon("arrow", 17)}</button><span>${answerRecord.correct ? "This skill just got a stronger signal." : "We’ll bring this skill back at the right time."}</span></div>
  </section>`;
}

function renderProgress() {
  const accuracy = totalAccuracy();
  const recommendation = getRecommendation();
  const strength = getStrength();
  const attemptedDomains = allDomains.filter((domain) => state.attempts.some((attempt) => attempt.domainId === domain.id));
  const recentSessions = state.sessions.slice(0, 5);

  return appShell(`
    ${renderTopbar("Progress, with context", state.attempts.length ? "A helpful signal is more useful than a vague score." : "Complete a short set to turn this page into your study plan.")}
    <div class="content-grid progress-grid">
      <section class="progress-summary-grid">
        <article class="summary-card summary-primary"><p>Questions answered</p><strong>${state.attempts.length}</strong><span>${state.sessions.length ? `${state.sessions.length} completed set${state.sessions.length === 1 ? "" : "s"}` : "Your first set is waiting"}</span></article>
        <article class="summary-card"><p>Overall accuracy</p><strong>${accuracy === null ? "—" : `${accuracy}%`}</strong><span>${accuracy === null ? "Not enough evidence yet" : "Across every saved attempt"}</span></article>
        <article class="summary-card"><p>Priority skill</p><strong class="summary-skill">${escapeHtml(recommendation.title)}</strong><span>${attemptsFor(recommendation.id).length ? `${getMastery(recommendation.id)}% recent mastery` : "Start a baseline here"}</span></article>
      </section>

      <section class="insight-panel">
        <div class="insight-copy"><p class="eyebrow">Adaptive readout</p><h2>${state.attempts.length ? `Next, focus on ${escapeHtml(recommendation.title)}.` : "Your first five answers will create a plan."}</h2><p>${state.attempts.length ? `Your lowest recent mastery signal is in ${escapeHtml(recommendation.domainTitle)}. A short focused drill will be more productive than a random long set.` : "Northstar tracks accuracy by skill, recency, and question difficulty—not just one blended percentage."}</p><button class="button button-primary" data-action="start-practice" data-skill-id="${escapeHtml(recommendation.id)}">${icon("spark", 17)} ${state.attempts.length ? "Start targeted practice" : "Start diagnostic"}</button></div>
        <div class="insight-target"><div class="target-ring"><span>${attemptsFor(recommendation.id).length ? `${getMastery(recommendation.id)}%` : "5 Q"}</span></div><p>${escapeHtml(recommendation.title)}</p><small>${attemptsFor(recommendation.id).length ? "current mastery" : "to learn your baseline"}</small></div>
      </section>

      <section class="section-heading"><div><p class="eyebrow">By domain</p><h2>Skill evidence</h2></div><span class="subtle-count">${attemptedDomains.length} of ${allDomains.length} domains explored</span></section>
      <section class="domain-evidence-card">
        ${allDomains.map((domain) => {
          const score = getDomainMastery(domain.id);
          const count = state.attempts.filter((attempt) => attempt.domainId === domain.id).length;
          return `<div class="evidence-row"><div class="evidence-title"><strong>${escapeHtml(domain.title)}</strong><span>${escapeHtml(domain.section)}</span></div>${renderMasteryBar(score)}<div class="evidence-score"><strong>${score === null ? "—" : `${score}%`}</strong><span>${count ? `${count} answered` : "Not started"}</span></div></div>`;
        }).join("")}
      </section>

      <section class="section-heading"><div><p class="eyebrow">Practice history</p><h2>Recent sessions</h2></div>${state.attempts.length ? `<button class="quiet-button danger-quiet" data-action="reset-progress">${icon("reset", 16)} Reset progress</button>` : ""}</section>
      ${recentSessions.length ? `<section class="session-history">${recentSessions.map((session) => `<article class="session-row"><div class="session-date"><strong>${formatDate(session.completedAt)}</strong><span>${escapeHtml(session.focusLabel || "Mixed practice")}</span></div><div class="session-mini-bar"><i style="width:${session.accuracy}%"></i></div><strong>${session.correct}/${session.count}</strong><span class="session-result ${session.accuracy >= 70 ? "good" : "review"}">${session.accuracy >= 70 ? "On track" : "Review next"}</span></article>`).join("")}</section>` : `<section class="empty-history"><span>${icon("chart", 24)}</span><h3>No completed sessions yet</h3><p>Finish a practice set and your accuracy trends and recommendations will live here.</p></section>`}

      ${strength ? `<section class="strength-banner"><span>${icon("check", 20)}</span><div><strong>A strength to keep warm: ${escapeHtml(strength.title)}</strong><p>${getMastery(strength.id)}% recent mastery. Mixed review will keep it from fading while you target weaker skills.</p></div></section>` : ""}
    </div>
  `);
}

function renderResults() {
  const session = state.lastSession;
  if (!session) return renderToday();
  const nextSkill = getRecommendation();
  const incorrect = session.responses.filter((response) => !response.correct);
  return appShell(`
    <div class="results-layout">
      <header class="results-top"><button class="back-link" data-action="navigate" data-view="today">${icon("chevron", 16)} Back to today</button><span class="live-status"><i></i>Saved to your plan</span></header>
      <section class="results-hero">
        <div><p class="eyebrow">Practice complete</p><h1>You’re building a map,<br><em>not chasing a score.</em></h1><p>${session.correct === session.count ? "A clean set. We’ll raise the challenge thoughtfully next time." : `${session.count - session.correct} answer${session.count - session.correct === 1 ? "" : "s"} gave your plan useful direction.`}</p></div>
        <div class="results-score"><div class="score-ring" style="--score:${session.accuracy}%"><div><strong>${session.accuracy}%</strong><span>${session.correct} / ${session.count} correct</span></div></div></div>
      </section>
      <section class="results-plan">
        <div class="plan-icon">${icon("spark", 22)}</div><div><p class="eyebrow">Your next move</p><h2>Practice <span>${escapeHtml(nextSkill.title)}</span> while the pattern is fresh.</h2><p>${attemptsFor(nextSkill.id).length ? `Your recent mastery signal is ${getMastery(nextSkill.id)}%. A short, targeted round will help turn that weak signal into a strength.` : "Your answers are ready to shape a focused next set."}</p></div><button class="button button-primary" data-action="start-practice" data-skill-id="${escapeHtml(nextSkill.id)}">Start targeted set ${icon("arrow", 17)}</button>
      </section>
      <section class="result-columns">
        <div class="result-review"><div class="section-heading compact"><div><p class="eyebrow">Answer review</p><h2>What you just practiced</h2></div></div>
          <div class="review-list">${session.responses.map((response, index) => {
            const question = response.question;
            const meta = skillMeta(question.skillId);
            return `<article class="review-item ${response.correct ? "review-correct" : "review-incorrect"}"><span>${response.correct ? icon("check", 17) : icon("spark", 17)}</span><div><p>${index + 1} · ${escapeHtml(meta.title)}</p><h3>${response.correct ? "Correct—keep that approach." : "Mark this skill for review."}</h3><small>${escapeHtml(question.strategy)}</small></div><strong>${response.correct ? "✓" : "↗"}</strong></article>`;
          }).join("")}</div>
        </div>
        <aside class="result-insights"><p class="eyebrow">Session insight</p><h2>${incorrect.length ? "Misses are useful data." : "Accuracy is useful data."}</h2><p>${incorrect.length ? `The next set will place more weight on ${escapeHtml(nextSkill.domainTitle)} while still mixing in material you’ve already seen.` : "Your next set will gently raise difficulty and mix in new skills so confidence stays durable."}</p><div class="result-stat"><strong>${session.source === "ai" ? "AI-generated" : "Original seed"}</strong><span>question source</span></div><button class="text-button" data-action="navigate" data-view="progress">Open progress ${icon("arrow", 16)}</button></aside>
      </section>
    </div>
  `);
}

function renderSettingsModal() {
  if (!state.settingsOpen) return "";
  return `<div class="modal-backdrop" data-action="close-settings"><section class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" data-modal-content>
    <header><div><p class="eyebrow">Personalization</p><h2 id="settings-title">AI settings</h2></div><button class="icon-button" data-action="close-settings" aria-label="Close settings">${icon("close", 20)}</button></header>
    <div class="settings-body">
      <div class="security-callout"><span>${icon("lock", 20)}</span><div><strong>Designed for local use</strong><p>Your key stays in this browser tab’s session and is sent only to the local proxy when you request AI generation or feedback. It is never saved in progress data or written to disk.</p></div></div>
      <label class="form-field"><span>OpenAI API key</span><div class="key-field"><input id="api-key" data-setting="apiKey" type="password" spellcheck="false" autocomplete="off" placeholder="sk-…" value="${escapeHtml(state.settingsDraft.apiKey)}"/><button type="button" class="reveal-key" data-action="toggle-key-visibility">Show</button></div><small>Optional. Original practice and adaptive scoring work without it.</small></label>
      <label class="form-field"><span>Model</span><input id="api-model" data-setting="model" type="text" spellcheck="false" autocomplete="off" placeholder="gpt-5-mini" value="${escapeHtml(state.settingsDraft.model)}"/><small>Use a model available to your API project and compatible with Structured Outputs.</small></label>
      <div class="settings-actions"><button class="button button-secondary" data-action="test-api" ${state.settingsTesting ? "disabled" : ""}>${state.settingsTesting ? '<span class="mini-spinner"></span> Checking…' : `${icon("check", 16)} Test connection`}</button><button class="button button-primary" data-action="save-settings">Save settings ${icon("arrow", 16)}</button></div>
      ${state.settingsDraft.apiKey ? `<button class="forget-key" data-action="forget-key">Forget key from this tab</button>` : ""}
    </div>
  </section></div>`;
}

function render() {
  if (state.view === "topics") app.innerHTML = renderTopics();
  else if (state.view === "practice") app.innerHTML = renderPractice();
  else if (state.view === "progress") app.innerHTML = renderProgress();
  else if (state.view === "results") app.innerHTML = renderResults();
  else app.innerHTML = renderToday();
}

function notify(message, kind = "success") {
  state.toast = { message, kind };
  render();
  window.clearTimeout(notify.timeout);
  notify.timeout = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 3800);
}

function selectTopicsForAI({ section = "All", skillId }) {
  const focusedSkill = skillId ? skillMeta(skillId) : null;
  const candidates = getQuestionPool({ section: focusedSkill?.section || section });
  const uniqueSkills = focusedSkill ? [focusedSkill] : [];
  for (const question of candidates) {
    if (!uniqueSkills.some((item) => item.id === question.skillId)) uniqueSkills.push(skillMeta(question.skillId));
    if (uniqueSkills.length >= SESSION_SIZE) break;
  }
  return uniqueSkills.map((skill) => ({
    section: skill.section,
    domainId: skill.domainId,
    domain: skill.domainTitle,
    skillId: skill.id,
    skill: skill.title,
    description: skill.description,
  }));
}

function normalizeAIQuestion(question) {
  const skill = skillMeta(question.skillId);
  const type = question.type === "grid_in" ? "grid_in" : "multiple_choice";
  const choices = Array.isArray(question.choices) ? question.choices.slice(0, 4).map(String) : [];
  if (!question?.stem || !question?.answer || (type === "multiple_choice" && choices.length !== 4)) return null;
  if (type === "multiple_choice" && !choices.some((choice) => normalizeAnswer(choice) === normalizeAnswer(question.answer))) return null;
  return {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    section: skill.section,
    domainId: skill.domainId,
    skillId: skill.id,
    difficulty: ["Easy", "Medium", "Hard"].includes(question.difficulty) ? question.difficulty : "Medium",
    type,
    stem: String(question.stem).slice(0, 2800),
    choices,
    answer: String(question.answer).slice(0, 300),
    explanation: String(question.explanation || "Review the relationship stated in the question.").slice(0, 1400),
    strategy: String(question.strategy || "Work from the information given, one step at a time.").slice(0, 800),
  };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}

async function tryGenerateAISet(set, options) {
  if (!state.settingsDraft.apiKey || !set || set.responses && Object.keys(set.responses).length) return;
  state.isGenerating = true;
  render();
  try {
    const focus = options.skillId ? skillMeta(options.skillId) : getRecommendation();
    const history = state.attempts.length
      ? `The learner has ${state.attempts.length} logged answer(s). Current priority: ${focus.title} in ${focus.domainTitle}. Generate an appropriately challenging set.`
      : "This is a new learner. Use a balanced diagnostic difficulty, mostly medium with one approachable entry point.";
    const result = await postJson("/api/generate", {
      apiKey: state.settingsDraft.apiKey,
      model: state.settingsDraft.model,
      topics: selectTopicsForAI(options),
      count: SESSION_SIZE,
      difficulty: state.attempts.length > 8 ? "Medium" : "Easy",
      learnerContext: history,
    });
    const generated = (result.questions || []).map(normalizeAIQuestion).filter(Boolean);
    if (generated.length >= 3 && state.currentSet === set && !Object.keys(set.responses).length) {
      set.questions = generated;
      set.index = 0;
      set.source = "ai";
      state.response = "";
      state.scratchText = "";
      notify("Fresh AI practice set ready.");
    } else if (!generated.length) {
      notify("AI set could not be validated. Your original set is still ready.", "error");
    }
  } catch (error) {
    notify(error instanceof Error ? `${error.message} Original practice is still ready.` : "AI practice was unavailable. Original practice is still ready.", "error");
  } finally {
    state.isGenerating = false;
    render();
  }
}

function startPractice(options = {}) {
  const section = options.section || "All";
  const skillId = options.skillId || null;
  const questions = makePracticeSet({ section, skillId, count: SESSION_SIZE });
  if (!questions.length) return notify("No practice questions are available for that selection.", "error");
  const focus = skillId ? skillMeta(skillId) : section === "All" ? null : { title: section };
  const set = {
    id: `set-${Date.now()}`,
    questions,
    index: 0,
    responses: {},
    startedAt: new Date().toISOString(),
    source: "seed",
    focusLabel: focus?.title || "Mixed practice",
  };
  state.currentSet = set;
  state.response = "";
  state.scratchText = "";
  state.scratchOpen = false;
  state.view = "practice";
  render();
  if (state.settingsDraft.apiKey) void tryGenerateAISet(set, { section, skillId });
}

async function addAiFeedback(question, record) {
  if (!state.settingsDraft.apiKey) return;
  try {
    const result = await postJson("/api/analyze", {
      apiKey: state.settingsDraft.apiKey,
      model: state.settingsDraft.model,
      question: question.stem,
      learnerAnswer: record.answer,
      correctAnswer: question.answer,
      skill: {
        title: skillMeta(question.skillId).title,
        description: skillMeta(question.skillId).description,
      },
      deterministicResult: record.correct,
    });
    record.aiFeedback = result;
    if (state.view === "practice" || state.view === "results") render();
  } catch {
    record.aiFeedback = {
      misconception: "Tutor note unavailable",
      feedback: "Your local explanation is still available above.",
      nextStep: "Try one more question in this skill when you’re ready.",
    };
    if (state.view === "practice" || state.view === "results") render();
  }
}

function submitCurrentAnswer() {
  const question = questionForCurrent();
  if (!question || !state.response) return;
  const correct = isCorrectAnswer(state.response, question.answer);
  const record = {
    question,
    answer: state.response,
    correct,
    answeredAt: new Date().toISOString(),
  };
  state.currentSet.responses[question.id] = record;
  state.attempts.push({
    id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    skillId: question.skillId,
    domainId: question.domainId,
    section: question.section,
    difficulty: question.difficulty,
    correct,
    response: state.response,
    timestamp: record.answeredAt,
    source: state.currentSet.source,
  });
  saveProgress();
  render();
  void addAiFeedback(question, record);
}

function finishSet() {
  const responses = Object.values(state.currentSet.responses);
  const correct = responses.filter((response) => response.correct).length;
  const session = {
    id: state.currentSet.id,
    completedAt: new Date().toISOString(),
    count: responses.length,
    correct,
    accuracy: Math.round((correct / responses.length) * 100),
    focusLabel: state.currentSet.focusLabel,
    source: state.currentSet.source,
    responses,
  };
  state.sessions.unshift(session);
  state.sessions = state.sessions.slice(0, 20);
  state.lastSession = session;
  state.currentSet = null;
  state.view = "results";
  saveProgress();
  render();
}

function advanceQuestion() {
  if (!state.currentSet) return;
  if (state.currentSet.index >= state.currentSet.questions.length - 1) return finishSet();
  state.currentSet.index += 1;
  state.response = "";
  state.scratchText = "";
  state.scratchOpen = false;
  render();
}

function openSettings() {
  state.settingsOpen = true;
  render();
  window.setTimeout(() => document.querySelector("#api-key")?.focus(), 0);
}

function closeSettings() {
  state.settingsOpen = false;
  render();
}

function saveSettings() {
  const key = state.settingsDraft.apiKey.trim();
  const model = state.settingsDraft.model.trim() || "gpt-5-mini";
  state.settingsDraft.apiKey = key;
  state.settingsDraft.model = model;
  if (key) sessionStorage.setItem(SESSION_KEY, key);
  else sessionStorage.removeItem(SESSION_KEY);
  localStorage.setItem(MODEL_KEY, model);
  state.settingsOpen = false;
  render();
  notify(key ? "AI settings saved for this browser tab." : "AI key removed. Original practice remains available.");
}

async function testApiConnection() {
  if (!state.settingsDraft.apiKey.trim()) return notify("Enter an API key before testing it.", "error");
  state.settingsTesting = true;
  render();
  try {
    await postJson("/api/health", { apiKey: state.settingsDraft.apiKey });
    notify("Connection verified. You can save and generate a personalized set.");
  } catch (error) {
    notify(error instanceof Error ? error.message : "The connection could not be verified.", "error");
  } finally {
    state.settingsTesting = false;
    render();
  }
}

function resetProgress() {
  if (!window.confirm("Reset all saved practice attempts and session history? This cannot be undone.")) return;
  state.attempts = [];
  state.sessions = [];
  state.lastSession = null;
  saveProgress();
  render();
  notify("Progress reset. Your API settings were kept.");
}

app.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  if (target.dataset.input === "response") {
    state.response = target.value;
    const submit = document.querySelector('[data-action="submit-answer"]');
    if (submit instanceof HTMLButtonElement) submit.disabled = !state.response.trim();
  }
  if (target.dataset.input === "scratch") state.scratchText = target.value;
  if (target.dataset.setting === "apiKey") state.settingsDraft.apiKey = target.value;
  if (target.dataset.setting === "model") state.settingsDraft.model = target.value;
});

app.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
  if (!target) return;
  const action = target.dataset.action;
  if (action === "close-settings" && target.hasAttribute("data-modal-content")) return;
  if (action === "navigate") {
    state.view = target.dataset.view || "today";
    render();
  }
  if (action === "filter-section") {
    state.selectedSection = target.dataset.section || "All";
    saveProgress();
    render();
  }
  if (action === "start-practice") startPractice({ section: target.dataset.section, skillId: target.dataset.skillId });
  if (action === "select-choice") {
    const question = questionForCurrent();
    if (!question || state.currentSet?.responses[question.id]) return;
    state.response = question.choices[Number(target.dataset.choiceIndex)] || "";
    render();
  }
  if (action === "submit-answer") submitCurrentAnswer();
  if (action === "next-question") advanceQuestion();
  if (action === "toggle-scratch") {
    state.scratchOpen = !state.scratchOpen;
    render();
  }
  if (action === "open-settings") openSettings();
  if (action === "close-settings") closeSettings();
  if (action === "save-settings") saveSettings();
  if (action === "test-api") void testApiConnection();
  if (action === "forget-key") {
    state.settingsDraft.apiKey = "";
    sessionStorage.removeItem(SESSION_KEY);
    render();
    notify("API key forgotten from this browser tab.");
  }
  if (action === "toggle-key-visibility") {
    const keyInput = document.querySelector("#api-key");
    if (keyInput instanceof HTMLInputElement) {
      const visible = keyInput.type === "text";
      keyInput.type = visible ? "password" : "text";
      target.textContent = visible ? "Show" : "Hide";
    }
  }
  if (action === "reset-progress") resetProgress();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.settingsOpen) closeSettings();
  if (event.key === "Enter" && state.view === "practice" && questionForCurrent()?.type === "grid_in" && state.response && !state.currentSet?.responses[questionForCurrent().id]) {
    submitCurrentAnswer();
  }
});

render();
