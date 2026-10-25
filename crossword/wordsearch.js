/* Word search: drag (or tap first and last letter, or use the keyboard) to cross out a word,
   then the word is read aloud and the "say it" coach appears. */
(function () {
    "use strict";

    const DIRS = {
        straight: [[0, 1], [1, 0]],
        diagonal: [[0, 1], [1, 0], [1, 1], [-1, 1]],
        all: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]
    };
    const COLORS = 7;
    const MAX_GRID = 14;
    const SVG_NS = "http://www.w3.org/2000/svg";
    const INTRO = "Find a word from the list. Slide across it, or tap its first and last letter.";

    const $ = id => document.getElementById(id);
    const wrap = $("wsWrap");
    const gridEl = $("wsGrid");
    const linesEl = $("wsLines");
    const listEl = $("wsList");
    const statusEl = $("wsStatus");
    const barEl = $("wsBar");
    const bannerEl = $("wsBanner");
    const wallEl = $("wsWall");
    const wallEmpty = $("wsWallEmpty");
    const practiceNote = $("wsPracticeNote");
    const coach = App.createCoach($("wsCoach"), INTRO);
    App.dockCoach($("wsCoach"), document.querySelector("#panel-ws .card.side"));

    let state = null;
    let mode = App.store.get("ws-mode", "read");
    let cells = [];
    let drag = null;
    let pending = null;
    let cursor = { r: 0, c: 0 };
    let usingKeyboard = false;
    let currentLine = null;

    function puzzleKey() {
        return App.activeList().key + "|" + App.settings.level;
    }

    function save() {
        App.store.set("ws-state", state);
    }

    // ---------- Building a puzzle ----------

    function generate() {
        const lvl = App.level().ws;
        const picks = App.pickWords(lvl.count, lvl.maxLen).filter(e => e.w.length <= MAX_GRID).slice(0, lvl.count);
        const longest = Math.max(...picks.map(e => e.w.length));
        const size = Math.min(MAX_GRID, Math.max(lvl.size, longest));
        const dirs = DIRS[lvl.dirs];
        const order = picks.slice().sort((a, b) => b.w.length - a.w.length);
        const rand = n => Math.floor(Math.random() * n);
        let best = null;

        for (let attempt = 0; attempt < 40; attempt++) {
            const letters = Array.from({ length: size }, () => Array(size).fill(""));
            const placed = [];
            for (const entry of order) {
                const word = entry.w.toUpperCase();
                if (placed.some(p => p.word.includes(word) || word.includes(p.word))) continue;
                for (let t = 0; t < 300; t++) {
                    const [dr, dc] = dirs[rand(dirs.length)];
                    const span = word.length - 1;
                    const r = dr > 0 ? rand(size - span) : dr < 0 ? span + rand(size - span) : rand(size);
                    const c = dc > 0 ? rand(size - span) : dc < 0 ? span + rand(size - span) : rand(size);
                    let ok = true;
                    for (let i = 0; i < word.length && ok; i++) {
                        const ch = letters[r + dr * i][c + dc * i];
                        if (ch && ch !== word[i]) ok = false;
                    }
                    if (!ok) continue;
                    for (let i = 0; i < word.length; i++) letters[r + dr * i][c + dc * i] = word[i];
                    placed.push({ entry, word, r, c, dr, dc });
                    break;
                }
            }
            if (!best || placed.length > best.placed.length) best = { letters, placed };
            if (placed.length === order.length) break;
        }

        const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (const row of best.letters) {
            for (let c = 0; c < size; c++) if (!row[c]) row[c] = abc[rand(abc.length)];
        }

        const words = best.placed
            .sort((a, b) => a.word.localeCompare(b.word))
            .map(p => ({
                entry: p.entry,
                word: p.word,
                r: p.r, c: p.c, dr: p.dr, dc: p.dc,
                found: false,
                helped: false,
                practice: App.wordStatus(p.entry.w) === "practise",
                color: 0,
                order: 0,
                sel: null
            }));

        return { v: 1, key: puzzleKey(), size, letters: best.letters.map(row => row.join("")), words, hints: 0, done: false };
    }

    function newPuzzle() {
        state = generate();
        pending = null;
        coach.reset();
        render();
        save();
    }

    // ---------- Drawing ----------

    function render() {
        const n = state.size;
        gridEl.innerHTML = "";
        gridEl.style.gridTemplateColumns = `repeat(${n}, var(--ws-cell))`;
        cells = [];
        for (let r = 0; r < n; r++) {
            const row = [];
            for (let c = 0; c < n; c++) {
                const div = document.createElement("div");
                div.className = "ws-cell";
                div.textContent = state.letters[r][c];
                gridEl.appendChild(div);
                row.push(div);
            }
            cells.push(row);
        }

        linesEl.setAttribute("viewBox", `0 0 ${n} ${n}`);
        linesEl.innerHTML = "";
        state.words.filter(w => w.found).forEach(drawFound);
        currentLine = svgLine("current", 0.72);
        currentLine.style.display = "none";

        cursor = { r: Math.min(cursor.r, n - 1), c: Math.min(cursor.c, n - 1) };
        renderList();
        renderWall();
        updateStatus();
        renderBanner();
        sizeGrid();
    }

    function sizeGrid() {
        const holder = wrap.parentElement;
        const style = getComputedStyle(holder);
        const avail = holder.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (avail <= 0) return;
        const size = Math.max(24, Math.min(56, Math.floor(avail / state.size)));
        wrap.style.setProperty("--ws-cell", size + "px");
        wrap.style.width = size * state.size + "px";
    }

    function svgLine(cls, width) {
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("class", cls);
        line.setAttribute("stroke-width", width);
        line.setAttribute("stroke-linecap", "round");
        linesEl.appendChild(line);
        return line;
    }

    function placeLine(line, a, b) {
        line.setAttribute("x1", a.c + 0.5);
        line.setAttribute("y1", a.r + 0.5);
        line.setAttribute("x2", b.c + 0.5);
        line.setAttribute("y2", b.r + 0.5);
    }

    function wordEnds(w) {
        if (w.sel) return w.sel;
        const n = w.word.length - 1;
        return [{ r: w.r, c: w.c }, { r: w.r + w.dr * n, c: w.c + w.dc * n }];
    }

    function drawFound(w) {
        const [a, b] = wordEnds(w);
        const band = svgLine("band", 0.74);
        band.style.stroke = `var(--hl${w.color})`;
        placeLine(band, a, b);
        placeLine(svgLine("strike", 0.08), a, b);
        if (currentLine) linesEl.appendChild(currentLine);
    }

    function renderList() {
        listEl.innerHTML = "";
        state.words.forEach((w, i) => {
            const li = document.createElement("li");
            li.classList.toggle("found", w.found);
            const hidden = mode === "listen" && !w.found;
            li.innerHTML = `
                <span class="n">${w.found ? "✓" : i + 1}</span>
                <span class="word"></span>
                <button type="button" class="speak" title="Hear the word">🔊</button>`;
            const label = li.querySelector(".word");
            if (w.found) {
                const sw = document.createElement("span");
                sw.className = "swatch";
                sw.style.background = `var(--hl${w.color})`;
                label.appendChild(sw);
            }
            const text = document.createElement("span");
            text.className = "word-text";
            text.textContent = hidden ? `Word ${i + 1} · ${w.word.length} letters` : w.entry.w;
            if (hidden) text.style.fontWeight = "600";
            label.appendChild(text);
            if (w.practice && !w.found) {
                const tag = document.createElement("span");
                tag.className = "tag";
                tag.textContent = "🔁 practice";
                label.appendChild(tag);
            }
            const btn = li.querySelector("button");
            btn.setAttribute("aria-label", hidden ? `Hear word ${i + 1}` : `Hear ${w.entry.w}`);
            btn.addEventListener("click", () => App.speak(w.entry.w));
            listEl.appendChild(li);
        });
        const practiceCount = state.words.filter(w => w.practice).length;
        practiceNote.hidden = !practiceCount;
        practiceNote.textContent = `🔁 ${practiceCount} word${practiceCount === 1 ? " is" : "s are"} back for extra practice.`;
    }

    function renderWall() {
        wallEl.innerHTML = "";
        const found = state.words.filter(w => w.found).sort((a, b) => b.order - a.order);
        found.forEach(w => wallEl.appendChild(App.makeWordCard(w.entry, { helped: w.helped })));
        wallEmpty.hidden = found.length > 0;
    }

    function updateStatus() {
        const found = state.words.filter(w => w.found).length;
        const total = state.words.length;
        statusEl.textContent = `${found} of ${total} found · 💡 ${state.hints}`;
        statusEl.setAttribute("aria-label", `${found} of ${total} words found, ${state.hints} hints used`);
        barEl.style.width = (total ? (found / total) * 100 : 0) + "%";
    }

    function renderBanner() {
        bannerEl.hidden = !state.done;
        if (!state.done) return;
        const helped = state.words.filter(w => w.helped).length;
        bannerEl.innerHTML = "";
        const text = document.createElement("span");
        text.textContent = `${App.stars(state.words.length, helped)} You found all ${state.words.length} words! ` +
            "Read each word below out loud, then try another puzzle.";
        const again = document.createElement("button");
        again.type = "button";
        again.className = "primary";
        again.textContent = "Play again";
        again.addEventListener("click", newPuzzle);
        bannerEl.append(text, again);
    }

    // ---------- Selecting words ----------

    function cellAt(e) {
        const rect = gridEl.getBoundingClientRect();
        const size = rect.width / state.size;
        const clamp = v => Math.max(0, Math.min(state.size - 1, v));
        return {
            r: clamp(Math.floor((e.clientY - rect.top) / size)),
            c: clamp(Math.floor((e.clientX - rect.left) / size))
        };
    }

    // Snap to the nearest straight or diagonal line that stays inside the grid.
    function snap(start, target) {
        const dr = target.r - start.r;
        const dc = target.c - start.c;
        if (!dr && !dc) return start;
        const step = Math.round(Math.atan2(dr, dc) / (Math.PI / 4));
        const sr = Math.round(Math.sin(step * Math.PI / 4));
        const sc = Math.round(Math.cos(step * Math.PI / 4));
        let len = Math.max(Math.abs(dr), Math.abs(dc));
        const inside = n => {
            const r = start.r + sr * n;
            const c = start.c + sc * n;
            return r >= 0 && r < state.size && c >= 0 && c < state.size;
        };
        while (len > 0 && !inside(len)) len--;
        return { r: start.r + sr * len, c: start.c + sc * len };
    }

    function path(a, b) {
        const len = Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c));
        const sr = Math.sign(b.r - a.r);
        const sc = Math.sign(b.c - a.c);
        return Array.from({ length: len + 1 }, (_, i) => ({ r: a.r + sr * i, c: a.c + sc * i }));
    }

    function setPending(cell) {
        if (pending) cells[pending.r][pending.c].classList.remove("start");
        pending = cell;
        if (cell) cells[cell.r][cell.c].classList.add("start");
    }

    function showPreview(a, b) {
        currentLine.style.display = "";
        placeLine(currentLine, a, b);
    }

    function hidePreview() {
        currentLine.style.display = "none";
    }

    function check(a, b) {
        const cellsOnPath = path(a, b);
        if (cellsOnPath.length < 2) return;
        const text = cellsOnPath.map(p => state.letters[p.r][p.c]).join("");
        const back = text.split("").reverse().join("");
        const match = state.words.find(w => w.word === text || w.word === back);

        if (match && match.found) {
            App.speak(match.entry.w);
            coach.message(`You already found "${match.entry.w}". Keep looking!`);
        } else if (match) {
            markFound(match, a, b, cellsOnPath);
        } else {
            App.sfx("bad");
            const miss = svgLine("miss", 0.72);
            placeLine(miss, a, b);
            setTimeout(() => miss.remove(), 700);
            coach.message(`"${text}" isn't on the list. Try again!`, "bad");
        }
    }

    function markFound(w, a, b, cellsOnPath) {
        const foundBefore = state.words.filter(x => x.found).length;
        w.found = true;
        w.order = foundBefore + 1;
        w.color = (foundBefore % COLORS) + 1;
        w.sel = [a, b];
        drawFound(w);
        cellsOnPath.forEach((p, i) => {
            const el = cells[p.r][p.c];
            el.classList.remove("pop");
            setTimeout(() => el.classList.add("pop"), i * 40);
        });
        App.sfx("good");
        setTimeout(() => App.speak(w.entry.w), 350);
        App.recordFound(w.entry.w, w.helped);
        coach.message(`You found "${w.entry.w}"!`, "good");
        coach.show(w.entry, { practice: w.practice });
        renderList();
        renderWall();
        updateStatus();
        if (state.words.every(x => x.found)) {
            state.done = true;
            App.recordPuzzle("ws");
            setTimeout(() => { App.sfx("win"); App.confetti(); }, 900);
            renderBanner();
        }
        save();
    }

    // Pointer: drag across a word, or tap the first and then the last letter.
    gridEl.addEventListener("pointerdown", e => {
        e.preventDefault();
        usingKeyboard = false;
        paintCursor();
        const cell = cellAt(e);
        try { gridEl.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
        drag = { start: cell, end: cell };
        if (pending) showPreview(pending, snap(pending, cell)); else showPreview(cell, cell);
    });

    gridEl.addEventListener("pointermove", e => {
        if (!drag) return;
        drag.end = snap(drag.start, cellAt(e));
        showPreview(drag.start, drag.end);
    });

    gridEl.addEventListener("pointerup", () => {
        if (!drag) return;
        const { start, end } = drag;
        drag = null;
        hidePreview();
        const isTap = start.r === end.r && start.c === end.c;
        if (!isTap) {
            setPending(null);
            check(start, end);
        } else if (!pending) {
            setPending(start);
            App.sfx("tap");
            coach.message("Now tap the last letter of the word.");
        } else if (pending.r === start.r && pending.c === start.c) {
            setPending(null);
            coach.message(INTRO);
        } else {
            const from = pending;
            setPending(null);
            check(from, snap(from, start));
        }
        wrap.focus({ preventScroll: true });
    });

    gridEl.addEventListener("pointercancel", () => {
        drag = null;
        hidePreview();
    });

    // Keyboard: arrows move, Enter/Space marks the first and last letter, Escape cancels.
    function paintCursor() {
        cells.forEach(row => row.forEach(el => el.classList.remove("cursor")));
        if (usingKeyboard && document.activeElement === wrap) cells[cursor.r][cursor.c].classList.add("cursor");
    }

    wrap.addEventListener("keydown", e => {
        const n = state.size;
        const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (moves[e.key]) {
            const [dr, dc] = moves[e.key];
            cursor = { r: Math.max(0, Math.min(n - 1, cursor.r + dr)), c: Math.max(0, Math.min(n - 1, cursor.c + dc)) };
        } else if (e.key === "Enter" || e.key === " ") {
            if (!pending) {
                setPending({ r: cursor.r, c: cursor.c });
                coach.message("Now move to the last letter and press Enter.");
            } else if (pending.r === cursor.r && pending.c === cursor.c) {
                setPending(null);
            } else {
                const from = pending;
                setPending(null);
                hidePreview();
                check(from, snap(from, cursor));
            }
        } else if (e.key === "Escape") {
            setPending(null);
            hidePreview();
        } else {
            return;
        }
        e.preventDefault();
        usingKeyboard = true;
        paintCursor();
        if (pending) showPreview(pending, snap(pending, cursor)); else hidePreview();
    });

    wrap.addEventListener("focus", paintCursor);
    wrap.addEventListener("blur", () => cells.forEach(row => row.forEach(el => el.classList.remove("cursor"))));

    // ---------- Toolbar ----------

    function setMode(m) {
        mode = m;
        App.store.set("ws-mode", m);
        $("wsModeRead").setAttribute("aria-pressed", m === "read");
        $("wsModeListen").setAttribute("aria-pressed", m === "listen");
        renderList();
        if (m === "listen" && !App.canSpeak) {
            coach.message("This browser can't read words out loud. Try Chrome, Edge or Safari.", "bad");
        }
    }

    $("wsModeRead").addEventListener("click", () => setMode("read"));
    $("wsModeListen").addEventListener("click", () => setMode("listen"));
    $("wsNew").addEventListener("click", newPuzzle);

    $("wsHint").addEventListener("click", () => {
        const left = state.words.filter(w => !w.found);
        if (!left.length) return;
        const fresh = left.filter(w => !w.helped);
        const pool = fresh.length ? fresh : left;
        const w = pool[Math.floor(Math.random() * pool.length)];
        w.helped = true;
        state.hints++;
        App.recordHint();
        const el = cells[w.r][w.c];
        el.classList.remove("hint");
        void el.offsetWidth;
        el.classList.add("hint");
        setTimeout(() => el.classList.remove("hint"), 2600);
        App.speak(w.entry.w);
        coach.message(mode === "listen"
            ? "Listen to the word. It starts at the flashing letter."
            : `"${w.entry.w}" starts at the flashing letter.`);
        updateStatus();
        save();
    });

    $("wsPrint").addEventListener("click", () => {
        const esc = App.escapeHtml;
        const answers = new Set();
        state.words.forEach(w => {
            for (let i = 0; i < w.word.length; i++) answers.add(`${w.r + w.dr * i},${w.c + w.dc * i}`);
        });
        const table = key => "<table class=\"print-grid ws-print\">" + state.letters.map((row, r) =>
            "<tr>" + row.split("").map((ch, c) => `<td class="${key && answers.has(r + "," + c) ? "ans" : ""}">${ch}</td>`).join("") + "</tr>"
        ).join("") + "</table>";
        const list = state.words.map(w => `<li>${esc(w.entry.w)}</li>`).join("");
        App.printPages(`
            <section class="sheet">
                <div class="sheet-head"><span>Name:</span><span>Date:</span></div>
                <h1>Spelling Word Search</h1>
                <p class="sheet-sub">Find each word and cross it out. Then say it out loud.</p>
                ${table(false)}
                <ol class="sheet-words">${list}</ol>
            </section>
            <section class="sheet">
                <h1>Answer key</h1>
                ${table(true)}
                ${App.sayItGuide(state.words.map(w => w.entry))}
            </section>`);
    });

    // ---------- Start ----------

    App.onTab("ws", () => { if (state) sizeGrid(); });
    App.onListChange(newPuzzle);

    const saved = App.store.get("ws-state", null);
    if (saved && saved.v === 1 && saved.key === puzzleKey() && Array.isArray(saved.words) && saved.words.length) {
        state = saved;
        render();
        const last = state.words.filter(w => w.found).sort((a, b) => b.order - a.order)[0];
        if (!state.done) coach.message(last ? "Welcome back! Keep finding words." : INTRO);
    } else {
        newPuzzle();
    }
    setMode(mode);
})();
