const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
  try {
    const projectRoot = path.join(__dirname, '..');
    const srcPng = path.join(projectRoot, 'build', 'icon.png');
    const img = nativeImage.createFromPath(srcPng);
    console.log('Original size:', img.getSize());

    const sizes = [256, 128, 64, 48, 32, 16];
    const pngBuffers = sizes.map(size => {
      const resized = img.resize({ width: size, height: size, quality: 'best' });
      return {
        size,
        buffer: resized.toPNG()
      };
    });

    // Build ICO file
    // Header: 6 bytes
    // Entries: 16 bytes * count
    // Followed by raw PNG images
    const count = pngBuffers.length;
    let header = Buffer.alloc(6 + count * 16);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // ICO type
    header.writeUInt16LE(count, 4); // count

    let offset = 6 + count * 16;
    for (let i = 0; i < count; i++) {
      const entryOffset = 6 + i * 16;
      const { size, buffer } = pngBuffers[i];
      const bSize = size >= 256 ? 0 : size;

      header.writeUInt8(bSize, entryOffset); // width (0 = 256)
      header.writeUInt8(bSize, entryOffset + 1); // height (0 = 256)
      header.writeUInt8(0, entryOffset + 2); // color palette count
      header.writeUInt8(0, entryOffset + 3); // reserved
      header.writeUInt16LE(1, entryOffset + 4); // color planes
      header.writeUInt16LE(32, entryOffset + 6); // bits per pixel
      header.writeUInt32LE(buffer.length, entryOffset + 8); // image size
      header.writeUInt32LE(offset, entryOffset + 12); // image offset

      offset += buffer.length;
    }

    const icoBuffer = Buffer.concat([header, ...pngBuffers.map(p => p.buffer)]);
    const outIco = path.join(projectRoot, 'build', 'icon.ico');
    fs.writeFileSync(outIco, icoBuffer);
    console.log('Successfully wrote', outIco, 'size:', icoBuffer.length);

    // Also copy to src/renderer/assets/icons/icon.png for in-app and browser window use
    const rendererIconDir = path.join(projectRoot, 'src', 'renderer', 'assets', 'icons');
    fs.mkdirSync(rendererIconDir, { recursive: true });
    fs.copyFileSync(srcPng, path.join(rendererIconDir, 'icon.png'));
    console.log('Copied icon.png to renderer assets');

  } catch (err) {
    console.error('Error generating ico:', err);
  } finally {
    app.quit();
  }
});
