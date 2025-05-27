import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {ModalDialog} from 'resource:///org/gnome/shell/ui/modalDialog.js';
import Clutter from 'gi://Clutter';

export default class ResizerableExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        console.log("ResizerableExtension: CONSTRUCTOR CALLED - Top");
        this._settings = null;
        this._maximizeBinding = null;
        this._resizeBinding = null;
        this._originalMinimize = null;
        this._smartMinimizeSignalId = null;
        this._settingsConnections = [];
        this._focusWindowNotifyMinimizedSignalId = null;
        this._cachedFocusWindow = null;
        this._windowSignalIds = new Map();
        this._windowAddedSignalId = null;
        this._windowRemovedSignalId = null;
        console.log("ResizerableExtension: CONSTRUCTOR CALLED - Bottom");
    }

    _resizeWindowToMargins(window) {
        if (!window || !this._settings) {
            console.error("ResizerableExtension: _resizeWindowToMargins - Invalid window or settings.");
            return;
        }

        const monitorIndex = window.get_monitor();
        const monitor = Main.layoutManager.monitors[monitorIndex];
        
        if (!monitor) {
            console.error("ResizerableExtension: _resizeWindowToMargins - Could not get monitor for window.");
            return;
        }

        const marginLeft = this._settings.get_double('margin-left');
        const marginRight = this._settings.get_double('margin-right');
        const marginTop = this._settings.get_double('margin-top');
        const marginBottom = this._settings.get_double('margin-bottom');

        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        
        const newX = workArea.x + Math.round(workArea.width * marginLeft);
        const newY = workArea.y + Math.round(workArea.height * marginTop);
        let newWidth = Math.round(workArea.width * (1 - marginLeft - marginRight));
        let newHeight = Math.round(workArea.height * (1 - marginTop - marginBottom));

        // Ensure minimum window size (e.g., 100x100)
        newWidth = Math.max(newWidth, 100);
        newHeight = Math.max(newHeight, 100);

        if (window.get_maximized()) {
            window.unmaximize(Meta.MaximizeFlags.BOTH);
        }

        console.log(`ResizerableExtension: Resizing window '${window.get_title()}' to margins: X=${newX}, Y=${newY}, W=${newWidth}, H=${newHeight}`);
        window.move_resize_frame(true, newX, newY, newWidth, newHeight); // Pass true for user_op
    }

    _onWindowMinimizedStateChanged(window) {
        let windowTitle = "Unknown Window";
        try { windowTitle = window.get_title(); } catch(e) { /* Ignore */ }

        if (window.minimized) { 
            console.log(`ResizerableExtension: Window '${windowTitle}' is NOW MINIMIZED.`);
            if (this._settings && this._settings.get_boolean('smart-minimize')) {
                console.log("ResizerableExtension: Smart Minimize is ON. Evaluating resize conditions...");

                const currentRect = window.get_frame_rect(); // Gets dimensions before full minimization (hopefully)
                const currentWidth = currentRect.width;
                const currentHeight = currentRect.height;
                const currentArea = currentWidth * currentHeight;

                const monitorIndex = window.get_monitor();
                const monitor = Main.layoutManager.monitors[monitorIndex];

                if (!monitor) {
                    console.warn("ResizerableExtension: Could not get monitor for smart minimize, allowing normal minimize.");
                    return; // Let it stay minimized
                }

                const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
                const marginLeft = this._settings.get_double('margin-left');
                const marginRight = this._settings.get_double('margin-right');
                const marginTop = this._settings.get_double('margin-top');
                const marginBottom = this._settings.get_double('margin-bottom');

                let targetWidth = Math.round(workArea.width * (1 - marginLeft - marginRight));
                let targetHeight = Math.round(workArea.height * (1 - marginTop - marginBottom));
                targetWidth = Math.max(targetWidth, 100); // Min width
                targetHeight = Math.max(targetHeight, 100); // Min height
                const targetArea = targetWidth * targetHeight;

                console.log(`ResizerableExtension: Current window area: ${currentArea} (${currentWidth}x${currentHeight}). Target margin area: ${targetArea} (${targetWidth}x${targetHeight}).`);

                if (currentArea > targetArea) {
                    console.log("ResizerableExtension: Current area > target. Applying smart resize instead of minimize.");
                    window.unminimize(global.get_current_time());
                    // It might be necessary to wait briefly for unminimize to complete before resizing.
                    // GLib.timeout_add(0, Priority.DEFAULT, () => { this._resizeWindowToMargins(window); return GLib.SOURCE_REMOVE; });
                    // For now, try direct call:
                    this._resizeWindowToMargins(window);
                } else {
                    console.log("ResizerableExtension: Current area <= target. Allowing normal minimize.");
                    // Window is already minimized, do nothing to keep it that way.
                }
            }
        } else {
            console.log(`ResizerableExtension: Window '${windowTitle}' is NOW UNMINIMIZED.`);
        }
    }

    _connectToWindowSignals(window) {
        if (!window || typeof window.connect !== 'function' || this._windowSignalIds.has(window.get_id())) {
            if (this._windowSignalIds.has(window.get_id())) {
                // console.log(`ResizerableExtension: Already connected to 'notify::minimized' for window '${window.get_title()}'.`);
            } else {
                console.warn(`ResizerableExtension: Attempted to connect to invalid or already processed window object for title '${window ? window.get_title() : 'N/A'}'.`);
            }
            return;
        }
        let windowTitle = "Unknown";
        try { windowTitle = window.get_title(); } catch(e) { console.warn("Err getting title in _connect", e); }

        console.log(`ResizerableExtension: Attempting to connect 'notify::minimized' for window '${windowTitle}' (ID: ${window.get_id()})`);
        try {
            const id = window.connect('notify::minimized', () => this._onWindowMinimizedStateChanged(window));
            if (id > 0) {
                console.log(`ResizerableExtension: SUCCESSFULLY connected 'notify::minimized' for '${windowTitle}' (Sig ID: ${id})`);
                this._windowSignalIds.set(window.get_id(), { windowObj: window, signalId: id });
            } else {
                console.error(`ResizerableExtension: FAILED to connect 'notify::minimized' for '${windowTitle}' (ret: ${id})`);
            }
        } catch (e) {
            console.error(`ResizerableExtension: EXCEPTION while connecting 'notify::minimized' for '${windowTitle}':`, e);
        }
    }

    _disconnectFromWindowSignals(windowId) {
        if (this._windowSignalIds.has(windowId)) {
            const { windowObj, signalId } = this._windowSignalIds.get(windowId);
            let windowTitle = "Unknown";
            try { windowTitle = windowObj.get_title(); } catch(e) { console.warn("Err getting title in _disconnect", e); }
            console.log(`ResizerableExtension: Disconnecting 'notify::minimized' for window '${windowTitle}'`);
            try {
                 windowObj.disconnect(signalId);
            } catch (e) {
                console.error(`ResizerableExtension: EXCEPTION while disconnecting 'notify::minimized' for '${windowTitle}':`, e);
            }
            this._windowSignalIds.delete(windowId);
        }
    }

    enable() {
        console.log("ResizerableExtension: ENABLE CALLED - Top");
        this._settings = this.getSettings();
        if (!this._settings) {
            console.error("ResizerableExtension: FAILED TO GET SETTINGS IN ENABLE! Cannot proceed.");
            return;
        }
        console.log("ResizerableExtension: Settings initialized.");

        this._settingsConnections = [
            this._settings.connect('changed::key-maximize', () => this._syncKeybindings()),
            this._settings.connect('changed::key-resize', () => this._resizeWindow())
        ];
        this._syncKeybindings();
        console.log("ResizerableExtension: Keybindings synced.");

        this._smartMinimizeSignalId = this._settings.connect('changed::smart-minimize', () => {
            const currentSmartMinimizeSetting = this._settings.get_boolean('smart-minimize');
            console.log(`ResizerableExtension: 'smart-minimize' setting CHANGED to: ${currentSmartMinimizeSetting}`);
        });
        console.log("ResizerableExtension: 'smart-minimize' signal connected.");

        console.log("ResizerableExtension: Connecting to window signals...");
        let windowActors = global.get_window_actors();
        console.log(`ResizerableExtension: Found ${windowActors.length} existing window actors.`);
        windowActors.forEach(actor => {
            if (actor) {
                const metaWindow = actor.get_meta_window();
                if (metaWindow) {
                    this._connectToWindowSignals(metaWindow);
                } else {
                     console.warn("ResizerableExtension: Actor in existing list did not provide a MetaWindow.");
                }
            }
        });

        console.log("ResizerableExtension: Attempting to connect for NEW windows...");
        // Try workspace or screen window-tracking signals for new windows
        // global.display.connect('window-created', ...) is another option if 'window-added' on screen/workspace isn't ideal
        // For now, using global.screen, but if it failed, we need an alternative.
        // The previous log showed global.screen was undefined. Default to global.display if so.
        const displaySource = global.screen || global.display;
        if (displaySource && typeof displaySource.connect === 'function') {
            console.log(`ResizerableExtension: Using ${global.screen ? 'global.screen' : 'global.display'} to connect 'window-added'.`);
            try {
                this._windowAddedSignalId = displaySource.connect('window-added', (source, window) => {
                    let windowTitle = "Unknown (newly added)";
                    try { windowTitle = window.get_title(); } catch(e) { console.warn("Err getting title for new window", e); }
                    console.log(`ResizerableExtension: 'window-added' signal: New window '${windowTitle}'`);
                    this._connectToWindowSignals(window);
                });
                if (this._windowAddedSignalId > 0) {
                     console.log(`ResizerableExtension: SUCCESSFULLY connected to 'window-added' (Signal ID: ${this._windowAddedSignalId}).`);
                } else {
                    console.error(`ResizerableExtension: FAILED to connect 'window-added' (ret non-positive: ${this._windowAddedSignalId}).`);
                }
            } catch (e) {
                console.error("ResizerableExtension: EXCEPTION while connecting to 'window-added':", e);
            }
        } else {
            console.error("ResizerableExtension: Neither global.screen nor global.display valid for 'window-added'. New windows won't be tracked.");
        }

        // Track window destruction to clean up signals
        if (displaySource && typeof displaySource.connect === 'function') {
            console.log(`ResizerableExtension: Using ${global.screen ? 'global.screen' : 'global.display'} to connect 'window-removed'.`);
            try {
                this._windowRemovedSignalId = displaySource.connect('window-removed', (source, window) => {
                     let windowTitle = "Unknown (removed)";
                    try { windowTitle = window.get_title(); } catch(e) { /* Might already be destroyed */ }
                    console.log(`ResizerableExtension: 'window-removed' signal: Window '${windowTitle}' (ID: ${window.get_id()})`);
                    this._disconnectFromWindowSignals(window.get_id());
                });
                 if (this._windowRemovedSignalId > 0) {
                     console.log(`ResizerableExtension: SUCCESSFULLY connected to 'window-removed' (Signal ID: ${this._windowRemovedSignalId}).`);
                } else {
                    console.error(`ResizerableExtension: FAILED to connect 'window-removed' (ret non-positive: ${this._windowRemovedSignalId}).`);
                }
            } catch (e) {
                console.error("ResizerableExtension: EXCEPTION while connecting to 'window-removed':", e);
            }
        } else {
            console.error("ResizerableExtension: Display source invalid for 'window-removed'. Window signal cleanup might be incomplete.");
        }
        console.log("ResizerableExtension: ENABLE method finished.");
    }

    disable() {
        console.log("ResizerableExtension: DISABLE CALLED - Top");
        if (this._settingsConnections) {
            this._settingsConnections.forEach(id => {
                if (this._settings) { this._settings.disconnect(id); }
            });
            this._settingsConnections = null;
        }
        console.log("ResizerableExtension: Settings connections disconnected.");

        if (this._smartMinimizeSignalId) {
            if (this._settings) { this._settings.disconnect(this._smartMinimizeSignalId); }
            this._smartMinimizeSignalId = null;
        }
        console.log("ResizerableExtension: Smart minimize signal disconnected.");
        
        this._removeKeybindings();
        console.log("ResizerableExtension: Keybindings removed.");

        console.log("ResizerableExtension: Disconnecting from all window signals...");
        for (const windowId of this._windowSignalIds.keys()) {
            this._disconnectFromWindowSignals(windowId);
        }
        this._windowSignalIds.clear();
        console.log("ResizerableExtension: notify::minimized signals disconnected.");

        const displaySource = global.screen || global.display;
        if (this._windowAddedSignalId && displaySource) {
            console.log("ResizerableExtension: Disconnecting 'window-added' signal.");
            displaySource.disconnect(this._windowAddedSignalId);
        }
        this._windowAddedSignalId = null;
        console.log("ResizerableExtension: window-added signal disconnected.");

        if (this._windowRemovedSignalId && displaySource) {
            console.log("ResizerableExtension: Disconnecting 'window-removed' signal.");
            displaySource.disconnect(this._windowRemovedSignalId);
        }
        this._windowRemovedSignalId = null;
        console.log("ResizerableExtension: window-removed signal disconnected.");
        
        this._settings = null;
        console.log("ResizerableExtension: Settings nullified. DISABLE method finished.");
    }

    _syncKeybindings() {
        const maximizeShortcut = this._settings.get_strv('key-maximize');
        const resizeShortcut = this._settings.get_strv('key-resize');
        
        this._settings.set_strv('resizerable-maximize-window', maximizeShortcut);
        this._settings.set_strv('resizerable-resize-window', resizeShortcut);
        
        this._updateKeybindings();
    }

    _updateKeybindings() {
        this._removeKeybindings();
        
        const maximizeShortcut = this._settings.get_strv('resizerable-maximize-window');
        const resizeShortcut = this._settings.get_strv('resizerable-resize-window');
        
        try {
            if (maximizeShortcut.length > 0 && maximizeShortcut[0] !== '') {
                this._maximizeBinding = Main.wm.addKeybinding(
                    'resizerable-maximize-window',
                    this._settings,
                    Meta.KeyBindingFlags.NONE,
                    Shell.ActionMode.NORMAL,
                    () => this._maximizeWindow()
                );
                if (!this._maximizeBinding) {
                    console.warn('Failed to bind maximize shortcut:', maximizeShortcut[0]);
                }
            }
            
            if (resizeShortcut.length > 0 && resizeShortcut[0] !== '') {
                this._resizeBinding = Main.wm.addKeybinding(
                    'resizerable-resize-window',
                    this._settings,
                    Meta.KeyBindingFlags.NONE,
                    Shell.ActionMode.NORMAL,
                    () => this._resizeWindow()
                );
                if (!this._resizeBinding) {
                    console.warn('Failed to bind resize shortcut:', resizeShortcut[0]);
                }
            }
        } catch (error) {
            console.error('Error setting up keybindings:', error);
            this._settings.set_strv('key-maximize', []);
            this._settings.set_strv('key-resize', []);
            this._settings.set_strv('resizerable-maximize-window', []);
            this._settings.set_strv('resizerable-resize-window', []);
        }
    }

    _removeKeybindings() {
        try {
            if (this._maximizeBinding) {
                Main.wm.removeKeybinding('resizerable-maximize-window');
                this._maximizeBinding = null;
            }
            
            if (this._resizeBinding) {
                Main.wm.removeKeybinding('resizerable-resize-window');
                this._resizeBinding = null;
            }
        } catch (error) {
            console.error('Error removing keybindings:', error);
            this._maximizeBinding = null;
            this._resizeBinding = null;
        }
    }

    _maximizeWindow() {
        const window = global.display.get_focus_window();
        if (window && window.can_maximize()) {
            window.maximize(Meta.MaximizeFlags.BOTH);
        }
    }

    _resizeWindow() {
        console.log("ResizerableExtension: _resizeWindow CALLED (from shortcut)");
        if (!this._settings) {
            console.error("ResizerableExtension: _settings IS NULL in _resizeWindow!");
            return;
        }
        console.log("ResizerableExtension: _settings in _resizeWindow is valid.");

        const window = global.display.get_focus_window();
        if (!window) {
            console.warn("ResizerableExtension: _resizeWindow (shortcut) - No focused window.");
            return;
        }
        this._resizeWindowToMargins(window); // Use the new helper
    }

    _showConfirmDialog(window) {
        let dialog = new ModalDialog({
            styleClass: 'modal-dialog-resizerable'
        });

        let content = new St.BoxLayout({ vertical: true, style_class: 'modal-dialog-content' });
        dialog.contentLayout.add_child(content);

        let message = new St.Label({ text: `Minimize '${window.get_title()}'?` });
        content.add_child(message);

        dialog.addButton({
            label: "Yes",
            action: () => {
                console.log("ResizerableExtension: Dialog - Yes clicked. Window remains minimized (or was already).");
                dialog.close();
            },
            key: Clutter.KEY_Y
        });

        dialog.addButton({
            label: "No",
            action: () => {
                console.log("ResizerableExtension: Dialog - No clicked. Unminimizing window.");
                window.unminimize(global.get_current_time());
                dialog.close();
            },
            key: Clutter.KEY_N 
        });
        
        console.log("ResizerableExtension: Opening confirmation dialog.");
        dialog.open();
    }
} 