<script setup>
import { ref } from 'vue';
import Frame from './Frame.vue';

const count = ref(0);
const windowStyle = ref('macos');
const title = document.title;
</script>

<template>
  <Frame :title="title" :window-style="windowStyle">
    <main class="app-view">
      <section class="welcome-card">
        <span class="eyebrow">Vue · JavaScript</span>
        <h1>__EWP_heading__</h1>
        <p class="description">__EWP_description__</p>
        <div class="controls">
          <label>__EWP_windowStyle__
            <select v-model="windowStyle"><option value="macos">macOS</option><option value="windows">Windows</option></select>
          </label>
          <button class="counter" type="button" @click="count++">__EWP_counter__: {{ count }}</button>
        </div>
        <p class="hint">__EWP_hint__</p>
      </section>
    </main>
  </Frame>
</template>