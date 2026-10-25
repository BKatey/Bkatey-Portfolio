/* Crossword: read or listen to each clue and type the word. */
(function () {
    "use strict";

    const INTRO = "Pick a clue, then type the word in the squares.";
    const $ = id => document.getElementById(id);
    const gridEl = $("cwGrid");
    const acrossList = $("cwAcross");
    const downList = $("cwDown");
    const clueEl = $("cwClue");
    const statusEl = $("cwStatus");
    const barEl = $("cwBar");
    const bannerEl = $("cwBanner");
    const wallEl = $("cwWall");
    const wallEmpty = $("cwWallEmpty");
    const practiceNote = $("cwPracticeNote");
    const coach = App.createCoach($("cwCoach"), INTRO);
    App.dockCoach($("cwCoach"), document.querySelector("#panel-cw .card.side"));

    let state = null;     // saved puzzle: layout, letters typed, what's solved
    let board = [];       // board[r][c] = null | { answer, across, down, el, input }
    let cellsOf = new Map();
    let liOf = new Map();
    let cur = { r: 0, c: 0, dir: "across" };
    let mode = App.store.get("cw-mode", "read");

    const key = (r, c) => r + "," + c;

    function puzzleKey() {
        return App.activeList().key + "|" + App.settings.level;
    }

    function save() {
        state.cur = cur;
        App.store.set("cw-state", state);
    }

    // ---------- Building a puzzle ----------

    function tryBuild(candidates, target, maxSize) {
        const cells = new Map();
        const placed = [];
        let minR = 0, maxR = 0, minC = 0, maxC = 0;
        const at = (r, c) => cells.get(key(r, c));

        function score(word, r, c, dir) {
            const dr = dir === "down" ? 1 : 0;
            const dc = dir === "across" ? 1 : 0;
            const len = word.length;
            const nMinR = Math.min(minR, r), nMaxR = Math.max(maxR, r + dr * (len - 1));
            const nMinC = Math.min(minC, c), nMaxC = Math.max(maxC, c + dc * (len - 1));
            if (nMaxR - nMinR + 1 > maxSize || nMaxC - nMinC + 1 > maxSize) return -1;
            if (at(r - dr, c - dc) || at(r + dr * len, c + dc * len)) return -1;
            let hits = 0;
            for (let i = 0; i < len; i++) {
                const rr = r + dr * i, cc = c + dc * i;
                const ex = at(rr, cc);
                if (ex) {
                    if (ex.ch !== word[i] || ex[dir]) return -1;
                    hits++;
                } else if (at(rr + dc, cc + dr) || at(rr - dc, cc - dr)) {
                    return -1;
                }
            }
            return hits;
        }

        function place(entry, r, c, dir) {
            const dr = dir === "down" ? 1 : 0;
            const dc = dir === "across" ? 1 : 0;
            const word = entry.w.toUpperCase();
            for (let i = 0; i < word.length; i++) {
                const k = key(r + dr * i, c + dc * i);
                const cell = cells.get(k) || { ch: word[i], across: false, down: false };
                cell[dir] = true;
                cells.set(k, cell);
            }
            minR = Math.min(minR, r); maxR = Math.max(maxR, r + dr * (word.length - 1));
            minC = Math.min(minC, c); maxC = Math.max(maxC, c + dc * (word.length - 1));
            placed.push({ entry, word, r, c, dir });
        }

        const [first, ...rest] = candidates;
        place(first, 0, 0, "across");
        let pending = rest;
        for (let pass = 0; pass < 2 && placed.length < target; pass++) {
            const leftover = [];
            for (const entry of pending) {
                if (placed.length >= target) break;
                const word = entry.w.toUpperCase();
                let best = null;
                for (const [k, cell] of cells) {
                    const [r0, c0] = k.split(",").map(Number);
                    for (let i = 0; i < word.length; i++) {
                        if (word[i] !== cell.ch) continue;
                        for (const dir of ["across", "down"]) {
                            const r = dir === "down" ? r0 - i : r0;
                            const c = dir === "across" ? c0 - i : c0;
                            const s = score(word, r, c, dir);
                            if (s < 1) continue;
                            const value = s + Math.random() * 0.5;
                            if (!best || value > best.value) best = { r, c, dir, value };
                        }
                    }
                }
                if (best) place(entry, best.r, best.c, best.dir);
                else leftover.push(entry);
            }
            pending = leftover;
        }
        return { placed, minR, minC, rows: maxR - minR + 1, cols: maxC - minC + 1, area: (maxR - minR + 1) * (maxC - minC + 1) };
    }

    function generate() {
        const lvl = App.level().cw;
        const pool = App.pickWords(lvl.count, lvl.maxLen);
        const isPractice = e => App.wordStatus(e.w) === "practise";
        const practice = pool.filter(isPractice).slice(0, Math.ceil(lvl.count / 2));
        const others = pool.filter(e => !practice.includes(e)).slice(0, 30);
        const target = Math.min(lvl.count, pool.length);
        const maxSize = Math.max(lvl.maxSize, ...pool.map(e => e.w.length));
        let best = null;

        for (let attempt = 0; attempt < 80; attempt++) {
            const picks = practice.concat(App.shuffle(others).slice(0, Math.max(0, 18 - practice.length)));
            const anchor = picks.reduce((a, b) => (b.w.length > a.w.length ? b : a));
            const rest = picks.filter(p => p !== anchor);
            const ordered = [anchor, ...rest.filter(isPractice), ...App.shuffle(rest.filter(p => !isPractice(p)))];
            const result = tryBuild(ordered, target, maxSize);
            const practicePlaced = result.placed.filter(p => isPractice(p.entry)).length;
            const value = result.placed.length * 1000 + practicePlaced * 30 - result.area;
            if (!best || value > best.value) best = Object.assign(result, { value });
            if (result.placed.length >= target && attempt > 20) break;
        }

        const words = best.placed.map(p => ({
            entry: p.entry,
            word: p.word,
            r: p.r - best.minR,
            c: p.c - best.minC,
            dir: p.dir,
            num: 0,
            solved: false,
            helped: false,
            hinted: false,
            recorded: false,
            order: 0,
            practice: isPractice(p.entry)
        }));
        words.sort((a, b) => a.r - b.r || a.c - b.c);
        let num = 0;
        const starts = new Map();
        for (const w of words) {
            const k = key(w.r, w.c);
            if (!starts.has(k)) starts.set(k, ++num);
            w.num = starts.get(k);
        }
        return { v: 1, key: puzzleKey(), rows: best.rows, cols: best.cols, words, letters: {}, revealed: {}, hints: 0, done: false, cur: null };
    }

    function newPuzzle() {
        state = generate();
        coach.reset();
        render();
        save();
    }

    // ---------- Drawing ----------

    function render() {
        board = Array.from({ length: state.rows }, () => Array(state.cols).fill(null));
        cellsOf = new Map();
        for (const w of state.words) {
            const list = [];
            for (let i = 0; i < w.word.length; i++) {
                const r = w.r + (w.dir === "down" ? i : 0);
                const c = w.c + (w.dir === "across" ? i : 0);
                if (!board[r][c]) board[r][c] = { answer: w.word[i], across: null, down: null };
                board[r][c][w.dir] = w;
                list.push([r, c]);
            }
            cellsOf.set(w, list);
        }
        renderGrid();
        renderClues();
        for (const w of state.words) if (w.solved) paintSolved(w, true);
        renderWall();
        updateStatus();
        renderBanner();
        const start = state.cur && board[state.cur.r] && board[state.cur.r][state.cur.c]
            ? state.cur
            : firstOpenCell();
        select(start.r, start.c, start.dir, false);
    }

    function firstOpenCell() {
        const w = state.words.find(x => !x.solved && x.dir === "across") || state.words.find(x => !x.solved) || state.words[0];
        return { r: w.r, c: w.c, dir: w.dir };
    }

    function sizeCells() {
        const holder = gridEl.parentElement;
        const style = getComputedStyle(holder);
        const avail = holder.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 4;
        if (avail <= 0) return;
        const size = Math.max(24, Math.min(48, Math.floor(avail / state.cols)));
        gridEl.style.setProperty("--cell", size + "px");
    }

    function renderGrid() {
        gridEl.innerHTML = "";
        gridEl.style.gridTemplateColumns = `repeat(${state.cols}, var(--cell))`;
        const nums = new Map(state.words.map(w => [key(w.r, w.c), w.num]));
        for (let r = 0; r < state.rows; r++) {
            for (let c = 0; c < state.cols; c++) {
                const div = document.createElement("div");
                div.className = "cell";
                const cell = board[r][c];
                if (cell) {
                    div.classList.add("letter");
                    const n = nums.get(key(r, c));
                    if (n) {
                        const span = document.createElement("span");
                        span.className = "num";
                        span.textContent = n;
                        div.appendChild(span);
                    }
                    const input = document.createElement("input");
                    input.type = "text";
                    input.autocomplete = "off";
                    input.setAttribute("autocapitalize", "characters");
                    input.setAttribute("autocorrect", "off");
                    input.spellcheck = false;
                    input.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}`);
                    input.value = state.letters[key(r, c)] || "";
                    input.addEventListener("mousedown", e => onCellClick(e, r, c));
                    input.addEventListener("focus", () => { if (cur.r !== r || cur.c !== c) select(r, c, null, false); });
                    input.addEventListener("keydown", e => onKey(e, r, c));
                    input.addEventListener("input", e => onInput(e, r, c));
                    div.appendChild(input);
                    div.classList.toggle("revealed", !!state.revealed[key(r, c)]);
                    cell.el = div;
                    cell.input = input;
                }
                gridEl.appendChild(div);
            }
        }
        sizeCells();
    }

    function renderClues() {
        acrossList.innerHTML = "";
        downList.innerHTML = "";
        liOf = new Map();
        for (const w of state.words) {
            const li = document.createElement("li");
            li.innerHTML = `
                <span class="n">${w.num}</span>
                <span>
                    <span class="text"></span>
                    <span class="meta"></span>
                    <span class="sound" hidden></span>
                </span>
                <button type="button" class="speak" title="Hear the word">🔊</button>`;
            li.addEventListener("click", e => {
                if (e.target.closest("button")) return;
                selectWord(w);
            });
            li.querySelector(".speak").addEventListener("click", () => App.speak(w.entry.w));
            liOf.set(w, li);
            updateClue(w);
            (w.dir === "across" ? acrossList : downList).appendChild(li);
        }
        const practiceCount = state.words.filter(w => w.practice).length;
        practiceNote.hidden = !practiceCount;
        practiceNote.textContent = `🔁 ${practiceCount} word${practiceCount === 1 ? " is" : "s are"} back for extra practice.`;
    }

    function clueText(w) {
        if (mode === "listen" && !w.solved) return "🎧 Press 🔊, listen, and spell the word.";
        return w.entry.c || "🎧 Press 🔊, listen, and spell the word.";
    }

    function soundText(w) {
        if (w.entry.p) return `Say it: ${w.entry.p}  (${w.entry.s})`;
        return `Starts with "${w.word[0]}"`;
    }

    function updateClue(w) {
        const li = liOf.get(w);
        li.classList.toggle("solved", w.solved);
        li.querySelector(".text").textContent = clueText(w);
        const parts = [`${w.word.length} letters`];
        if (w.entry.s) {
            const n = w.entry.s.split("·").length;
            parts.push(`${n} syllable${n > 1 ? "s" : ""}`);
        }
        if (w.practice && !w.solved) parts.push("🔁 practice");
        li.querySelector(".meta").textContent = parts.join(" · ");
        const sound = li.querySelector(".sound");
        sound.hidden = !(w.hinted || w.solved);
        sound.textContent = soundText(w);
    }

    function renderWall() {
        wallEl.innerHTML = "";
        const solved = state.words.filter(w => w.solved).sort((a, b) => b.order - a.order);
        solved.forEach(w => wallEl.appendChild(App.makeWordCard(w.entry, { helped: w.helped })));
        wallEmpty.hidden = solved.length > 0;
    }

    function updateStatus() {
        const solved = state.words.filter(w => w.solved).length;
        const total = state.words.length;
        statusEl.textContent = `${solved} of ${total} spelled · 💡 ${state.hints}`;
        statusEl.setAttribute("aria-label", `${solved} of ${total} words spelled, ${state.hints} hints used`);
        barEl.style.width = (total ? (solved / total) * 100 : 0) + "%";
    }

    function renderBanner() {
        bannerEl.hidden = !state.done;
        if (!state.done) return;
        const helped = state.words.filter(w => w.helped).length;
        bannerEl.innerHTML = "";
        const text = document.createElement("span");
        text.textContent = `${App.stars(state.words.length, helped)} You finished the puzzle! You spelled ` +
            `${state.words.length - helped} of ${state.words.length} words without help.`;
        const again = document.createElement("button");
        again.type = "button";
        again.className = "primary";
        again.textContent = "Play again";
        again.addEventListener("click", newPuzzle);
        bannerEl.append(text, again);
    }

    // ---------- Selection ----------

    function wordAt(r, c, dir) {
        const cell = board[r] && board[r][c];
        return cell ? cell[dir] : null;
    }

    function select(r, c, dir, focus = true) {
        const cell = board[r][c];
        if (!cell) return;
        dir = dir || cur.dir;
        if (!cell[dir]) dir = dir === "across" ? "down" : "across";
        const changedWord = wordAt(cur.r, cur.c, cur.dir) !== cell[dir];
        cur = { r, c, dir };
        paintSelection();
        if (focus && document.activeElement !== cell.input) cell.input.focus();
        if (changedWord && mode === "listen" && focus) App.speak(cell[dir].entry.w);
    }

    function selectWord(w) {
        const empty = cellsOf.get(w).find(([r, c]) => !board[r][c].input.value);
        const [r, c] = empty || cellsOf.get(w)[0];
        select(r, c, w.dir);
    }

    function paintSelection() {
        for (const row of board) for (const cell of row) if (cell) cell.el.classList.remove("active", "inword");
        for (const li of liOf.values()) li.classList.remove("selected");

        const w = wordAt(cur.r, cur.c, cur.dir);
        if (!w) return;
        for (const [r, c] of cellsOf.get(w)) board[r][c].el.classList.add("inword");
        board[cur.r][cur.c].el.classList.add("active");
        const li = liOf.get(w);
        li.classList.add("selected");
        if (li.scrollIntoViewIfNeeded) li.scrollIntoViewIfNeeded(false);

        clueEl.innerHTML = "";
        const label = document.createElement("span");
        label.className = "label";
        label.textContent = `${w.num} ${w.dir === "across" ? "Across" : "Down"}:`;
        const text = document.createElement("span");
        text.className = "text";
        text.textContent = clueText(w);
        const hear = document.createElement("button");
        hear.type = "button";
        hear.className = "speak";
        hear.textContent = "🔊";
        hear.title = "Hear the word";
        hear.setAttribute("aria-label", "Hear the word");
        hear.addEventListener("click", () => App.speak(w.entry.w));
        const hint = document.createElement("button");
        hint.type = "button";
        hint.className = "speak";
        hint.textContent = "💡";
        hint.title = "Sound it out";
        hint.setAttribute("aria-label", "Sound it out");
        hint.addEventListener("click", () => giveHint(w));
        clueEl.append(label, text, hear, hint);
        if (w.hinted || w.solved) {
            const sound = document.createElement("span");
            sound.className = "sound";
            sound.textContent = soundText(w);
            clueEl.appendChild(sound);
        }
    }

    function onCellClick(e, r, c) {
        e.preventDefault();
        if (cur.r === r && cur.c === c) {
            const other = cur.dir === "across" ? "down" : "across";
            if (board[r][c][other]) select(r, c, other);
            else board[r][c].input.focus();
        } else {
            select(r, c, null);
        }
    }

    function step(delta) {
        const list = cellsOf.get(wordAt(cur.r, cur.c, cur.dir));
        const idx = list.findIndex(([r, c]) => r === cur.r && c === cur.c);
        const next = list[idx + delta];
        if (next) select(next[0], next[1], cur.dir);
    }

    function moveArrow(dr, dc) {
        const dir = dr ? "down" : "across";
        if (cur.dir !== dir && board[cur.r][cur.c][dir]) {
            select(cur.r, cur.c, dir);
            return;
        }
        let r = cur.r + dr, c = cur.c + dc;
        while (r >= 0 && r < state.rows && c >= 0 && c < state.cols) {
            if (board[r][c]) {
                select(r, c, null);
                return;
            }
            r += dr;
            c += dc;
        }
    }

    function nextWord(back) {
        const w = wordAt(cur.r, cur.c, cur.dir);
        const order = [...state.words.filter(x => x.dir === "across"), ...state.words.filter(x => x.dir === "down")];
        let i = order.indexOf(w);
        for (let n = 0; n < order.length; n++) {
            i = (i + (back ? -1 : 1) + order.length) % order.length;
            if (!order[i].solved) {
                selectWord(order[i]);
                return;
            }
        }
    }

    // ---------- Typing ----------

    function setLetter(r, c, ch, revealed) {
        const cell = board[r][c];
        const k = key(r, c);
        cell.input.value = ch;
        if (ch) state.letters[k] = ch; else delete state.letters[k];
        if (revealed) state.revealed[k] = true; else delete state.revealed[k];
        cell.el.classList.remove("wrong");
        cell.el.classList.toggle("revealed", !!revealed);
    }

    function onInput(e, r, c) {
        const ch = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(-1);
        setLetter(r, c, ch, false);
        afterChange(r, c);
        if (ch) step(1);
    }

    function onKey(e, r, c) {
        switch (e.key) {
            case "ArrowLeft": e.preventDefault(); moveArrow(0, -1); break;
            case "ArrowRight": e.preventDefault(); moveArrow(0, 1); break;
            case "ArrowUp": e.preventDefault(); moveArrow(-1, 0); break;
            case "ArrowDown": e.preventDefault(); moveArrow(1, 0); break;
            case "Tab":
            case "Enter":
                e.preventDefault();
                nextWord(e.shiftKey);
                break;
            case " ": {
                e.preventDefault();
                const other = cur.dir === "across" ? "down" : "across";
                if (board[r][c][other]) select(r, c, other);
                break;
            }
            case "Backspace":
            case "Delete":
                e.preventDefault();
                if (board[r][c].input.value) {
                    setLetter(r, c, "", false);
                } else if (e.key === "Backspace") {
                    step(-1);
                    setLetter(cur.r, cur.c, "", false);
                }
                afterChange(cur.r, cur.c);
                break;
            default:
                if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    setLetter(r, c, e.key.toUpperCase(), false);
                    afterChange(r, c);
                    step(1);
                }
        }
    }

    function afterChange(r, c) {
        for (const dir of ["across", "down"]) {
            const w = board[r][c][dir];
            if (w) checkSolved(w);
        }
        updateStatus();
        save();
    }

    function isCorrect(w) {
        return cellsOf.get(w).every(([r, c]) => board[r][c].input.value === board[r][c].answer);
    }

    function paintSolved(w, solved) {
        for (const [r, c] of cellsOf.get(w)) {
            const other = board[r][c][w.dir === "across" ? "down" : "across"];
            board[r][c].el.classList.toggle("correct", solved || !!(other && other.solved));
        }
    }

    function checkSolved(w) {
        const ok = isCorrect(w);
        if (ok && !w.solved) {
            w.solved = true;
            w.order = state.words.filter(x => x.solved).length;
            if (cellsOf.get(w).some(([r, c]) => state.revealed[key(r, c)])) w.helped = true;
            paintSolved(w, true);
            cellsOf.get(w).forEach(([r, c], i) => {
                const el = board[r][c].el;
                el.classList.remove("pop");
                setTimeout(() => el.classList.add("pop"), i * 40);
            });
            if (!w.recorded) {
                App.recordFound(w.entry.w, w.helped);
                w.recorded = true;
            }
            App.sfx("good");
            setTimeout(() => App.speak(w.entry.w), 350);
            coach.message(`You spelled "${w.entry.w}"!`, "good");
            coach.show(w.entry, { practice: w.practice });
            updateClue(w);
            renderWall();
            if (state.words.every(x => x.solved) && !state.done) {
                state.done = true;
                App.recordPuzzle("cw");
                setTimeout(() => { App.sfx("win"); App.confetti(); }, 900);
                renderBanner();
            }
        } else if (!ok && w.solved) {
            w.solved = false;
            paintSolved(w, false);
            updateClue(w);
            renderWall();
        }
        if (w === wordAt(cur.r, cur.c, cur.dir)) paintSelection();
    }

    // ---------- Help menu ----------

    function currentWord() {
        return wordAt(cur.r, cur.c, cur.dir);
    }

    function markHelped(w) {
        w.helped = true;
    }

    function giveHint(w) {
        if (!w.hinted) {
            w.hinted = true;
            markHelped(w);
            state.hints++;
            App.recordHint();
        }
        updateClue(w);
        paintSelection();
        updateStatus();
        App.speak(w.entry.w, true);
        save();
    }

    function checkCells(list) {
        let wrong = 0;
        for (const [r, c] of list) {
            const cell = board[r][c];
            const bad = !!cell.input.value && cell.input.value !== cell.answer;
            cell.el.classList.toggle("wrong", bad);
            if (bad) {
                wrong++;
                ["across", "down"].forEach(d => { if (cell[d]) markHelped(cell[d]); });
            }
        }
        return wrong;
    }

    function revealCell(r, c) {
        const cell = board[r][c];
        if (cell.input.value === cell.answer) return false;
        setLetter(r, c, cell.answer, true);
        ["across", "down"].forEach(d => { if (cell[d]) markHelped(cell[d]); });
        return true;
    }

    const actions = {
        "hint": () => giveHint(currentWord()),
        "check-word": () => {
            const w = currentWord();
            const wrong = checkCells(cellsOf.get(w));
            coach.message(wrong
                ? `${wrong} letter${wrong > 1 ? "s" : ""} to fix (shown in red). Sound it out again!`
                : isCorrect(w) ? "Perfect spelling! 🌟" : "No mistakes so far. Keep going!", wrong ? "bad" : "good");
            save();
        },
        "check-all": () => {
            const wrong = checkCells(state.words.flatMap(w => cellsOf.get(w)));
            coach.message(wrong ? `${wrong} letter${wrong > 1 ? "s" : ""} to fix (shown in red).` : "No mistakes so far! 👍", wrong ? "bad" : "good");
            save();
        },
        "reveal-letter": () => {
            if (revealCell(cur.r, cur.c)) {
                state.hints++;
                App.recordHint();
            }
            afterChange(cur.r, cur.c);
            board[cur.r][cur.c].input.focus();
        },
        "reveal-word": () => {
            const w = currentWord();
            let any = false;
            for (const [r, c] of cellsOf.get(w)) any = revealCell(r, c) || any;
            if (any) {
                state.hints++;
                App.recordHint();
            }
            for (const [r, c] of cellsOf.get(w)) afterChange(r, c);
        },
        "clear": async () => {
            if (!(await App.confirm("Clear all the letters in this puzzle?", "Yes, clear them"))) return;
            for (const w of state.words) {
                for (const [r, c] of cellsOf.get(w)) {
                    setLetter(r, c, "", false);
                    board[r][c].el.classList.remove("correct", "wrong");
                }
                w.solved = false;
                updateClue(w);
            }
            state.done = false;
            renderWall();
            renderBanner();
            coach.reset();
            paintSelection();
            updateStatus();
            save();
        }
    };

    document.querySelectorAll("[data-cw]").forEach(btn => btn.addEventListener("click", () => actions[btn.dataset.cw]()));

    // ---------- Toolbar ----------

    function setMode(m, announce = true) {
        mode = m;
        App.store.set("cw-mode", m);
        $("cwModeRead").setAttribute("aria-pressed", m === "read");
        $("cwModeListen").setAttribute("aria-pressed", m === "listen");
        for (const w of state.words) updateClue(w);
        paintSelection();
        if (m === "listen" && announce) {
            if (!App.canSpeak) coach.message("This browser can't read words out loud. Try Chrome, Edge or Safari.", "bad");
            else App.speak(currentWord().entry.w);
        }
    }

    $("cwModeRead").addEventListener("click", () => setMode("read"));
    $("cwModeListen").addEventListener("click", () => setMode("listen"));
    $("cwNew").addEventListener("click", newPuzzle);

    $("cwPrint").addEventListener("click", () => {
        const esc = App.escapeHtml;
        const nums = new Map(state.words.map(w => [key(w.r, w.c), w.num]));
        const table = answers => {
            let html = "<table class=\"print-grid cw-print\">";
            for (let r = 0; r < state.rows; r++) {
                html += "<tr>";
                for (let c = 0; c < state.cols; c++) {
                    const cell = board[r][c];
                    if (!cell) { html += "<td class=\"blank\"></td>"; continue; }
                    const n = nums.get(key(r, c));
                    html += `<td>${n ? `<span class="pn">${n}</span>` : ""}${answers ? cell.answer : ""}</td>`;
                }
                html += "</tr>";
            }
            return html + "</table>";
        };
        const clues = dir => state.words.filter(w => w.dir === dir)
            .map(w => `<li value="${w.num}">${esc(w.entry.c || "Listen and spell the word.")} (${w.word.length})</li>`).join("");
        const clueBlock = `<div class="sheet-clues"><div><h2>Across</h2><ol>${clues("across")}</ol></div><div><h2>Down</h2><ol>${clues("down")}</ol></div></div>`;
        App.printPages(`
            <section class="sheet">
                <div class="sheet-head"><span>Name:</span><span>Date:</span></div>
                <h1>Spelling Crossword</h1>
                <p class="sheet-sub">Read each clue and spell the word. Then say it out loud.</p>
                ${table(false)}
                ${clueBlock}
            </section>
            <section class="sheet">
                <h1>Answer key</h1>
                ${table(true)}
                ${App.sayItGuide(state.words.map(w => w.entry))}
            </section>`);
    });

    // ---------- Start ----------

    App.onTab("cw", () => { if (state) sizeCells(); });
    App.onListChange(newPuzzle);

    const saved = App.store.get("cw-state", null);
    if (saved && saved.v === 1 && saved.key === puzzleKey() && Array.isArray(saved.words) && saved.words.length) {
        state = saved;
        render();
        if (!state.done && state.words.some(w => w.solved)) coach.message("Welcome back! Keep spelling.");
    } else {
        newPuzzle();
    }
    setMode(mode, false);
})();
