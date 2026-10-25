/* "My Progress" report and the "Grown-ups" settings page. */
(function () {
    "use strict";

    const $ = id => document.getElementById(id);
    const esc = App.escapeHtml;
    const STATUS_LABEL = { mastered: "Mastered", practise: "Practice again", learning: "Learning", new: "New" };
    const STATUS_ORDER = { practise: 0, learning: 1, mastered: 2, new: 3 };

    // ---------- My Progress ----------

    function wordRows() {
        return Object.entries(App.progress.words)
            .filter(([, s]) => s.found > 0)
            .map(([w, s]) => Object.assign({ w, status: App.wordStatus(w) }, s));
    }

    function progressTable(rows) {
        const body = rows.map(r => `
            <tr>
                <td><strong>${esc(r.w)}</strong></td>
                <td class="num">${r.found}</td>
                <td class="num">${r.unaided}</td>
                <td class="num">${r.helped}</td>
                <td class="num">${r.said}</td>
                <td><span class="status-pill status-${r.status}">${STATUS_LABEL[r.status]}</span></td>
            </tr>`).join("");
        return `<div class="table-scroll"><table class="words">
            <thead><tr><th>Word</th><th class="num">Found</th><th class="num">No help</th><th class="num">With help</th><th class="num">Said aloud</th><th>Status</th></tr></thead>
            <tbody>${body}</tbody></table></div>`;
    }

    function renderProgress() {
        const box = $("progressBody");
        const p = App.progress;
        const rows = wordRows().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.w.localeCompare(b.w));
        if (!rows.length) {
            box.innerHTML = `<div class="card empty-state">
                <h3>Nothing here yet</h3>
                <p class="muted">Play a Word Search or Crossword and your progress will show up here.</p>
                <button type="button" class="primary" id="progressPlay">Play Word Search</button></div>`;
            $("progressPlay").addEventListener("click", () => App.showTab("ws"));
            return;
        }
        const finds = rows.reduce((n, r) => n + r.found, 0);
        const unaided = rows.reduce((n, r) => n + r.unaided, 0);
        const mastered = rows.filter(r => r.status === "mastered").length;
        const practise = rows.filter(r => r.status === "practise");
        const tricky = rows.filter(r => r.helped > 0).sort((a, b) => b.helped - a.helped || a.w.localeCompare(b.w)).slice(0, 5);

        const tile = (value, label) => `<div class="tile"><div class="value">${value}</div><div class="label">${label}</div></div>`;
        box.innerHTML = `
            <div class="tiles">
                ${tile((p.puzzles.ws || 0) + (p.puzzles.cw || 0), "Puzzles finished")}
                ${tile(finds, "Words found or spelled")}
                ${tile(Math.round((unaided / finds) * 100) + "%", "Done without help")}
                ${tile(mastered, "Words mastered")}
                ${tile(p.said, "Words said aloud")}
                ${tile(p.hints, "Hints used")}
            </div>
            <div class="progress-grid">
                <section class="card">
                    <h3>🔁 Practice again</h3>
                    <p class="muted small">These words needed help. They come back in new puzzles until they're found twice in a row without help.</p>
                    <div class="chips" id="practiceChips"></div>
                </section>
                <section class="card">
                    <h3>Trickiest words</h3>
                    <div class="chips" id="trickyChips"></div>
                </section>
            </div>
            <section class="card">
                <h3>Every word so far</h3>
                ${progressTable(rows)}
            </section>`;

        const chips = (el, list, empty) => {
            if (!list.length) {
                el.innerHTML = `<p class="muted">${empty}</p>`;
                return;
            }
            list.forEach(r => {
                const chip = document.createElement("span");
                chip.className = "chip";
                chip.textContent = r.w + " ";
                const btn = document.createElement("button");
                btn.type = "button";
                btn.textContent = "🔊";
                btn.setAttribute("aria-label", `Hear ${r.w}`);
                btn.addEventListener("click", () => App.speak(r.w));
                chip.appendChild(btn);
                el.appendChild(chip);
            });
        };
        chips($("practiceChips"), practise, "Nothing to practice right now. Great work! 🎉");
        chips($("trickyChips"), tricky, "No tricky words yet.");
    }

    App.onTab("progress", renderProgress);

    $("progressReset").addEventListener("click", async () => {
        if (!(await App.confirm("Erase all progress and start over? This can't be undone.", "Yes, start over"))) return;
        App.resetProgress();
        renderProgress();
    });

    $("progressPrint").addEventListener("click", () => {
        const p = App.progress;
        const rows = wordRows().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.w.localeCompare(b.w));
        const date = new Date().toLocaleDateString();
        App.printPages(`
            <section class="sheet">
                <div class="sheet-head"><span>Name:</span><span>Date: ${esc(date)}</span></div>
                <h1>Spelling Progress</h1>
                <p class="sheet-sub">Puzzles finished: ${(p.puzzles.ws || 0) + (p.puzzles.cw || 0)} ·
                    Words said aloud: ${p.said} · Hints used: ${p.hints}</p>
                ${rows.length ? progressTable(rows) : "<p>No words yet.</p>"}
            </section>`, "report-print");
    });

    // ---------- Grown-ups: word list ----------

    const listText = $("listText");
    const listName = $("listName");
    const report = $("listReport");
    const preview = $("listPreview");

    function fillListForm() {
        const list = App.getCustomList();
        listText.value = list.text;
        listName.value = list.name;
        const custom = App.settings.listSource === "custom";
        $("listCustom").checked = custom;
        $("listBuiltin").checked = !custom;
        $("customListBox").hidden = !custom;
        showPreview(custom ? App.parseWordList(list.text).entries : []);
    }

    function showPreview(entries) {
        preview.innerHTML = "";
        entries.forEach(e => {
            const chip = document.createElement("span");
            chip.className = "chip plain";
            chip.title = e.known ? "Has a clue, syllables and a 'say it' guide" : (e.c ? "Uses your clue" : "Listen-only: no clue yet");
            chip.textContent = `${e.known ? "✓" : e.c ? "✎" : "🎧"} ${e.w}`;
            preview.appendChild(chip);
        });
    }

    document.querySelectorAll("input[name=listSource]").forEach(r => r.addEventListener("change", () => {
        $("customListBox").hidden = !$("listCustom").checked;
        report.innerHTML = "";
    }));

    listText.addEventListener("input", () => showPreview(App.parseWordList(listText.value).entries));

    $("listSave").addEventListener("click", () => {
        const custom = $("listCustom").checked;
        if (!custom) {
            App.setCustomList({ name: listName.value, text: listText.value }, "builtin");
            report.innerHTML = "<p class=\"ok\">Using the built-in 5th grade words. New puzzles are ready!</p>";
            showPreview([]);
            return;
        }
        const { entries, problems } = App.parseWordList(listText.value);
        const problemList = problems.length
            ? `<ul class="warn">${problems.slice(0, 8).map(p => `<li>${esc(p)}</li>`).join("")}</ul>`
            : "";
        if (entries.length < 4) {
            report.innerHTML = `<p class="warn">Please add at least 4 words (you have ${entries.length}).</p>${problemList}`;
            return;
        }
        App.setCustomList({ name: listName.value.trim(), text: listText.value }, "custom");
        const known = entries.filter(e => e.known).length;
        const listenOnly = entries.filter(e => !e.known && !e.c).length;
        report.innerHTML = `<p class="ok">Saved ${entries.length} words. New puzzles are ready!</p>
            <p class="small muted">✓ ${known} with a full "say it" guide · ✎ ${entries.length - known - listenOnly} with your clue ·
            🎧 ${listenOnly} listen-only (add a clue after a colon to show one in the crossword)</p>${problemList}`;
        showPreview(entries);
    });

    // ---------- Grown-ups: voice, sound and display ----------

    const voiceSelect = $("voiceSelect");
    const rate = $("rate");
    const rateOut = $("rateOut");

    function fillVoices() {
        if (App.NATIVE) {
            voiceSelect.closest("label").hidden = true;
            $("voiceNote").textContent = "The app uses this device's reading voice. To change it, open your phone's " +
                "Settings and search for \"text-to-speech\".";
            return;
        }
        const voices = App.englishVoices();
        voiceSelect.innerHTML = "<option value=\"\">Automatic (best English voice)</option>" +
            voices.map(v => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join("");
        voiceSelect.value = voices.some(v => v.name === App.settings.voice) ? App.settings.voice : "";
        $("voiceNote").textContent = App.canSpeak
            ? (voices.length ? "Voices come from this device, so the list is different on each computer or tablet." : "Loading voices…")
            : "This browser can't read words out loud. Try Chrome, Edge or Safari.";
    }

    function speedLabel(v) {
        if (v <= 0.65) return "Very slow";
        if (v <= 0.8) return "Slow";
        if (v <= 0.95) return "Normal";
        return "Fast";
    }

    if (App.canSpeak) speechSynthesis.addEventListener("voiceschanged", fillVoices);

    voiceSelect.addEventListener("change", () => {
        App.settings.voice = voiceSelect.value;
        App.saveSettings();
        App.speak("Hello! Let's practice spelling.");
    });

    rate.addEventListener("input", () => {
        App.settings.rate = parseFloat(rate.value);
        rateOut.textContent = speedLabel(App.settings.rate);
    });
    rate.addEventListener("change", () => {
        App.saveSettings();
        App.speak("beautiful");
    });

    $("testVoice").addEventListener("click", () => App.speak("Hello! Let's practice spelling. Necessary. Rhythm. Beautiful."));

    const sfx = $("sfx");
    sfx.addEventListener("change", () => {
        App.settings.sfx = sfx.checked;
        App.saveSettings();
        App.sfx("good");
    });

    const textSize = $("textSize");
    textSize.addEventListener("change", () => {
        App.settings.textSize = textSize.value;
        App.saveSettings();
    });

    const theme = $("themeSelect");
    theme.addEventListener("change", () => {
        App.settings.theme = theme.value;
        App.saveSettings();
    });

    const contrast = $("contrast");
    contrast.addEventListener("change", () => {
        App.settings.contrast = contrast.checked ? "high" : "normal";
        App.saveSettings();
    });

    // ---------- Grown-ups: installing ----------

    function fillInstall() {
        const box = $("installInfo");
        const state = App.installState();
        const text = {
            native: "You're using the app. Everything works offline.",
            installed: "The app is installed on this device. It works offline, even without the internet.",
            embedded: "Open the website version on a phone or tablet to install it as an app.",
            ios: "On iPhone or iPad: tap the Share button (the square with an arrow), then <strong>Add to Home Screen</strong>. " +
                "The games then open full screen and work offline.",
            ready: "Install the games on this device. They get their own icon, open full screen and work offline.",
            unavailable: "On Android, open this page in Chrome and choose <strong>Install app</strong> or " +
                "<strong>Add to Home screen</strong> from the ⋮ menu. On iPhone or iPad, use Safari's Share button, " +
                "then <strong>Add to Home Screen</strong>."
        }[state];
        box.innerHTML = `<p>${text}</p>`;
        if (state === "ready") {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "primary";
            btn.textContent = "📲 Install app";
            btn.addEventListener("click", App.promptInstall);
            box.appendChild(btn);
        }
    }

    App.onInstallChange(fillInstall);

    App.onTab("grownups", () => {
        fillInstall();
        fillListForm();
        fillVoices();
        rate.value = App.settings.rate;
        rateOut.textContent = speedLabel(App.settings.rate);
        sfx.checked = App.settings.sfx;
        textSize.value = App.settings.textSize;
        theme.value = App.settings.theme;
        contrast.checked = App.settings.contrast === "high";
    });
})();
