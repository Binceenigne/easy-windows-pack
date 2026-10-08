(function (global) {
  'use strict';
  global.createDesktopUpdateClient = function ({host, bridge = () => global.pywebview?.api,
    onState = () => {}, onError = () => {}}) {
    if (!['api-tools', 'turtleclaw'].includes(host)) throw new TypeError('Unknown update host');
    let disposed = false, timer, fetching = false, attaching = false, attached = false, acknowledged = false, checked = false;
    let startup = false, prereleases = false, state = {};
    async function invoke(name, ...args) {
      if (disposed) throw new Error('Update client disposed');
      const api = bridge();
      if (typeof api?.[name] !== 'function') throw new Error(`Unsupported desktop method: ${name}`);
      const value = await api[name](...args);
      if (value?.ok === false) throw new Error(value.error || 'Desktop operation failed');
      return value;
    }
    async function refresh() {
      if (disposed || fetching) return;
      fetching = true;
      try {
        const value = await invoke(host === 'turtleclaw' ? 'get_update_state' : 'get_state');
        if (!disposed) { state = host === 'turtleclaw' ? value : value.update; onState(state); }
      } finally { fetching = false; }
    }
    function schedule() {
      clearTimeout(timer);
      if (!disposed && attached) timer = setTimeout(async () => {
        try { await refresh(); } catch (error) { if (!disposed) onError(error); }
        schedule();
      }, ['checking', 'downloading', 'installing'].includes(state?.status) ? 500 : 4000);
    }
    async function call(name, ...args) { const value = await invoke(name, ...args); await refresh(); schedule(); return value; }
    async function attach() {
      if (disposed || attaching || !attached || !bridge()) return;
      attaching = true;
      try {
        await refresh();
        if (disposed) return;
        if (host === 'turtleclaw' && !acknowledged) { await invoke('confirm_update_ready'); acknowledged = true; }
        if (startup && !checked) { checked = true; await call('check_for_updates', ...(host === 'turtleclaw' ? [prereleases] : [])); }
      } catch (error) { if (!disposed) onError(error); }
      finally { attaching = false; }
      schedule();
    }
    global.addEventListener('pywebviewready', attach);
    return {
      refresh,
      async markFrontendReady(options = {}) {
        startup = options.checkOnStartup === true; prereleases = options.includePrereleases === true;
        attached = true; await attach();
      },
      check: (includePrereleases = false) => call('check_for_updates', ...(host === 'turtleclaw' ? [includePrereleases] : [])),
      download: () => call('download_update'),
      cancel: () => call('cancel_update_download'),
      install: token => call(host === 'turtleclaw' ? 'install_update' : 'restart_update', ...(host === 'turtleclaw' ? [token] : [])),
      restart: () => invoke('restart_app'),
      dispose() { disposed = true; clearTimeout(timer); global.removeEventListener('pywebviewready', attach); }
    };
  };
})(window);