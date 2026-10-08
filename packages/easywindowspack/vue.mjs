import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { mountFrame } from './index.mjs';

export const WindowFrame = defineComponent({
  name: 'EasyWindowFrame',
  inheritAttrs: false,
  props: {
    title: String, icon: String, mode: String, windowStyle: String,
    resizable: { type: Boolean, default: true }
  },
  emits: ['error'],
  setup(props, { slots, attrs, emit, expose }) {
    const host = ref(null);
    const content = ref(null);
    let instance;
    const options = () => ({ ...props, onError: result => emit('error', result) });
    onMounted(() => { instance = mountFrame(host.value, { ...options(), content: content.value }); });
    watch(() => ({ ...props }), () => instance?.update(options()));
    onBeforeUnmount(() => instance?.dispose());
    expose({ get frame() { return instance?.frame; } });
    return () => h('div', { ...attrs, ref: host }, [h('div', { ref: content }, slots.default?.())]);
  }
});

export default WindowFrame;