<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { computed, onMounted, ref } from 'vue';
import { type TopReplicant, topWindow } from '../_misc/top-window';

useHead({ title: 'Rotation Images' });

interface AssetFile {
  sum: string;
  name: string;
  ext: string;
  url: string;
}

interface RotationItem {
  sum: string;
  enabled: boolean;
}

interface RotationSettings {
  intervalSeconds: number;
  items: RotationItem[];
}

const assets = ref<AssetFile[]>([]);
const settings = ref<RotationSettings>({ intervalSeconds: 60, items: [] });
const uploading = ref(false);
const deleting = ref<Record<string, boolean>>({});
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFiles = ref<FileList | null>(null);
const statusMsg = ref('');
const draggingSum = ref<string | null>(null);

let assetsRep: TopReplicant<AssetFile[]> | undefined;
let settingsRep: TopReplicant<RotationSettings> | undefined;

const orderedAssets = computed(() => {
  const bySum = new Map(assets.value.map((asset) => [asset.sum, asset]));
  const ordered: AssetFile[] = [];
  const seen = new Set<string>();

  for (const item of settings.value.items) {
    const asset = bySum.get(item.sum);
    if (asset) {
      ordered.push(asset);
      seen.add(item.sum);
    }
  }

  for (const asset of [...assets.value].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!seen.has(asset.sum)) {
      ordered.push(asset);
    }
  }

  return ordered;
});

const intervalSecondsModel = computed<number>({
  get: () => settings.value.intervalSeconds,
  set: (value) => setIntervalSeconds(Number(value)),
});

function normalizeSettings(raw: RotationSettings | null | undefined): RotationSettings {
  const source = raw ?? { intervalSeconds: 60, items: [] };
  return {
    intervalSeconds: normalizeInterval(source.intervalSeconds),
    items: Array.isArray(source.items)
      ? source.items.map((item) => ({
          sum: item.sum,
          enabled: item.enabled !== false,
        }))
      : [],
  };
}

function normalizeInterval(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 60;
  return Math.max(1, Math.floor(value));
}

function isSameSettings(a: RotationSettings, b: RotationSettings) {
  return a.intervalSeconds === b.intervalSeconds
    && a.items.length === b.items.length
    && a.items.every((item, i) => item.sum === b.items[i]?.sum && item.enabled === b.items[i]?.enabled);
}

function reconcileSettingsWithAssets() {
  if (!settingsRep) return;
  const normalized = normalizeSettings(settings.value);
  const assetSums = new Set(assets.value.map((asset) => asset.sum));

  const kept = normalized.items.filter((item) => assetSums.has(item.sum));
  const seen = new Set(kept.map((item) => item.sum));
  const byName = [...assets.value].sort((a, b) => a.name.localeCompare(b.name));
  for (const asset of byName) {
    if (!seen.has(asset.sum)) {
      kept.push({ sum: asset.sum, enabled: true });
      seen.add(asset.sum);
    }
  }

  const next: RotationSettings = {
    intervalSeconds: normalized.intervalSeconds,
    items: kept,
  };

  settings.value = next;
  if (!isSameSettings(next, normalizeSettings(settingsRep.value))) {
    settingsRep.value = next;
  }
}

onMounted(() => {
  try {
    const top = topWindow();
    assetsRep = top?.NodeCG?.Replicant('assets:rotation-images', 'uksg-layouts');
    settingsRep = top?.NodeCG?.Replicant('imageRotationSettings', 'uksg-layouts');
    if (assetsRep) {
      assetsRep.on('change', (nextAssets: AssetFile[]) => {
        assets.value = nextAssets ?? [];
        reconcileSettingsWithAssets();
      });
    }
    if (settingsRep) {
      settingsRep.on('change', (nextSettings: RotationSettings) => {
        settings.value = normalizeSettings(nextSettings);
        reconcileSettingsWithAssets();
      });
    }
  } catch {
    // cross-origin guard
  }
});

function onFileChange(e: Event) {
  selectedFiles.value = (e.target as HTMLInputElement).files;
}

async function uploadFiles() {
  if (!selectedFiles.value?.length) return;
  uploading.value = true;
  statusMsg.value = '';
  try {
    for (const file of Array.from(selectedFiles.value)) {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/assets/uksg-layouts/rotation-images', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
    }
    statusMsg.value = 'Upload complete';
    if (fileInput.value) fileInput.value.value = '';
    selectedFiles.value = null;
  } catch (err) {
    statusMsg.value = `Error: ${(err as Error).message}`;
  } finally {
    uploading.value = false;
  }
}

function setIntervalSeconds(value: number) {
  if (!settingsRep) return;
  const next = {
    ...settings.value,
    intervalSeconds: normalizeInterval(value),
  };
  settings.value = next;
  settingsRep.value = next;
}

function isEnabled(sum: string) {
  return settings.value.items.find((item) => item.sum === sum)?.enabled ?? true;
}

function setEnabled(sum: string, enabled: boolean) {
  if (!settingsRep) return;
  let found = false;
  const nextItems = settings.value.items.map((item) => {
    if (item.sum === sum) {
      found = true;
      return { ...item, enabled };
    }
    return item;
  });
  if (!found) {
    nextItems.push({ sum, enabled });
  }
  const next = {
    ...settings.value,
    items: nextItems,
  };
  settings.value = next;
  settingsRep.value = next;
}

function moveSum(draggedSum: string, targetSum: string) {
  if (!settingsRep || draggedSum === targetSum) return;
  const enabledBySum = new Map(settings.value.items.map((item) => [item.sum, item.enabled]));
  const sums = orderedAssets.value.map((asset) => asset.sum);
  const from = sums.indexOf(draggedSum);
  const to = sums.indexOf(targetSum);
  if (from < 0 || to < 0) return;

  sums.splice(to, 0, sums.splice(from, 1)[0]);
  const nextItems = sums.map((sum) => ({
    sum,
    enabled: enabledBySum.get(sum) ?? true,
  }));

  const next = {
    ...settings.value,
    items: nextItems,
  };
  settings.value = next;
  settingsRep.value = next;
}

function onDragStart(sum: string, event: DragEvent) {
  draggingSum.value = sum;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function onDrop(targetSum: string, event: DragEvent) {
  event.preventDefault();
  if (draggingSum.value) {
    moveSum(draggingSum.value, targetSum);
  }
  draggingSum.value = null;
}

function onDragEnd() {
  draggingSum.value = null;
}

async function deleteAsset(asset: AssetFile) {
  const key = asset.sum;
  deleting.value[key] = true;
  statusMsg.value = '';
  try {
    const res = await fetch(`/assets/uksg-layouts/rotation-images/${asset.sum}.${asset.ext}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Delete failed: ${res.statusText}`);
    statusMsg.value = `Deleted ${asset.name}`;
  } catch (err) {
    statusMsg.value = `Error: ${(err as Error).message}`;
  } finally {
    deleting.value[key] = false;
  }
}
</script>

<template>
  <div>
    <div class="text-subtitle2 q-mb-sm">
      Rotation Images
    </div>

    <QInput
      v-model.number="intervalSecondsModel"
      class="q-mb-md"
      type="number"
      min="1"
      dense
      outlined
      label="Interval (seconds)"
    />

    <QList
      dense
      bordered
      separator
      class="q-mb-md"
    >
      <QItem
        v-for="asset in orderedAssets"
        :key="asset.sum"
        draggable="true"
        @dragstart="onDragStart(asset.sum, $event)"
        @dragover="onDragOver"
        @drop="onDrop(asset.sum, $event)"
        @dragend="onDragEnd"
      >
        <QItemSection
          side
          class="text-grey-5"
        >
          <QIcon name="drag_indicator" />
        </QItemSection>
        <QItemSection>
          <QItemLabel>{{ asset.name }}.{{ asset.ext }}</QItemLabel>
        </QItemSection>
        <QItemSection side>
          <QToggle
            size="sm"
            color="positive"
            checked-icon="play_arrow"
            unchecked-icon="pause"
            :model-value="isEnabled(asset.sum)"
            @update:model-value="setEnabled(asset.sum, Boolean($event))"
          />
        </QItemSection>
        <QItemSection side>
          <QBtn
            flat
            size="sm"
            icon="delete"
            color="negative"
            :loading="deleting[asset.sum]"
            @click="deleteAsset(asset)"
          />
        </QItemSection>
      </QItem>
      <QItem v-if="orderedAssets.length === 0">
        <QItemSection class="text-grey">
          No images in this category.
        </QItemSection>
      </QItem>
    </QList>

    <div class="text-caption text-grey q-mb-xs">
      Upload new images
    </div>
    <input
      ref="fileInput"
      type="file"
      multiple
      accept=".jpg,.jpeg,.png,.svg,.webp,.gif"
      class="q-mb-sm"
      style="width:100%;color:inherit"
      @change="onFileChange"
    >
    <QBtn
      class="full-width"
      color="primary"
      unelevated
      square
      :loading="uploading"
      :disable="!selectedFiles?.length"
      @click="uploadFiles"
    >
      Upload
    </QBtn>
    <div
      v-if="statusMsg"
      class="q-mt-sm text-caption"
      :class="statusMsg.startsWith('Error') ? 'text-negative' : 'text-positive'"
    >
      {{ statusMsg }}
    </div>
  </div>
</template>
