<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { mountFrame } from 'easywindowspack';
import type { MountedFrame } from 'easywindowspack';

const props = withDefaults(defineProps<{ title?: string; windowStyle?: 'macos' | 'windows' }>(), { title: 'Desktop App', windowStyle: 'macos' });
const root = ref<HTMLDivElement | null>(null);
const content = shallowRef<HTMLElement | null>(null);
let frame: MountedFrame | undefined;
onMounted(() => {
  if (!root.value) return;
  frame = mountFrame(root.value, { title: props.title, windowStyle: props.windowStyle });
  content.value = frame.content;
});
watch(() => [props.title, props.windowStyle], () => frame?.update({ title: props.title, windowStyle: props.windowStyle }));
onBeforeUnmount(() => { frame?.dispose(); });
</script>

<template>
  <div ref="root" class="desktop-frame"></div>
  <Teleport v-if="content" :to="content"><slot /></Teleport>
</template>