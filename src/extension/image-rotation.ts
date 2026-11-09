import { orderBy } from 'lodash-es';
import { isMet } from './util/bids.js';
import {
  assetsRotationImages,
  imageRotation,
  imageRotationSettings,
  layoutRotation,
  trackerBids,
} from './util/replicants.js';
import { sc } from './util/speedcontrol.js';

// The game layout alternates between images and the current run's incentives.
const layoutImageLength = 40 * 1000;
const layoutBidLength = 20 * 1000;
let lastLayoutBidId: number | null = null;

function normalizeIntervalSeconds(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 60;
  return Math.max(1, Math.floor(value));
}

/**
 * Keeps the image rotation settings in step with the uploaded assets: drops deleted images
 * and appends new ones (enabled, in order of file name) after the ones already ordered.
 */
function normalizeSettings() {
  const settings = imageRotationSettings.value ?? { intervalSeconds: 60, items: [] };
  const assets = orderBy(assetsRotationImages.value ?? [], (a) => a.name, 'asc');
  const assetSums = new Set(assets.map((asset) => asset.sum));
  const items = Array.isArray(settings.items) ? settings.items : [];

  const kept = items
    .filter((item) => assetSums.has(item.sum))
    .map((item) => ({
      sum: item.sum,
      enabled: item.enabled !== false,
    }));

  const seenSums = new Set(kept.map((item) => item.sum));
  for (const asset of assets) {
    if (!seenSums.has(asset.sum)) {
      kept.push({ sum: asset.sum, enabled: true });
      seenSums.add(asset.sum);
    }
  }

  const normalized = {
    intervalSeconds: normalizeIntervalSeconds(settings.intervalSeconds),
    items: kept,
  };

  const changed
    = normalized.intervalSeconds !== settings.intervalSeconds
      || normalized.items.length !== items.length
      || normalized.items.some((item, index) => item.sum !== items[index]?.sum || item.enabled !== items[index]?.enabled);

  return { normalized, changed };
}

/**
 * Images that are uploaded and switched on, in rotation order.
 */
function enabledImages() {
  const { normalized, changed } = normalizeSettings();
  if (changed) {
    imageRotationSettings.value = normalized;
  }
  return { enabled: normalized.items.filter((item) => item.enabled), settings: normalized };
}

function update() {
  const { enabled, settings } = enabledImages();
  if (!enabled.length) {
    // Remove rotation if no images are available.
    imageRotation.value = null;
    return;
  }

  const currentSum = imageRotation.value?.sum;
  const currentIndex = enabled.findIndex((item) => item.sum === currentSum);
  const intervalMs = settings.intervalSeconds * 1000;
  const now = Date.now();

  // If there is no valid active image, reset to first enabled.
  if (!imageRotation.value || currentIndex < 0) {
    imageRotation.value = {
      sum: enabled[0].sum,
      startTimestamp: now,
    };
    return;
  }

  // If the current image has been visible for the interval.
  if ((now - imageRotation.value.startTimestamp) >= intervalMs) {
    const nextIndex = (currentIndex + 1) % enabled.length;
    imageRotation.value = {
      sum: enabled[nextIndex].sum,
      startTimestamp: now,
    };
  }
}

function updateLayout() {
  const runId = sc.runDataActiveRun.value?.id;
  const bids = trackerBids.value
    .filter((b) => runId && b.runId === runId && !isMet(b))
    .filter((b) => b.type === 'challenge' || b.options.length);
  const { bidId, startTimestamp } = layoutRotation.value;
  const elapsed = Date.now() - startTimestamp;
  const hasImages = enabledImages().enabled.length > 0;
  const nextBid = () => {
    const bid = bids[(bids.findIndex((b) => b.id === lastLayoutBidId) + 1) % bids.length];
    lastLayoutBidId = bid.id;
    layoutRotation.value = { bidId: bid.id, startTimestamp: Date.now() };
  };
  if (!bids.length) {
    if (bidId !== null) layoutRotation.value = { bidId: null, startTimestamp: Date.now() };
  } else if (bidId !== null && !bids.some((b) => b.id === bidId)) {
    // Shown bid is no longer available.
    if (hasImages) layoutRotation.value = { bidId: null, startTimestamp: Date.now() };
    else nextBid();
  } else if (bidId === null && (elapsed >= layoutImageLength || !hasImages)) {
    nextBid();
  } else if (bidId !== null && elapsed >= layoutBidLength) {
    // If there's no images, just keep cycling through the bids.
    if (hasImages) layoutRotation.value = { bidId: null, startTimestamp: Date.now() };
    else nextBid();
  }
}

update();
updateLayout();
setInterval(() => {
  update();
  updateLayout();
}, 1000);
