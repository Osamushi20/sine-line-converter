const outputCanvas = document.getElementById("outputCanvas");
const sourceCanvas = document.getElementById("sourceCanvas");
const outputCtx = outputCanvas.getContext("2d");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });

const controls = {
  imageInput: document.getElementById("imageInput"),
  lineColor: document.getElementById("lineColor"),
  backgroundColor: document.getElementById("backgroundColor"),
  lineSpacing: document.getElementById("lineSpacing"),
  lineWidth: document.getElementById("lineWidth"),
  minAmplitude: document.getElementById("minAmplitude"),
  maxAmplitude: document.getElementById("maxAmplitude"),
  minFrequency: document.getElementById("minFrequency"),
  maxFrequency: document.getElementById("maxFrequency"),
  darkAlpha: document.getElementById("darkAlpha"),
  gamma: document.getElementById("gamma"),
  handNoise: document.getElementById("handNoise"),
  seedButton: document.getElementById("seedButton"),
  downloadButton: document.getElementById("downloadButton"),
};

const readouts = {
  spacingValue: document.getElementById("spacingValue"),
  widthValue: document.getElementById("widthValue"),
  minAmplitudeValue: document.getElementById("minAmplitudeValue"),
  maxAmplitudeValue: document.getElementById("maxAmplitudeValue"),
  minFrequencyValue: document.getElementById("minFrequencyValue"),
  maxFrequencyValue: document.getElementById("maxFrequencyValue"),
  darkAlphaValue: document.getElementById("darkAlphaValue"),
  gammaValue: document.getElementById("gammaValue"),
  handNoiseValue: document.getElementById("handNoiseValue"),
};

let seed = Math.floor(Math.random() * 100000);
let grayscale = null;
let uploadedImage = null;
let redrawTimer = 0;

// Slider changes can arrive quickly, so draw once on the next animation frame.
function scheduleRender() {
  updateReadouts();
  cancelAnimationFrame(redrawTimer);
  redrawTimer = requestAnimationFrame(() => {
    if (uploadedImage && grayscale) {
      renderSineLines();
    } else {
      renderPlaceholder();
    }
  });
}

function updateReadouts() {
  readouts.spacingValue.value = controls.lineSpacing.value;
  readouts.widthValue.value = Number(controls.lineWidth.value).toFixed(1);
  readouts.minAmplitudeValue.value = Number(controls.minAmplitude.value).toFixed(1);
  readouts.maxAmplitudeValue.value = Number(controls.maxAmplitude.value).toFixed(1);
  readouts.minFrequencyValue.value = Number(controls.minFrequency.value).toFixed(3);
  readouts.maxFrequencyValue.value = Number(controls.maxFrequency.value).toFixed(3);
  readouts.darkAlphaValue.value = Number(controls.darkAlpha.value).toFixed(2);
  readouts.gammaValue.value = Number(controls.gamma.value).toFixed(2);
  readouts.handNoiseValue.value = Number(controls.handNoise.value).toFixed(2);
}

function fitImageToCanvas(image) {
  const maxWidth = 900;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  return {
    width: Math.max(1, Math.round(image.naturalWidth * scale)),
    height: Math.max(1, Math.round(image.naturalHeight * scale)),
  };
}

function loadImageToSource(image) {
  const size = fitImageToCanvas(image);
  sourceCanvas.width = size.width;
  sourceCanvas.height = size.height;
  outputCanvas.width = size.width;
  outputCanvas.height = size.height;

  sourceCtx.clearRect(0, 0, size.width, size.height);
  sourceCtx.drawImage(image, 0, 0, size.width, size.height);

  const rawGrayscale = buildGrayscaleMap(size.width, size.height);
  grayscale = normalizeBrightness(boxBlur(rawGrayscale, size.width, size.height, 1));
}

function buildGrayscaleMap(width, height) {
  const pixels = sourceCtx.getImageData(0, 0, width, height).data;
  const values = new Uint8ClampedArray(width * height);

  // Rec. 709 luminance gives a stable brightness map for photos, objects, and scenery.
  for (let i = 0, p = 0; i < values.length; i += 1, p += 4) {
    values[i] = Math.round(
      pixels[p] * 0.2126 + pixels[p + 1] * 0.7152 + pixels[p + 2] * 0.0722
    );
  }

  return values;
}

function boxBlur(values, width, height, radius) {
  const result = new Uint8ClampedArray(values.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let count = 0;

      for (let oy = -radius; oy <= radius; oy += 1) {
        const sy = clamp(y + oy, 0, height - 1);
        for (let ox = -radius; ox <= radius; ox += 1) {
          const sx = clamp(x + ox, 0, width - 1);
          total += values[sy * width + sx];
          count += 1;
        }
      }

      result[y * width + x] = Math.round(total / count);
    }
  }

  return result;
}

function normalizeBrightness(values) {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < values.length; i += 1) {
    histogram[values[i]] += 1;
  }

  const low = findPercentile(histogram, values.length * 0.01);
  const high = findPercentile(histogram, values.length * 0.99);
  const span = Math.max(24, high - low);
  const normalized = new Uint8ClampedArray(values.length);

  for (let i = 0; i < values.length; i += 1) {
    normalized[i] = Math.round(clamp(((values[i] - low) / span) * 255, 0, 255));
  }

  return normalized;
}

function findPercentile(histogram, target) {
  let total = 0;
  for (let i = 0; i < histogram.length; i += 1) {
    total += histogram[i];
    if (total >= target) return i;
  }
  return 255;
}

function getBrightness(x, y) {
  const safeX = Math.max(0, Math.min(sourceCanvas.width - 1, Math.round(x)));
  const safeY = Math.max(0, Math.min(sourceCanvas.height - 1, Math.round(y)));
  return grayscale[safeY * sourceCanvas.width + safeX];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Tiny deterministic noise, used only for a subtle hand-drawn wobble.
function hashNoise(ix, iy, salt = 0) {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 17.13 + salt * 74.7) * 43758.5453123;
  return (n - Math.floor(n)) * 2 - 1;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function getSettings() {
  const minAmplitude = Number(controls.minAmplitude.value);
  const maxAmplitude = Math.max(minAmplitude, Number(controls.maxAmplitude.value));
  const minFrequency = Number(controls.minFrequency.value);
  const maxFrequency = Math.max(minFrequency, Number(controls.maxFrequency.value));

  return {
    lineColor: hexToRgb(controls.lineColor.value),
    backgroundColor: controls.backgroundColor.value,
    lineSpacing: Number(controls.lineSpacing.value),
    lineWidth: Number(controls.lineWidth.value),
    minAmplitude,
    maxAmplitude,
    minFrequency,
    maxFrequency,
    darkAlpha: Number(controls.darkAlpha.value),
    gamma: Number(controls.gamma.value),
    handNoise: Number(controls.handNoise.value),
  };
}

function renderSineLines() {
  const settings = getSettings();
  const width = outputCanvas.width;
  const height = outputCanvas.height;
  const sampleStep = 3;
  const harmonicAmount = 0.32;
  const lightAlpha = 0.13;

  outputCtx.fillStyle = settings.backgroundColor;
  outputCtx.fillRect(0, 0, width, height);
  outputCtx.lineWidth = settings.lineWidth;
  outputCtx.lineCap = "round";
  outputCtx.lineJoin = "round";

  for (let y = 0; y <= height; y += settings.lineSpacing) {
    const rowIndex = Math.round(y / settings.lineSpacing);
    const rowPhase = seed * 0.017 + rowIndex * 0.73;
    const rowPhase2 = seed * 0.031 + rowIndex * 1.19;
    let previousPoint = null;

    for (let x = 0; x <= width; x += sampleStep) {
      const point = getSinePoint(x, y, rowIndex, rowPhase, rowPhase2, settings, harmonicAmount);

      if (previousPoint) {
        const alpha = clamp((previousPoint.alpha + point.alpha) * 0.5, 0, 1);
        outputCtx.strokeStyle =
          `rgba(${settings.lineColor.r}, ${settings.lineColor.g}, ${settings.lineColor.b}, ${alpha})`;
        outputCtx.beginPath();
        outputCtx.moveTo(previousPoint.x, previousPoint.y);
        outputCtx.lineTo(point.x, point.y);
        outputCtx.stroke();
      }

      previousPoint = point;
    }
  }

  function getSinePoint(x, baseY, rowIndex, rowPhase, rowPhase2, currentSettings, harmonic) {
    const brightness = getBrightness(x, baseY);
    const darkness = clamp(1 - brightness / 255, 0, 1);
    const d = Math.pow(darkness, currentSettings.gamma);
    const amplitude = lerp(currentSettings.minAmplitude, currentSettings.maxAmplitude, d);
    const frequency = lerp(currentSettings.minFrequency, currentSettings.maxFrequency, d);
    const handDrawn =
      hashNoise(Math.round(x / 7), rowIndex, 4) * currentSettings.handNoise * (0.25 + d * 0.45);
    const yOffset =
      Math.sin(x * frequency + rowPhase) * amplitude +
      Math.sin(x * frequency * 2.3 + rowPhase2) * amplitude * harmonic +
      handDrawn;
    const alpha = lerp(lightAlpha, currentSettings.darkAlpha, d);

    return {
      x,
      y: baseY + yOffset,
      alpha,
    };
  }
}

function renderPlaceholder() {
  const width = 900;
  const height = 640;

  outputCanvas.width = width;
  outputCanvas.height = height;
  sourceCanvas.width = width;
  sourceCanvas.height = height;

  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, width, height);
  grayscale = null;
}

function ellipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return clamp(1 - (dx * dx + dy * dy), 0, 1);
}

function downloadPng() {
  const link = document.createElement("a");
  link.download = "sine-line-image.png";
  link.href = outputCanvas.toDataURL("image/png");
  link.click();
}

controls.imageInput.addEventListener("change", () => {
  const file = controls.imageInput.files && controls.imageInput.files[0];
  if (!file) return;

  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(image.src);
    uploadedImage = image;
    loadImageToSource(image);
    renderSineLines();
  };
  image.src = URL.createObjectURL(file);
});

[
  controls.lineColor,
  controls.backgroundColor,
  controls.lineSpacing,
  controls.lineWidth,
  controls.minAmplitude,
  controls.maxAmplitude,
  controls.minFrequency,
  controls.maxFrequency,
  controls.darkAlpha,
  controls.gamma,
  controls.handNoise,
].forEach((control) => control.addEventListener("input", scheduleRender));

controls.seedButton.addEventListener("click", () => {
  seed = Math.floor(Math.random() * 100000);
  scheduleRender();
});

controls.downloadButton.addEventListener("click", downloadPng);

updateReadouts();
renderPlaceholder();
