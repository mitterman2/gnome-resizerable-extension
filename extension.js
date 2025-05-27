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
        this._settings = null;
        this._maximizeBinding = null;
        this._resizeBinding = null;
        this._originalMinimize = null;
        this._smartMinimizeSignalId = null;
        this._settingsConnections = [];
        this._focusWindowNotifyMinimizedSignalId = null;
        this._cachedFocusWindow = null;
        this._windowSignalIds = new Map();
        this._windowCreatedSignalId = null;
        this._windowRemovedSignalId = null;
    }

    _resizeWindowToMargins(window) {
        if (!window || !this._settings) {
            return;
        }

        const monitorIndex = window.get_monitor();
        const monitor = Main.layoutManager.monitors[monitorIndex];
        
        if (!monitor) {
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

        window.move_resize_frame(true, newX, newY, newWidth, newHeight); // Pass true for user_op
    }

    _onWindowMinimizedStateChanged(window) {
        let windowTitle = "Unknown Window";
        try { windowTitle = window.get_title(); } catch(e) { /* Will be caught if title is inaccessible */ }

        if (window.minimized) { 
            if (this._settings && this._settings.get_boolean('smart-minimize')) {
                const currentRect = window.get_frame_rect();
                const currentWidth = currentRect.width;
                const currentHeight = currentRect.height;
                const currentArea = currentWidth * currentHeight;
                const monitorIndex = window.get_monitor();
                const monitor = Main.layoutManager.monitors[monitorIndex];
                if (!monitor) {
                    return; 
                }
                const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
                const marginLeft = this._settings.get_double('margin-left');
                const marginRight = this._settings.get_double('margin-right');
                const marginTop = this._settings.get_double('margin-top');
                const marginBottom = this._settings.get_double('margin-bottom');
                let targetWidth = Math.round(workArea.width * (1 - marginLeft - marginRight));
                let targetHeight = Math.round(workArea.height * (1 - marginTop - marginBottom));
                targetWidth = Math.max(targetWidth, 100);
                targetHeight = Math.max(targetHeight, 100);
                const targetArea = targetWidth * targetHeight;
                if (currentArea > targetArea) {
                    window.unminimize(global.get_current_time());
                    this._resizeWindowToMargins(window);
                } else {
                }
            }
        } else {
        }
    }

    _connectToWindowSignals(window) {
        let windowTitle = "Unknown Window";
        try { windowTitle = window.get_title(); } catch(e) { /* Will be caught if title is inaccessible */ }

        if (!window || typeof window.connect !== 'function') {
            return;
        }
        if (this._windowSignalIds.has(window.get_id())) {
            return;
        }
        
        try {
            const id = window.connect('notify::minimized', () => this._onWindowMinimizedStateChanged(window));
            if (id > 0) {
                this._windowSignalIds.set(window.get_id(), { windowObj: window, signalId: id });
            } else {
            }
        } catch (e) {
        }
    }

    _disconnectFromWindowSignals(windowId) {
        if (this._windowSignalIds.has(windowId)) {
            const { windowObj, signalId } = this._windowSignalIds.get(windowId);
            let title = "Unknown Window";
            try { title = windowObj.get_title(); } catch(e) {/* Already disconnected or invalid */}
            try {
                 windowObj.disconnect(signalId);
            } catch (e) {
            }
            this._windowSignalIds.delete(windowId);
        }
    }

    enable() {
        this._settings = this.getSettings();
        if (!this._settings) {
            return;
        }

        this._settingsConnections = [
            this._settings.connect('changed::key-maximize', () => this._syncKeybindings()),
            this._settings.connect('changed::key-resize', () => this._resizeWindow())
        ];
        this._syncKeybindings();

        this._smartMinimizeSignalId = this._settings.connect('changed::smart-minimize', () => {
            const currentSmartMinimizeSetting = this._settings.get_boolean('smart-minimize');
        });

        let windowActors = global.get_window_actors();
        windowActors.forEach(actor => {
            if (actor) {
                const metaWindow = actor.get_meta_window();
                if (metaWindow) {
                    this._connectToWindowSignals(metaWindow);
                } else {
                }
            }
        });

        if (global.display && typeof global.display.connect === 'function') {
            try {
                this._windowCreatedSignalId = global.display.connect('window-created', (display, window) => {
                    let windowTitle = "Unknown (newly created)";
                    try { windowTitle = window.get_title(); } catch(e) { /* Ignore */ }
                    this._connectToWindowSignals(window);
                });
                if (this._windowCreatedSignalId > 0) {
                } else {
                }
            } catch (e) {
            }
        } else {
        }

        if (global.display && typeof global.display.connect === 'function') {
            try {
                this._windowRemovedSignalId = global.display.connect('window-removed', (display, window) => {
                    let windowTitle = "Unknown (removed)";
                    try { windowTitle = window.get_title(); } catch(e) { /* Might already be destroyed */ }
                    this._disconnectFromWindowSignals(window.get_id());
                });
                 if (this._windowRemovedSignalId > 0) {
                } else {
                }
            } catch (e) {
            }
        } else {
        }
    }

    disable() {
        if (this._settingsConnections) {
            this._settingsConnections.forEach(id => {
                if (this._settings) { this._settings.disconnect(id); }
            });
            this._settingsConnections = null;
        }

        if (this._smartMinimizeSignalId) {
            if (this._settings) { this._settings.disconnect(this._smartMinimizeSignalId); }
            this._smartMinimizeSignalId = null;
        }
        
        this._removeKeybindings();

        for (const windowId of this._windowSignalIds.keys()) {
            this._disconnectFromWindowSignals(windowId);
        }
        this._windowSignalIds.clear();

        if (this._windowCreatedSignalId && global.display && typeof global.display.disconnect === 'function') {
            try { global.display.disconnect(this._windowCreatedSignalId); } catch(e) { }
        }
        this._windowCreatedSignalId = null;

        if (this._windowRemovedSignalId && global.display && typeof global.display.disconnect === 'function') {
            try { global.display.disconnect(this._windowRemovedSignalId); } catch(e) { }
        }
        this._windowRemovedSignalId = null;
        
        this._settings = null;
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
                }
            }
        } catch (error) {
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
        if (!this._settings) {
            return;
        }
        const currentRect = global.display.get_focus_window().get_frame_rect();
        const currentWidth = currentRect.width;
        const currentHeight = currentRect.height;
        const currentArea = currentWidth * currentHeight;
        const monitorIndex = global.display.get_focus_window().get_monitor();
        const monitor = Main.layoutManager.monitors[monitorIndex];
        if (!monitor) {
            this._resizeWindowToMargins(global.display.get_focus_window());
            return;
        }
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        const marginLeft = this._settings.get_double('margin-left');
        const marginRight = this._settings.get_double('margin-right');
        const marginTop = this._settings.get_double('margin-top');
        const marginBottom = this._settings.get_double('margin-bottom');
        let targetWidth = Math.round(workArea.width * (1 - marginLeft - marginRight));
        let targetHeight = Math.round(workArea.height * (1 - marginTop - marginBottom));
        targetWidth = Math.max(targetWidth, 100); 
        targetHeight = Math.max(targetHeight, 100);
        const targetArea = targetWidth * targetHeight;
        if (currentArea > targetArea) {
            this._resizeWindowToMargins(global.display.get_focus_window());
        } else {
            global.display.get_focus_window().minimize(); 
        }
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
                dialog.close();
            },
            key: Clutter.KEY_Y
        });

        dialog.addButton({
            label: "No",
            action: () => {
                window.unminimize(global.get_current_time());
                dialog.close();
            },
            key: Clutter.KEY_N 
        });
        
        dialog.open();
    }
} 