# Changelog

## [0.2.0]

- A Game Boy look (Settings → Look, or G): each game drawn as Game Boy Tetris draws it, on a
  160 × 144 screen of four shades, with brick walls, a well 18 deep, SCORE, LEVEL and LINES boxes,
  the next piece, a piece pattern of its own for each of the seven, and its game over. The screen
  is shown as the Game Boy's LCD looked, with what emulators do to recreate it: slow pixels that
  leave a fading trail, a dot matrix with light gaps, ink that casts a soft shadow onto the
  backing, a little bloom, and the bezel's shadow at the top. It sits in a Game Boy's bezel: the
  stripe across the top says what made the latest piece, and the red light is on while the
  system has calls on the air.
- Two palettes, SameBoy's: the first Game Boy's green, and the Game Boy Pocket's gray.
- Settings' "Colors" is now "Look": NES, NES with modern colors, Game Boy, Game Boy Pocket. A
  colors choice from 0.1 carries over.

## [0.1.0]

- A game of Tetris for each trunked system, played by the computer, its pieces made by the
  messages on the system's control channel: a channel grant makes a T, O or I, an affiliation a
  J or L, a registration or deregistration an S or Z. Pieces come out of a bag of seven, so each
  comes as often as any other however lopsided the messages are, and only the first fitting
  message after a piece appears makes the next one, so the game goes at its own pace.
- NES Tetris's screen, with its colors changing with the level, and its scoring.
- A computer player that slips now and then, so games end (about half an hour each at the
  relaxed pace) and start again by themselves.
- As many games on the screen as fit; with more systems than that, they take turns.
- Message boxes: TETRIS!, the level, a new record, game over, a new high score.
- One high score table for every system, with the date, between games and under 🏆.
- Korobeiniki as chiptune music, sound effects, and live audio, each on or off. The music goes
  quiet while the radio talks.
- Full screen, for a wall or a spare monitor.
