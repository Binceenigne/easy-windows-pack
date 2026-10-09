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
        <h1>Your next desktop app.</h1>
        <p class="description">从一个轻量窗口开始。<br />Build something that feels at home on your desktop.</p>
        <div class="controls">
          <label>窗口外观 / Window style
            <select v-model="windowStyle"><option value="macos">macOS</option><option value="windows">Windows</option></select>
          </label>
          <button class="counter" type="button" @click="count++">Count: {{ count }}</button>
        </div>
        <p class="hint">Vue slot 在共享窗口内容区内保持响应式。<br />Native window controls work in the desktop host.</p>
      </section>
    </main>
  </Frame>
</template>