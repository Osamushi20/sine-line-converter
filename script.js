const outputCanvas = document.getElementById("outputCanvas");
const sourceCanvas = document.getElementById("sourceCanvas");
const workspace = document.querySelector(".workspace");
const outputCtx = outputCanvas.getContext("2d");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });

const controls = {
  imageInput: document.getElementById("imageInput"),
  lineColor: document.getElementById("lineColor"),
  backgroundColor: document.getElementById("backgroundColor"),
  lineSpacing: document.getElementById("lineSpacing"),
  lineSpacingNumber: document.getElementById("lineSpacingNumber"),
  lineWidth: document.getElementById("lineWidth"),
  lineWidthNumber: document.getElementById("lineWidthNumber"),
  minAmplitude: document.getElementById("minAmplitude"),
  minAmplitudeNumber: document.getElementById("minAmplitudeNumber"),
  maxAmplitude: document.getElementById("maxAmplitude"),
  maxAmplitudeNumber: document.getElementById("maxAmplitudeNumber"),
  minFrequency: document.getElementById("minFrequency"),
  minFrequencyNumber: document.getElementById("minFrequencyNumber"),
  maxFrequency: document.getElementById("maxFrequency"),
  maxFrequencyNumber: document.getElementById("maxFrequencyNumber"),
  darkAlpha: document.getElementById("darkAlpha"),
  darkAlphaNumber: document.getElementById("darkAlphaNumber"),
  gamma: document.getElementById("gamma"),
  gammaNumber: document.getElementById("gammaNumber"),
  downloadButton: document.getElementById("downloadButton"),
  saveSvgButton: document.getElementById("saveSvgButton"),
  copySvgButton: document.getElementById("copySvgButton"),
};

const readouts = {
  spacingValue: controls.lineSpacingNumber,
  widthValue: controls.lineWidthNumber,
  minAmplitudeValue: controls.minAmplitudeNumber,
  maxAmplitudeValue: controls.maxAmplitudeNumber,
  minFrequencyValue: controls.minFrequencyNumber,
  maxFrequencyValue: controls.maxFrequencyNumber,
  darkAlphaValue: controls.darkAlphaNumber,
  gammaValue: controls.gammaNumber,
};

const rangeTracks = {
  amplitude: document.getElementById("amplitudeRange"),
  frequency: document.getElementById("frequencyRange"),
};

const HAND_NOISE_AMOUNT = 0.45;

let seed = Math.floor(Math.random() * 100000);
let grayscale = null;
let svgPaths = [];
let svgBackgroundColor = "#ffffff";
let svgStrokeColor = controls.lineColor.value;
let svgStrokeWidth = Number(controls.lineWidth.value);
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
    handNoise: HAND_NOISE_AMOUNT,
  };
}

function renderSineLines() {
  workspace.classList.add("has-image");
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
  svgPaths = [];
  svgBackgroundColor = settings.backgroundColor;
  svgStrokeColor = controls.lineColor.value;
  svgStrokeWidth = settings.lineWidth;

  for (let y = 0; y <= height; y += settings.lineSpacing) {
    const rowIndex = Math.round(y / settings.lineSpacing);
    const rowPhase = seed * 0.017 + rowIndex * 0.73;
    const rowPhase2 = seed * 0.031 + rowIndex * 1.19;
    let previousPoint = null;
    const rowPoints = [];
    let rowOpacityTotal = 0;
    let rowOpacityCount = 0;

    for (let x = 0; x <= width; x += sampleStep) {
      const point = getSinePoint(x, y, rowIndex, rowPhase, rowPhase2, settings, harmonicAmount);
      rowPoints.push({ x: point.x, y: point.y });

      if (previousPoint) {
        const alpha = clamp((previousPoint.alpha + point.alpha) * 0.5, 0, 1);
        outputCtx.strokeStyle =
          `rgba(${settings.lineColor.r}, ${settings.lineColor.g}, ${settings.lineColor.b}, ${alpha})`;
        outputCtx.beginPath();
        outputCtx.moveTo(previousPoint.x, previousPoint.y);
        outputCtx.lineTo(point.x, point.y);
        outputCtx.stroke();
        rowOpacityTotal += alpha;
        rowOpacityCount += 1;
      }

      previousPoint = point;
    }

    if (rowPoints.length > 1) {
      svgPaths.push({
        d: catmullRomToBezierPath(rowPoints),
        opacity: rowOpacityCount > 0 ? rowOpacityTotal / rowOpacityCount : 1,
      });
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
  workspace.classList.remove("has-image");
  const width = 900;
  const height = 640;

  outputCanvas.width = width;
  outputCanvas.height = height;
  sourceCanvas.width = width;
  sourceCanvas.height = height;

  outputCtx.fillStyle = "#ffffff";
  outputCtx.fillRect(0, 0, width, height);
  svgPaths = [];
  svgBackgroundColor = "#ffffff";
  svgStrokeColor = controls.lineColor.value;
  svgStrokeWidth = Number(controls.lineWidth.value);
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

function formatSvgNumber(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "");
}

function catmullRomToBezierPath(points) {
  const first = points[0];
  let d = `M ${formatSvgNumber(first.x)} ${formatSvgNumber(first.y)}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${formatSvgNumber(c1x)} ${formatSvgNumber(c1y)} ${formatSvgNumber(c2x)} ${formatSvgNumber(c2y)} ${formatSvgNumber(p2.x)} ${formatSvgNumber(p2.y)}`;
  }

  return d;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildSvgString() {
  const width = outputCanvas.width;
  const height = outputCanvas.height;
  const background = escapeXml(svgBackgroundColor);
  const stroke = escapeXml(svgStrokeColor);
  const strokeWidth = formatSvgNumber(svgStrokeWidth);
  const pathMarkup = svgPaths
    .map((path) => {
      const opacity = formatSvgNumber(clamp(path.opacity, 0, 1));
      return `  <path d="${path.d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="100%" height="100%" fill="${background}"/>`,
    pathMarkup,
    `</svg>`,
  ].filter(Boolean).join("\n");
}

function saveSvg() {
  const blob = new Blob([buildSvgString()], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = "sine-line-converter.svg";
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

async function copySvg() {
  const svg = buildSvgString();

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(svg);
    } else if (!copyTextFallback(svg)) {
      throw new Error("Clipboard copy is not available.");
    }

    const originalText = controls.copySvgButton.textContent;
    controls.copySvgButton.textContent = "コピーしました";
    window.setTimeout(() => {
      controls.copySvgButton.textContent = originalText;
    }, 1400);
  } catch (error) {
    alert("SVGをクリップボードへコピーできませんでした。ブラウザの権限設定を確認してください。");
  }
}

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
}

function loadImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;

  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(image.src);
    uploadedImage = image;
    loadImageToSource(image);
    renderSineLines();
  };
  image.src = URL.createObjectURL(file);
}

controls.imageInput.addEventListener("change", () => {
  const file = controls.imageInput.files && controls.imageInput.files[0];
  loadImageFile(file);
});

workspace.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (!uploadedImage) {
    workspace.classList.add("is-dragover");
  }
});

workspace.addEventListener("dragleave", (event) => {
  if (!workspace.contains(event.relatedTarget)) {
    workspace.classList.remove("is-dragover");
  }
});

workspace.addEventListener("drop", (event) => {
  event.preventDefault();
  workspace.classList.remove("is-dragover");
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  loadImageFile(file);
});

[
  controls.lineColor,
  controls.backgroundColor,
].forEach((control) => control.addEventListener("input", scheduleRender));

const syncedControls = [
  [controls.lineSpacing, controls.lineSpacingNumber],
  [controls.lineWidth, controls.lineWidthNumber],
  [controls.darkAlpha, controls.darkAlphaNumber],
  [controls.gamma, controls.gammaNumber],
];

const rangeControls = [
  {
    minRange: controls.minAmplitude,
    maxRange: controls.maxAmplitude,
    minNumber: controls.minAmplitudeNumber,
    maxNumber: controls.maxAmplitudeNumber,
    track: rangeTracks.amplitude,
  },
  {
    minRange: controls.minFrequency,
    maxRange: controls.maxFrequency,
    minNumber: controls.minFrequencyNumber,
    maxNumber: controls.maxFrequencyNumber,
    track: rangeTracks.frequency,
  },
];

function syncControl(source, target) {
  const min = Number(target.min);
  const max = Number(target.max);
  const rawValue = Number(source.value);
  const value = Number.isFinite(rawValue) ? clamp(rawValue, min, max) : min;
  source.value = value;
  target.value = value;
  updateSingleRangeTrack(source);
}

function updateSingleRangeTrack(range) {
  const min = Number(range.min);
  const max = Number(range.max);
  const span = max - min;
  const rawPercent = span > 0 ? ((Number(range.value) - min) / span) * 100 : 0;
  const percent = clamp(rawPercent, 0, 100);
  range.style.setProperty("--range-progress", `${percent}%`);
}

function syncRangeControl(pair, changedRole) {
  const minLimit = Number(pair.minRange.min);
  const maxLimit = Number(pair.maxRange.max);
  let minValue = clamp(Number(pair.minRange.value), minLimit, maxLimit);
  let maxValue = clamp(Number(pair.maxRange.value), minLimit, maxLimit);

  if (changedRole === "min") {
    minValue = clamp(Number(pair.minRange.value), minLimit, maxLimit);
    if (minValue > maxValue) maxValue = minValue;
  } else if (changedRole === "max") {
    maxValue = clamp(Number(pair.maxRange.value), minLimit, maxLimit);
    if (maxValue < minValue) minValue = maxValue;
  } else if (minValue > maxValue) {
    maxValue = minValue;
  }

  pair.minRange.value = minValue;
  pair.maxRange.value = maxValue;
  pair.minNumber.value = minValue;
  pair.maxNumber.value = maxValue;
  updateRangeTrack(pair);
}

function syncRangeNumber(pair, changedRole) {
  const minLimit = Number(pair.minNumber.min);
  const maxLimit = Number(pair.maxNumber.max);
  let minValue = Number(pair.minNumber.value);
  let maxValue = Number(pair.maxNumber.value);

  minValue = Number.isFinite(minValue) ? clamp(minValue, minLimit, maxLimit) : minLimit;
  maxValue = Number.isFinite(maxValue) ? clamp(maxValue, minLimit, maxLimit) : maxLimit;

  if (changedRole === "min" && minValue > maxValue) {
    maxValue = minValue;
  }
  if (changedRole === "max" && maxValue < minValue) {
    minValue = maxValue;
  }

  pair.minRange.value = minValue;
  pair.maxRange.value = maxValue;
  pair.minNumber.value = minValue;
  pair.maxNumber.value = maxValue;
  updateRangeTrack(pair);
}

function updateRangeTrack(pair) {
  const minLimit = Number(pair.minRange.min);
  const maxLimit = Number(pair.maxRange.max);
  const span = maxLimit - minLimit;
  const minPercent = ((Number(pair.minRange.value) - minLimit) / span) * 100;
  const maxPercent = ((Number(pair.maxRange.value) - minLimit) / span) * 100;

  pair.track.style.setProperty("--range-start", `${minPercent}%`);
  pair.track.style.setProperty("--range-end", `${maxPercent}%`);
}

syncedControls.forEach(([range, number]) => {
  range.addEventListener("input", () => {
    syncControl(range, number);
    scheduleRender();
  });

  number.addEventListener("input", () => {
    syncControl(number, range);
    scheduleRender();
  });
});

[
  controls.lineSpacing,
  controls.lineWidth,
  controls.darkAlpha,
  controls.gamma,
].forEach(updateSingleRangeTrack);

rangeControls.forEach((pair) => {
  pair.minRange.addEventListener("input", () => {
    syncRangeControl(pair, "min");
    scheduleRender();
  });

  pair.maxRange.addEventListener("input", () => {
    syncRangeControl(pair, "max");
    scheduleRender();
  });

  pair.minNumber.addEventListener("input", () => {
    syncRangeNumber(pair, "min");
    scheduleRender();
  });

  pair.maxNumber.addEventListener("input", () => {
    syncRangeNumber(pair, "max");
    scheduleRender();
  });
});

controls.downloadButton.addEventListener("click", downloadPng);
controls.saveSvgButton.addEventListener("click", saveSvg);
controls.copySvgButton.addEventListener("click", copySvg);

syncedControls.forEach(([range, number]) => syncControl(range, number));
rangeControls.forEach((pair) => syncRangeControl(pair));
updateReadouts();
renderPlaceholder();
