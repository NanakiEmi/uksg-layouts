<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { onMounted, ref } from 'vue';
import { topWindow } from '../_misc/top-window';

useHead({ title: 'UKSG Graphics' });

interface GraphicInstance {
  bundleName: string;
  pathName: string;
  title?: string;
  url: string;
}

const instances = ref<GraphicInstance[]>([]);
const reloading = ref<Record<string, boolean>>({});
const reloadingAll = ref(false);
const status = ref('');

function loadInstances() {
  try {
    const top = topWindow();
    const rep = top?.NodeCG?.Replicant<GraphicInstance[]>('graphics:instances', 'nodecg');
    if (rep) {
      rep.on('change', (val: GraphicInstance[]) => {
        instances.value = (val ?? []).filter((i) => i.bundleName === 'uksg-layouts');
      });
    }
  } catch {
    // cross-origin guard
  }
}

onMounted(loadInstances);

function reloadInstance(instance: GraphicInstance) {
  const key = instance.url;
  reloading.value[key] = true;
  status.value = '';
  try {
    const top = topWindow();
    top?.socket?.emit('graphic:requestRefresh', instance, () => {
      reloading.value[key] = false;
      status.value = `Reloaded ${instance.pathName}`;
    });
  } catch {
    reloading.value[key] = false;
  }
}

function reloadAll() {
  reloadingAll.value = true;
  status.value = '';
  try {
    const top = topWindow();
    top?.socket?.emit('graphic:requestBundleRefresh', 'uksg-layouts', () => {
      reloadingAll.value = false;
      status.value = 'All graphics reloaded';
    });
  } catch {
    reloadingAll.value = false;
  }
}
</script>

<template>
  <div>
    <div class="row justify-between items-center q-mb-sm">
      <div class="text-subtitle2">
        UKSG Graphics Instances
      </div>
      <QBtn
        color="primary"
        size="sm"
        unelevated
        :loading="reloadingAll"
        @click="reloadAll"
      >
        Reload All
      </QBtn>
    </div>
    <QList
      dense
      bordered
      separator
    >
      <QItem
        v-for="inst in instances"
        :key="inst.url"
      >
        <QItemSection>
          <QItemLabel>{{ inst.pathName }}</QItemLabel>
        </QItemSection>
        <QItemSection side>
          <QBtn
            flat
            size="sm"
            icon="refresh"
            :loading="reloading[inst.url]"
            @click="reloadInstance(inst)"
          />
        </QItemSection>
      </QItem>
      <QItem v-if="instances.length === 0">
        <QItemSection class="text-grey">
          No running graphic instances found.
        </QItemSection>
      </QItem>
    </QList>
    <div
      v-if="status"
      class="q-mt-sm text-positive text-caption"
    >
      {{ status }}
    </div>
  </div>
</template>
