# Stone Paper Scissors

A Stone Paper Scissors game you play against a machine. It works on phones, tablets and desktops, and you can play it with taps or a keyboard.

## How to play

Pick stone, paper or scissors. The machine picks at the same moment.

- **Stone crushes scissors.**
- **Scissors cut paper.**
- **Paper covers stone.**
- If you both pick the same move, it's a draw. Draws don't score, so you throw again.

### Match length

| Format    | Round wins needed |
|-----------|-------------------|
| Best of 3 | 2                 |
| Best of 5 | 3                 |
| Best of 7 | 4                 |
| Endless   | No limit, the score just keeps running |

### Opponents

- **Random:** every move is chosen by chance.
- **Adaptive:** looks at the order you play moves in (your overall habits, what you play after your last move, and what you play after your last two moves) and counters the move it expects next. After each round it tells you what it predicted and how sure it was. It never sees your current move.

## Features

- Responsive layout for phones, tablets and desktops, including short landscape screens and notched phones
- Best of 3, 5 or 7, or endless matches
- Random and adaptive opponents
- A rules sheet with a diagram of what beats what
- Round history, match summary and a lifetime record saved on your device
- Sound effects and vibration on phones, with one switch to turn both off
- Keyboard controls: `1` stone, `2` paper, `3` scissors, `Esc` closes a sheet
- Respects your system's reduced-motion setting
- Can be added to your phone's home screen

## Run it

There's no build step. Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Files

| File                   | Purpose                              |
|------------------------|--------------------------------------|
| `index.html`           | Page structure, move icons, dialogs  |
| `index.css`            | Styles and responsive layout         |
| `app.js`               | Game rules, opponents, sound, saving |
| `icon.svg`             | App icon                             |
| `manifest.webmanifest` | Home screen install details          |

&copy; Rishi Srivastava
