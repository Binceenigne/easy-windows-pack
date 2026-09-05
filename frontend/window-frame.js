(() => {
    'use strict';

    const MODES = new Set(['native', 'default', 'minimal']);
    const DIRECTIONS = new Set([
        'left', 'right', 'top', 'bottom',
        'top-left', 'top-right', 'bottom-left', 'bottom-right'
    ]);

    function getApi() {
        return window.pywebview?.api || null;
    }

    async function callApi(method, ...args) {
        const api = getApi();
        if (!api || typeof api[method] !== 'function') {
            return { ok: false, error: 'pywebview API is not ready' };
        }
        try {
            return await api[method](...args);
        } catch (error) {
            return { ok: false, error: error?.message || String(error) };
        }
    }

    function normalizeMode(mode) {
        return MODES.has(mode) ? mode : 'default';
    }

    function setMaximizeGlyph(frame, maximized) {
        const glyph = frame.querySelector('[data-ewp-maximize-glyph]');
        if (!glyph) return;
        glyph.classList.toggle('ewp-glyph-maximize', !maximized);
        glyph.classList.toggle('ewp-glyph-restore', maximized);
        const button = glyph.closest('button');
        if (button) {
            const label = maximized ? 'Restore' : 'Maximize';
            button.title = label;
            button.setAttribute('aria-label', label);
        }
    }

    function applyState(frame, state = {}) {
        const maximized = state.maximized === true;
        const mode = normalizeMode(state.titleBarMode || frame.dataset.titlebarMode);
        frame.dataset.titlebarMode = mode;
        if (typeof state.resizable === 'boolean') {
            frame.dataset.resizable = String(state.resizable);
        }
        frame.classList.toggle('ewp-window-maximized', maximized);
        setMaximizeGlyph(frame, maximized);
    }

    function beginNativeOperation(direction) {
        return callApi('native_drag', direction);
    }

    function bindFrame(frame, options = {}) {
        if (!frame || frame.dataset.ewpBound === 'true') return frame;
        frame.dataset.ewpBound = 'true';
        const mode = normalizeMode(options.mode || frame.dataset.titlebarMode);
        frame.dataset.titlebarMode = mode;

        if (options.title) {
            const title = frame.querySelector('[data-ewp-title]');
            if (title) title.textContent = options.title;
        }
        if (options.icon) {
            const icon = frame.querySelector('[data-ewp-icon]');
            if (icon) {
                icon.src = options.icon;
                icon.style.display = 'block';
            }
        }
        const content = frame.querySelector('[data-ewp-content]');
        if (content && options.content) content.append(options.content);

        frame.querySelectorAll('[data-ewp-action]').forEach(button => {
            button.addEventListener('click', async event => {
                event.stopPropagation();
                const action = button.dataset.ewpAction;
                const result = await callApi('window_action', action);
                if (!result.ok && typeof options.onError === 'function') options.onError(result);
                if (action === 'maximize' && result.ok) applyState(frame, result);
            });
        });

        frame.querySelectorAll('[data-ewp-resize]').forEach(handle => {
            handle.addEventListener('mousedown', event => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                void beginNativeOperation(handle.dataset.ewpResize);
            });
        });

        const dragHandle = frame.querySelector('[data-ewp-drag-handle]');
        dragHandle?.addEventListener('mousedown', event => {
            if (event.button !== 0 || event.target.closest('button, input, select, textarea, a')) return;
            event.preventDefault();
            void beginNativeOperation('move').then(result => {
                if (result?.ok) applyState(frame, result);
                if (!result?.ok && typeof options.onError === 'function') options.onError(result);
            });
        });

        applyState(frame, { titleBarMode: mode });
        return frame;
    }

    window.easyWindowsPackApplyState = state => {
        document.querySelectorAll('[data-ewp-window-frame]').forEach(frame => applyState(frame, state));
    };

    window.easyWindowsPackSetTitleBarMode = mode => {
        const normalized = normalizeMode(mode);
        document.querySelectorAll('[data-ewp-window-frame]').forEach(frame => {
            frame.dataset.titlebarMode = normalized;
            applyState(frame, { titleBarMode: normalized });
        });
    };

    window.easyWindowsPack = {
        bind: bindFrame,
        call: callApi,
        setTitleBarMode(mode) {
            return callApi('set_titlebar_mode', normalizeMode(mode));
        },
        isSupportedResizeDirection(direction) {
            return DIRECTIONS.has(direction);
        }
    };

    document.querySelectorAll('[data-ewp-window-frame]').forEach(frame => bindFrame(frame));
})();
