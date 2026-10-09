'use strict';
const { desktopCapturer, screen } = require('electron');

/** Captures the primary display as a JPEG (kept small for fast vision calls). */
async function captureScreen() {
  const display = screen.getPrimaryDisplay();
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / display.size.width);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * scale * display.scaleFactor),
      height: Math.round(display.size.height * scale * display.scaleFactor),
    },
  });
  if (!sources.length) throw new Error('No screen available to capture.');
  const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (src.thumbnail.isEmpty()) {
    throw new Error('Screen capture returned an empty image. Grant screen recording permission and retry.');
  }
  const jpeg = src.thumbnail.toJPEG(70);
  return { mime: 'image/jpeg', base64: jpeg.toString('base64') };
}

module.exports = { captureScreen };
