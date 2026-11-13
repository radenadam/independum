import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";

/** Checks rendered QR pixels in the capture retained as evidence. */
export async function checkRenderedQr(
  page: Page,
  target: { on: string; name: string },
  directory: string,
  viewportName?: string,
): Promise<{ qrHasBlackModules: true; qrHasWhiteBackground: true }> {
  const deadline = Date.now() + 5000;
  let pixels = { black: 0, white: 0, total: 0 };
  let unverifiedCapture: Buffer | undefined;
  await page
    .waitForFunction(
      `(() => { const image = (${target.on}); return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !document.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity); })()`,
      undefined,
      { timeout: 5000 },
    )
    .catch((error: unknown) => {
      throw new Error("The QR image does not finish loading and animating.", { cause: error });
    });
  do {
    const handle = await page.evaluateHandle(target.on);
    const element = handle.asElement();
    if (element === null) {
      await handle.dispose();
      throw new Error("The QR target is missing.");
    }
    try {
      const region = await page.evaluate<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>(`(() => { const element = (${target.on});
        if (!(element instanceof HTMLImageElement)) {
          throw new Error("The QR target is not an image.");
        }
        const visibilityOptions = {
          checkOpacity: true,
          checkVisibilityCSS: true,
        };
        const box = element.getBoundingClientRect();
        if (
          !element.checkVisibility(visibilityOptions) ||
          element.closest("[inert]") ||
          box.left < 0 ||
          box.top < 0 ||
          box.right > innerWidth ||
          box.bottom > innerHeight ||
          !element.contains(
            document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2),
          )
        ) {
          throw new Error("The QR image is covered or outside the screen.");
        }
        return { x: box.left, y: box.top, width: box.width, height: box.height };
      })()`);
      const elementCapture = await element.screenshot({ timeout: 5000, scale: "css" });
      await writeFile(join(directory, `${target.name}.png`), elementCapture);
      const capture =
        viewportName === undefined
          ? elementCapture
          : await page.screenshot({ timeout: 5000, scale: "css" });
      // Decode the screenshot PNG, never the SVG source that can exist before screen painting.
      pixels = await page.evaluate<{ black: number; white: number; total: number }>(`(async () => {
        const image = new Image();
        image.src = ${JSON.stringify(`data:image/png;base64,${capture.toString("base64")}`)};
        await image.decode();
        const region = ${viewportName === undefined ? "{ x: 0, y: 0, width: image.width, height: image.height }" : JSON.stringify(region)};
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(region.width);
        canvas.height = Math.floor(region.height);
        const context = canvas.getContext("2d");
        if (context === null) {
          throw new Error("The screenshot decoder is unavailable.");
        }
        context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let black = 0;
        let white = 0;
        for (let index = 0; index < data.length; index += 4) {
          const red = data[index] ?? 128;
          const green = data[index + 1] ?? 128;
          const blue = data[index + 2] ?? 128;
          if (red < 32 && green < 32 && blue < 32 && data[index + 3] === 255) {
            black += 1;
          }
          if (red > 223 && green > 223 && blue > 223 && data[index + 3] === 255) {
            white += 1;
          }
        }
        return { black, white, total: canvas.width * canvas.height };
      })()`);
      if (
        pixels.total > 0 &&
        pixels.black > pixels.total * 0.05 &&
        pixels.white > pixels.total * 0.05
      ) {
        if (viewportName !== undefined) {
          await writeFile(join(directory, `${viewportName}.png`), capture);
        }
        return { qrHasBlackModules: true, qrHasWhiteBackground: true };
      }
      unverifiedCapture = capture;
    } finally {
      await handle.dispose();
    }
  } while (Date.now() < deadline);
  if (viewportName !== undefined && unverifiedCapture !== undefined) {
    await writeFile(join(directory, `${viewportName}-unverified.png`), unverifiedCapture);
  }
  throw new Error(
    `The rendered QR stays blank or lacks contrast: ${pixels.black} black and ${pixels.white} white pixels of ${pixels.total}.`,
  );
}
