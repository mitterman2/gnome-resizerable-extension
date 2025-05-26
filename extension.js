import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

export default class ResizeableExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settings = null;
        this._maximizeBinding = null;
        this._resizeBinding = null;
    }

    enable() {
        this._settings = this.getSettings();
        
        // Connect to settings changes to update keybindings
        this._settingsConnections = [
            this._settings.connect('changed::key-maximize', () => this._syncKeybindings()),
            this._settings.connect('changed::key-resize', () => this._syncKeybindings())
        ];
        
        this._syncKeybindings();
    }

    disable() {
        // Disconnect settings
        if (this._settingsConnections) {
            this._settingsConnections.forEach(id => this._settings.disconnect(id));
            this._settingsConnections = null;
        }
        
        // Remove keybindings
        this._removeKeybindings();
        
        this._settings = null;
    }

    _syncKeybindings() {
        // Sync legacy keys to proper keybinding keys
        const maximizeShortcut = this._settings.get_strv('key-maximize');
        const resizeShortcut = this._settings.get_strv('key-resize');
        
        this._settings.set_strv('resizerable-maximize-window', maximizeShortcut);
        this._settings.set_strv('resizerable-resize-window', resizeShortcut);
        
        this._updateKeybindings();
    }

    _updateKeybindings() {
        // Remove existing bindings
        this._removeKeybindings();
        
        // Add new bindings if shortcuts are set
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
            // Clear problematic shortcuts
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
        const window = global.display.get_focus_window();
        if (!window) return;

        // Get the monitor containing the window
        const monitorIndex = window.get_monitor();
        const monitor = Main.layoutManager.monitors[monitorIndex];
        
        if (!monitor) return;

        // Get margin settings
        const marginLeft = this._settings.get_double('margin-left');
        const marginRight = this._settings.get_double('margin-right');
        const marginTop = this._settings.get_double('margin-top');
        const marginBottom = this._settings.get_double('margin-bottom');

        // Calculate new window dimensions
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
        
        const newX = workArea.x + Math.round(workArea.width * marginLeft);
        const newY = workArea.y + Math.round(workArea.height * marginTop);
        const newWidth = Math.round(workArea.width * (1 - marginLeft - marginRight));
        const newHeight = Math.round(workArea.height * (1 - marginTop - marginBottom));

        // Ensure minimum window size
        const minWidth = Math.max(newWidth, 100);
        const minHeight = Math.max(newHeight, 100);

        // Unmaximize the window first if it's maximized
        if (window.get_maximized()) {
            window.unmaximize(Meta.MaximizeFlags.BOTH);
        }

        // Move and resize the window
        window.move_resize_frame(false, newX, newY, minWidth, minHeight);
    }
} 