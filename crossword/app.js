/* Spelling Word Games: shared helpers used by both games and the side panels.
   Storage, settings, word lists, progress, speech, sound effects, the "say it" coach,
   dialogs, tabs and printing. */
const App = (function () {
    "use strict";

    // Inside an embedded viewer (an iframe) printing and links back to the site don't work.
    const TOP = (() => { try { return window.self === window.top; } catch (e) { return false; } })();
    document.documentElement.classList.toggle("embedded", !TOP);

    // ---------- Storage (always optional) ----------

    const PREFIX = "spelling-games:";
    const store = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem(PREFIX + key);
                return raw == null ? fallback : JSON.parse(raw);
            } catch (e) {
                return fallback;
            }
        },
        set(key, value) {
            try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
        },
        remove(key) {
            try { localStorage.removeItem(PREFIX + key); } catch (e) { /* storage unavailable */ }
        }
    };

    // ---------- Settings ----------

    const LEVELS = {
        easy: { label: "Easy", ws: { size: 9, count: 6, dirs: "straight", maxLen: 9 }, cw: { count: 6, maxLen: 9, maxSize: 11 } },
        medium: { label: "Medium", ws: { size: 11, count: 8, dirs: "diagonal", maxLen: 11 }, cw: { count: 8, maxLen: 11, maxSize: 13 } },
        hard: { label: "Hard", ws: { size: 13, count: 11, dirs: "all", maxLen: 14 }, cw: { count: 12, maxLen: 14, maxSize: 15 } }
    };

    const DEFAULTS = {
        level: "medium",
        listSource: "builtin",
        voice: "",
        rate: 0.85,
        sfx: true,
        textSize: "normal",
        contrast: "normal",
        theme: "auto"
    };

    const settings = Object.assign({}, DEFAULTS, store.get("settings", {}));
    if (!LEVELS[settings.level]) settings.level = DEFAULTS.level;
    let themeSetByApp = false;

    function saveSettings() {
        store.set("settings", settings);
        applyDisplay();
    }

    function applyDisplay() {
        const root = document.documentElement;
        root.dataset.size = settings.textSize;
        root.dataset.contrast = settings.contrast;
        if (settings.theme === "auto") {
            if (themeSetByApp) root.removeAttribute("data-theme");
            themeSetByApp = false;
        } else {
            root.setAttribute("data-theme", settings.theme);
            themeSetByApp = true;
        }
    }

    function level() {
        return LEVELS[settings.level];
    }

    // ---------- Word lists ----------

    const BANK = new Map(WORD_BANK.map(e => [e.w, e]));
    let customList = store.get("custom-list", { name: "", text: "" });
    let activeCache = null;

    function parseWordList(text) {
        const entries = [];
        const problems = [];
        const seen = new Set();
        for (const rawLine of String(text || "").split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line) continue;
            const m = line.match(/^([^:|=]+?)\s*(?:[:|=]|\s-\s)\s*(.+)$/);
            const items = m ? [[m[1], m[2]]] : line.split(/[,;]/).map(x => [x, ""]);
            for (const [rawWord, clue] of items) {
                const shown = rawWord.trim();
                const word = shown.toLowerCase();
                if (!word) continue;
                if (!/^[a-z]+$/.test(word)) {
                    problems.push(`"${shown}" was skipped. Use the letters a to z only, with no spaces, numbers or dashes.`);
                    continue;
                }
                if (word.length < 3 || word.length > 14) {
                    problems.push(`"${shown}" was skipped. Words need 3 to 14 letters.`);
                    continue;
                }
                if (seen.has(word)) continue;
                seen.add(word);
                const known = BANK.get(word);
                entries.push({
                    w: word,
                    c: clue.trim() || (known ? known.c : ""),
                    s: known ? known.s : "",
                    p: known ? known.p : "",
                    t: known ? known.t : "",
                    known: !!known
                });
            }
        }
        return { entries, problems };
    }

    function activeList() {
        if (activeCache) return activeCache;
        if (settings.listSource === "custom") {
            const { entries } = parseWordList(customList.text);
            if (entries.length >= 4) {
                activeCache = {
                    key: "custom:" + entries.map(e => e.w + "=" + e.c).join("|"),
                    name: customList.name || "My word list",
                    entries
                };
                return activeCache;
            }
        }
        activeCache = {
            key: "builtin",
            name: "5th grade words",
            entries: WORD_BANK.map(e => Object.assign({ known: true }, e))
        };
        return activeCache;
    }

    function getCustomList() {
        return Object.assign({}, customList);
    }

    function setCustomList(list, source) {
        customList = { name: list.name || "", text: list.text || "" };
        store.set("custom-list", customList);
        settings.listSource = source;
        saveSettings();
        activeCache = null;
        notifyListChange();
    }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // Words to use in the next puzzle, best first: up to half are words that need
    // practice, the rest are the words seen least often.
    function pickWords(count, maxLen) {
        const all = activeList().entries;
        let pool = all.filter(e => e.w.length <= maxLen);
        if (pool.length < Math.min(count, all.length)) pool = all;
        const practice = shuffle(pool.filter(e => wordStatus(e.w) === "practise")).slice(0, Math.ceil(count / 2));
        const timesSeen = e => (progress.words[e.w] ? progress.words[e.w].found : 0);
        const others = shuffle(pool.filter(e => !practice.includes(e))).sort((a, b) => timesSeen(a) - timesSeen(b));
        return practice.concat(others);
    }

    // ---------- Progress ----------

    const progress = Object.assign({ words: {}, puzzles: { ws: 0, cw: 0 }, hints: 0, said: 0 }, store.get("progress", {}));

    function saveProgress() {
        store.set("progress", progress);
    }

    function statsFor(word) {
        if (!progress.words[word]) {
            progress.words[word] = { found: 0, unaided: 0, helped: 0, said: 0, streak: 0, practice: false };
        }
        return progress.words[word];
    }

    // A word needs practice after any help; two finds in a row without help clears it.
    function recordFound(word, helped) {
        const s = statsFor(word);
        s.found++;
        if (helped) {
            s.helped++;
            s.streak = 0;
            s.practice = true;
        } else {
            s.unaided++;
            s.streak++;
            if (s.practice && s.streak >= 2) s.practice = false;
        }
        s.last = Date.now();
        saveProgress();
    }

    function recordHint() {
        progress.hints++;
        saveProgress();
    }

    function recordSaid(word) {
        statsFor(word).said++;
        progress.said++;
        saveProgress();
    }

    function recordPuzzle(game) {
        progress.puzzles[game] = (progress.puzzles[game] || 0) + 1;
        saveProgress();
    }

    function wordStatus(word) {
        const s = progress.words[word];
        if (!s || !s.found) return "new";
        if (s.practice) return "practise";
        if (s.unaided >= 2) return "mastered";
        return "learning";
    }

    function resetProgress() {
        progress.words = {};
        progress.puzzles = { ws: 0, cw: 0 };
        progress.hints = 0;
        progress.said = 0;
        saveProgress();
    }

    // ---------- Speech ----------

    const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

    function englishVoices() {
        if (!canSpeak) return [];
        return speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    }

    function pickVoice() {
        const voices = englishVoices();
        return voices.find(v => v.name === settings.voice) ||
            voices.find(v => v.lang === "en-US" && v.localService) ||
            voices.find(v => v.lang === "en-US") ||
            voices[0];
    }

    function speak(text, slow) {
        if (!canSpeak) return;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const voice = pickVoice();
        if (voice) u.voice = voice;
        u.lang = voice ? voice.lang : "en-US";
        u.rate = Math.max(0.3, settings.rate * (slow ? 0.6 : 1));
        speechSynthesis.speak(u);
    }

    if (canSpeak) speechSynthesis.getVoices();

    // ---------- Sound effects ----------

    let audioCtx = null;

    function tone(freq, start, dur, type, vol) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type || "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(vol || 0.15, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.05);
    }

    function sfx(kind) {
        if (!settings.sfx) return;
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === "suspended") audioCtx.resume();
        } catch (e) {
            return;
        }
        const t = audioCtx.currentTime;
        if (kind === "good") {
            tone(659, t, 0.14);
            tone(988, t + 0.11, 0.25);
        } else if (kind === "bad") {
            tone(196, t, 0.2, "triangle", 0.12);
        } else if (kind === "win") {
            [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.13, 0.3));
        } else if (kind === "tap") {
            tone(880, t, 0.06, "sine", 0.06);
        }
    }

    function confetti() {
        if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const layer = document.getElementById("confetti");
        const colors = ["--hl1", "--hl2", "--hl3", "--hl4", "--hl5", "--hl6", "--hl7"];
        for (let i = 0; i < 90; i++) {
            const piece = document.createElement("div");
            piece.className = "confetto";
            piece.style.left = Math.random() * 100 + "vw";
            piece.style.background = `var(${colors[i % colors.length]})`;
            piece.style.animationDuration = 2 + Math.random() * 2 + "s";
            piece.style.animationDelay = Math.random() * 0.6 + "s";
            piece.style.transform = `rotate(${Math.random() * 360}deg)`;
            layer.appendChild(piece);
        }
        setTimeout(() => { layer.innerHTML = ""; }, 5000);
    }

    // ---------- "Say it" coach ----------

    let micAvailable = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

    function recordClip(ms, onStart) {
        return navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => new Promise((resolve, reject) => {
            const rec = new MediaRecorder(stream);
            const chunks = [];
            rec.ondataavailable = e => chunks.push(e.data);
            rec.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                resolve(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || "audio/webm" })));
            };
            rec.onerror = e => {
                stream.getTracks().forEach(t => t.stop());
                reject(e.error || e);
            };
            rec.start();
            if (onStart) onStart();
            setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, ms);
        }));
    }

    function createCoach(el, intro) {
        el.classList.add("coach");
        el.innerHTML = `
            <p class="coach-msg" aria-live="polite"></p>
            <div class="coach-word" hidden>
                <div class="coach-head"><span class="coach-big"></span><span class="tag coach-practice" hidden>🔁 Practice word</span></div>
                <div class="coach-sounds"><span class="coach-syll"></span><span class="coach-say"></span></div>
                <div class="coach-turn">🗣️ Your turn: say it out loud!</div>
                <div class="coach-actions">
                    <button type="button" class="coach-hear">🔊 Hear it</button>
                    <button type="button" class="coach-slow">🐢 Slowly</button>
                    <button type="button" class="coach-rec">🎤 Record me</button>
                    <button type="button" class="coach-compare" hidden>▶️ Me, then the app</button>
                    <button type="button" class="coach-said primary">✅ I said it!</button>
                </div>
            </div>`;
        const q = sel => el.querySelector(sel);
        const msgEl = q(".coach-msg");
        const wordBox = q(".coach-word");
        const recBtn = q(".coach-rec");
        const compareBtn = q(".coach-compare");
        const saidBtn = q(".coach-said");
        let entry = null;
        let clipUrl = null;

        function message(text, tone) {
            msgEl.textContent = text;
            if (tone) msgEl.dataset.tone = tone; else delete msgEl.dataset.tone;
        }

        function show(e, opts) {
            entry = e;
            opts = opts || {};
            wordBox.hidden = false;
            q(".coach-big").textContent = e.w;
            q(".coach-practice").hidden = !opts.practice;
            q(".coach-syll").textContent = e.s ? `Syllables: ${e.s}` : `${e.w.length} letters`;
            q(".coach-say").textContent = e.p ? `Say it: ${e.p}` : "";
            recBtn.hidden = !micAvailable;
            recBtn.disabled = false;
            recBtn.textContent = "🎤 Record me";
            compareBtn.hidden = true;
            if (clipUrl) URL.revokeObjectURL(clipUrl);
            clipUrl = null;
            saidBtn.disabled = false;
            saidBtn.textContent = "✅ I said it!";
        }

        function reset() {
            entry = null;
            wordBox.hidden = true;
            message(intro);
        }

        q(".coach-hear").addEventListener("click", () => entry && speak(entry.w));
        q(".coach-slow").addEventListener("click", () => entry && speak(entry.w, true));
        recBtn.addEventListener("click", () => {
            if (!entry) return;
            recBtn.disabled = true;
            recordClip(2500, () => {
                recBtn.textContent = "🔴 Recording… say it now!";
                recBtn.classList.add("recording");
            }).then(url => {
                clipUrl = url;
                recBtn.classList.remove("recording");
                recBtn.textContent = "🎤 Record again";
                recBtn.disabled = false;
                compareBtn.hidden = false;
                compareBtn.click();
            }).catch(() => {
                micAvailable = false;
                recBtn.classList.remove("recording");
                recBtn.hidden = true;
                message("The microphone isn't available here, so just say the word out loud.");
            });
        });
        compareBtn.addEventListener("click", () => {
            if (!clipUrl || !entry) return;
            const audio = new Audio(clipUrl);
            const word = entry.w;
            audio.onended = () => setTimeout(() => speak(word), 300);
            audio.play().catch(() => speak(word));
        });
        saidBtn.addEventListener("click", () => {
            if (!entry) return;
            recordSaid(entry.w);
            sfx("tap");
            saidBtn.disabled = true;
            saidBtn.textContent = "👍 Great job!";
        });

        reset();
        return { message, show, reset };
    }

    // On wide screens the coach sits at the top of the side column so the grid never
    // jumps when it grows; on narrow screens it stays above the grid.
    function dockCoach(el, sideCard) {
        const marker = document.createComment("coach");
        el.before(marker);
        const wide = window.matchMedia("(min-width: 821px)");
        const place = () => {
            if (wide.matches) sideCard.prepend(el);
            else marker.after(el);
        };
        place();
        if (wide.addEventListener) wide.addEventListener("change", place);
        else if (wide.addListener) wide.addListener(place);
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
    }

    function makeWordCard(entry, opts) {
        opts = opts || {};
        const card = document.createElement("div");
        card.className = "word-card";
        card.innerHTML = `
            <div class="head"><span class="big"></span><button type="button" class="speak" title="Hear it again" aria-label="Hear ${escapeHtml(entry.w)}">🔊</button></div>
            <div class="syll"></div>
            <div class="say"></div>
            <div class="tip"></div>`;
        card.querySelector(".big").textContent = entry.w;
        card.querySelector(".syll").textContent = entry.s ? `Syllables: ${entry.s}` : `${entry.w.length} letters`;
        const say = card.querySelector(".say");
        if (entry.p) say.textContent = `Say it: ${entry.p}`; else say.remove();
        const tip = card.querySelector(".tip");
        if (entry.t) tip.textContent = `Tip: ${entry.t}`; else tip.remove();
        if (opts.helped) {
            const tag = document.createElement("span");
            tag.className = "tag";
            tag.textContent = "🔁 Practice again";
            card.appendChild(tag);
        }
        card.querySelector("button").addEventListener("click", () => speak(entry.w));
        return card;
    }

    function sayItGuide(entries) {
        const rows = entries.map(e => `<tr><td><strong>${escapeHtml(e.w)}</strong></td><td>${escapeHtml(e.s || "")}</td><td>${escapeHtml(e.p || "")}</td></tr>`).join("");
        return `<h2>Say it guide</h2><table class="guide"><thead><tr><th>Word</th><th>Syllables</th><th>Say it</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    function stars(total, helped) {
        const unaided = total - helped;
        if (helped === 0) return "🌟🌟🌟";
        if (unaided >= total * 0.7) return "🌟🌟";
        return "🌟";
    }

    // ---------- Confirm dialog (built into the page) ----------

    function confirmBox(text, yesLabel) {
        return new Promise(resolve => {
            const box = document.getElementById("confirmBox");
            const yes = document.getElementById("confirmYes");
            const no = document.getElementById("confirmNo");
            const back = document.activeElement;
            document.getElementById("confirmText").textContent = text;
            yes.textContent = yesLabel || "Yes";
            box.hidden = false;
            no.focus();
            const done = answer => {
                box.hidden = true;
                yes.onclick = no.onclick = box.onkeydown = null;
                if (back && back.focus) back.focus();
                resolve(answer);
            };
            yes.onclick = () => done(true);
            no.onclick = () => done(false);
            box.onkeydown = e => { if (e.key === "Escape") done(false); };
        });
    }

    // ---------- Printing ----------

    function printPages(html, extraClass) {
        if (!TOP) return;
        const area = document.getElementById("printArea");
        area.className = extraClass || "";
        area.innerHTML = html;
        document.body.classList.add("printing");
        const done = () => {
            document.body.classList.remove("printing");
            area.innerHTML = "";
            window.removeEventListener("afterprint", done);
        };
        window.addEventListener("afterprint", done);
        window.print();
    }

    // ---------- Tabs, level pickers, menus, how-to cards ----------

    const tabHandlers = {};
    const listListeners = [];
    let currentTab = null;

    function onTab(name, fn) {
        tabHandlers[name] = fn;
    }

    function showTab(name) {
        if (!document.getElementById("panel-" + name)) name = "ws";
        currentTab = name;
        document.querySelectorAll(".tabs [data-tab]").forEach(btn => {
            const on = btn.dataset.tab === name;
            btn.setAttribute("aria-selected", on);
            btn.tabIndex = on ? 0 : -1;
        });
        document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== "panel-" + name; });
        store.set("tab", name);
        if (tabHandlers[name]) tabHandlers[name]();
    }

    function onListChange(fn) {
        listListeners.push(fn);
    }

    function notifyListChange() {
        activeCache = null;
        listListeners.forEach(fn => fn());
    }

    function setupLevelSelects() {
        const selects = document.querySelectorAll(".level-select");
        selects.forEach(sel => {
            sel.innerHTML = Object.entries(LEVELS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
            sel.value = settings.level;
            sel.addEventListener("change", () => {
                settings.level = sel.value;
                saveSettings();
                selects.forEach(s => { s.value = settings.level; });
                notifyListChange();
            });
        });
    }

    function setupHowTo(name) {
        const box = document.getElementById("howto-" + name);
        box.hidden = store.get("howto-" + name, false);
        box.querySelector(".howto-ok").addEventListener("click", () => {
            box.hidden = true;
            store.set("howto-" + name, true);
        });
        document.querySelectorAll(`[data-howto="${name}"]`).forEach(btn => btn.addEventListener("click", () => {
            box.hidden = !box.hidden;
            if (!box.hidden) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }));
    }

    function start() {
        applyDisplay();
        setupLevelSelects();
        setupHowTo("ws");
        setupHowTo("cw");

        const tabs = Array.from(document.querySelectorAll(".tabs [data-tab]"));
        tabs.forEach((btn, i) => {
            btn.addEventListener("click", () => showTab(btn.dataset.tab));
            btn.addEventListener("keydown", e => {
                const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (!step) return;
                const next = tabs[(i + step + tabs.length) % tabs.length];
                next.focus();
                showTab(next.dataset.tab);
            });
        });

        // Close an open menu when clicking outside it or choosing an item.
        document.addEventListener("click", e => {
            document.querySelectorAll("details.menu[open]").forEach(d => {
                if (!d.contains(e.target) || e.target.closest(".menu-item")) d.open = false;
            });
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") document.querySelectorAll("details.menu[open]").forEach(d => { d.open = false; });
        });

        // Only the game grids need re-fitting; re-running the other tabs would reset forms
        // whenever a phone's on-screen keyboard opens.
        window.addEventListener("resize", () => {
            if ((currentTab === "ws" || currentTab === "cw") && tabHandlers[currentTab]) tabHandlers[currentTab]();
        });

        showTab(store.get("tab", "ws"));
    }

    return {
        TOP, store, settings, saveSettings, LEVELS, level,
        parseWordList, activeList, getCustomList, setCustomList, pickWords, shuffle,
        progress, recordFound, recordHint, recordSaid, recordPuzzle, wordStatus, resetProgress,
        canSpeak, speak, englishVoices, sfx, confetti,
        createCoach, dockCoach, makeWordCard, sayItGuide, stars, escapeHtml,
        confirm: confirmBox, printPages, onTab, showTab, onListChange, notifyListChange, start
    };
})();
