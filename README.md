# Bkatey-Portfolio

## Spelling Word Games (`crossword/`)

Word Search and Crossword games that help 5th graders practice spelling and pronunciation.
Open `crossword/index.html` in a browser. Nothing needs to be installed.

- **Word Search**: slide across a word (or tap its first and last letter, or use the arrow keys and Enter) to cross it out. The word is then read aloud.
- **Crossword**: read the clue or listen to the word, then type it.
- **Say it**: after each word, the child hears it, can hear it slowly, can record themselves and compare, and marks "I said it!".
- **Practice words**: words that needed a hint or a reveal come back in later puzzles until they're found twice in a row without help.
- **Levels**: Easy, Medium and Hard change the grid size, number of words and word directions.
- **Grown-ups tab**: paste this week's spelling list (add a clue after a colon), choose the voice and speed, turn sound effects on or off, and change text size, colours or high contrast.
- **My Progress**: words found, words done without help, words said aloud, and the words to practice. It can be printed.
- **Worksheets**: each game prints the puzzle with an answer key and a "say it" guide.

Progress, settings and word lists are saved in the browser on that device (`localStorage`).
Reading aloud uses the browser's built-in speech, which works in Chrome, Edge and Safari.

Files: `index.html` (page), `styles.css`, `words.js` (built-in word list), `app.js` (shared helpers),
`wordsearch.js`, `crossword.js` and `panels.js` (progress and grown-up settings).

### Publishing with GitHub Pages

1. Merge the changes into `main`.
2. In the repository, open **Settings → Pages**, choose **Deploy from a branch**, then pick `main` and `/ (root)`.
3. After a minute the games are at `https://<your-username>.github.io/Bkatey-Portfolio/crossword/`.
