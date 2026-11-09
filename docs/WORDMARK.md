# GoPlan wordmark

The owner-supplied cover photo is the reference for the bold **GoPlan** lettering. The shared artwork is an outlined SVG, so it does not depend on installed fonts or platform font weights. Letter outlines were taken from the cover's GoPlan region only, with slight subpixel smoothing; background texture was excluded.

`dist/goplan-wordmark.svg` uses the existing green `#173e35` on light backgrounds. `dist/goplan-wordmark-light.svg` uses ivory `#f8f9f3` on the dark admin sidebar. Both contain the same letter geometry. The circular G favicon is a separate asset and retains its existing appearance and stable URL.

Homepage header/footer, planner header, sign-in, privacy home link, operations sidebar and signed-out/unauthorized operations gates all use this artwork. `wordmark.css` controls size and alignment without changing heading or body typography. Brand image links retain their destinations and accessible names. Product mentions in prose and exported document text remain ordinary text.
