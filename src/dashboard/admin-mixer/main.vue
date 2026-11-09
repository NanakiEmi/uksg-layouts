<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { onMounted, ref, watch } from 'vue';
import { type TopReplicant, topWindow } from '../_misc/top-window';

useHead({ title: 'Master Fader' });

const volume = ref(100);
let rep: TopReplicant<number> | undefined;
let ignoreNext = false;

onMounted(() => {
  try {
    const top = topWindow();
    rep = top?.NodeCG?.Replicant('volume:master', '_sounds');
    if (rep) {
      rep.on('change', (val: number) => {
        ignoreNext = true;
        volume.value = val ?? 100;
      });
    }
  } catch {
    // cross-origin guard
  }
});

watch(volume, (val) => {
  if (ignoreNext) {
    ignoreNext = false;
    return;
  }
  if (rep) {
    rep.value = val;
  }
});
</script>

<template>
  <div>
    <div class="row items-center justify-between q-mb-sm">
      <div class="text-subtitle2">
        Master Volume
      </div>
      <div class="text-h6 text-primary">
        {{ volume }}
      </div>
    </div>
    <QSlider
      v-model="volume"
      :min="0"
      :max="100"
      :step="1"
      color="primary"
      track-color="grey-8"
      thumb-color="primary"
      label
    />
    <div class="row justify-between text-caption text-grey q-mt-xs">
      <span>0</span>
      <span>50</span>
      <span>100</span>
    </div>
  </div>
</template>
