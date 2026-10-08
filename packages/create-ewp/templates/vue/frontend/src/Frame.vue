<script setup>
import { onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { mountFrame } from 'easywindowspack';

const props = defineProps({ title: { type: String, default: 'Desktop App' }, windowStyle: { type: String, default: 'macos' } });
const root = ref(null);
const content = shallowRef(null);
let frame;
onMounted(() => {
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