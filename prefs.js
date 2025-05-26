import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ResizeablePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        
        // Create main page
        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'applications-system-symbolic',
        });
        window.add(page);

        // Margins group
        const marginsGroup = new Adw.PreferencesGroup({
            title: _('Window Margins'),
            description: _('Configure margins as percentages (0-100%) for the resize function'),
        });
        page.add(marginsGroup);

        // Create margin controls
        this._createMarginRow(marginsGroup, settings, 'margin-left', _('Left Margin'));
        this._createMarginRow(marginsGroup, settings, 'margin-right', _('Right Margin'));
        this._createMarginRow(marginsGroup, settings, 'margin-top', _('Top Margin'));
        this._createMarginRow(marginsGroup, settings, 'margin-bottom', _('Bottom Margin'));

        // Keyboard shortcuts group
        const shortcutsGroup = new Adw.PreferencesGroup({
            title: _('Keyboard Shortcuts'),
            description: _('Configure keyboard shortcuts for window actions'),
        });
        page.add(shortcutsGroup);

        // Create shortcut controls
        this._createShortcutRow(shortcutsGroup, settings, 'key-maximize', _('Maximize Window'));
        this._createShortcutRow(shortcutsGroup, settings, 'key-resize', _('Resize Window'));

        // Reset group
        const resetGroup = new Adw.PreferencesGroup({
            title: _('Reset'),
        });
        page.add(resetGroup);

        const resetRow = new Adw.ActionRow({
            title: _('Reset to Defaults'),
            subtitle: _('Reset all settings to their default values'),
        });

        const resetButton = new Gtk.Button({
            label: _('Reset'),
            css_classes: ['destructive-action'],
            valign: Gtk.Align.CENTER,
        });

        resetButton.connect('clicked', () => {
            this._resetToDefaults(settings);
        });

        resetRow.add_suffix(resetButton);
        resetGroup.add(resetRow);
    }

    _createMarginRow(group, settings, key, title) {
        const row = new Adw.ActionRow({
            title: title,
        });

        const spinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                page_increment: 10,
            }),
            digits: 0,
            valign: Gtk.Align.CENTER,
        });

        // Convert from fraction (0.0-1.0) to percentage (0-100)
        const currentValue = settings.get_double(key) * 100;
        spinButton.set_value(currentValue);

        spinButton.connect('value-changed', () => {
            const percentage = spinButton.get_value();
            const fraction = percentage / 100.0;
            settings.set_double(key, fraction);
        });

        // Listen for external changes
        settings.connect(`changed::${key}`, () => {
            const newValue = settings.get_double(key) * 100;
            if (Math.abs(spinButton.get_value() - newValue) > 0.1) {
                spinButton.set_value(newValue);
            }
        });

        const suffix = new Gtk.Label({
            label: '%',
            valign: Gtk.Align.CENTER,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            valign: Gtk.Align.CENTER,
        });
        box.append(spinButton);
        box.append(suffix);

        row.add_suffix(box);
        group.add(row);
    }

    _createShortcutRow(group, settings, key, title) {
        const row = new Adw.ActionRow({
            title: title,
        });

        const shortcutLabel = new Gtk.ShortcutLabel({
            valign: Gtk.Align.CENTER,
        });

        const button = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            has_frame: true,
            css_classes: ['flat'],
        });
        button.set_child(shortcutLabel);

        // Update display
        const updateShortcutDisplay = () => {
            const shortcuts = settings.get_strv(key);
            if (shortcuts.length > 0) {
                shortcutLabel.set_accelerator(shortcuts[0]);
                button.add_css_class('accent');
            } else {
                shortcutLabel.set_accelerator('');
                button.remove_css_class('accent');
                // Set placeholder text when no shortcut is set
                shortcutLabel.set_label(_('Click to set shortcut'));
            }
        };

        updateShortcutDisplay();

        // Listen for changes
        settings.connect(`changed::${key}`, updateShortcutDisplay);

        button.connect('clicked', () => {
            console.log(`Button clicked for ${title}`);
            this._showShortcutDialog(button, settings, key, title, updateShortcutDisplay);
        });

        row.add_suffix(button);
        group.add(row);
    }

    _showShortcutDialog(parent, settings, key, title, callback) {
        const dialog = new Gtk.Dialog({
            title: _('Set Shortcut'),
            transient_for: parent.get_root(),
            modal: true,
            use_header_bar: 1,
            default_width: 400,
            default_height: 200,
        });

        const contentArea = dialog.get_content_area();

        const content = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 20,
            margin_top: 20,
            margin_bottom: 20,
            margin_start: 20,
            margin_end: 20,
        });
        contentArea.append(content);

        const label = new Gtk.Label({
            label: _(`Press a key combination for "${title}"`),
            wrap: true,
            justify: Gtk.Justification.CENTER,
        });
        content.append(label);

        const shortcutDisplay = new Gtk.Label({
            label: _('Waiting for key combination...'),
            css_classes: ['title-2'],
            wrap: true,
            justify: Gtk.Justification.CENTER,
        });
        content.append(shortcutDisplay);

        const instructionLabel = new Gtk.Label({
            label: _('Press Escape to cancel • Press Backspace to clear'),
            css_classes: ['dim-label'],
            wrap: true,
            justify: Gtk.Justification.CENTER,
        });
        content.append(instructionLabel);

        let capturedShortcut = null;
        let isCapturing = true;

        // Use a more aggressive approach to capture keys
        const eventController = new Gtk.EventControllerKey();
        dialog.add_controller(eventController);

        eventController.connect('key-pressed', (controller, keyval, keycode, state) => {
            if (!isCapturing) return false;

            // Get the clean modifier mask
            const mask = state & Gtk.accelerator_get_default_mod_mask();
            
            console.log(`Captured: keyval=${keyval}, keycode=${keycode}, state=${state}, mask=${mask}`);
            console.log(`Key name: ${Gdk.keyval_name(keyval)}`);

            if (keyval === Gdk.KEY_Escape) {
                dialog.close();
                return true;
            }

            if (keyval === Gdk.KEY_BackSpace || keyval === Gdk.KEY_Delete) {
                capturedShortcut = null;
                shortcutDisplay.set_label(_('Shortcut cleared - press Set to confirm'));
                isCapturing = false;
                return true;
            }

            // Accept any key combination with modifiers
            if (mask !== 0 && Gtk.accelerator_valid(keyval, mask)) {
                const accelerator = Gtk.accelerator_name(keyval, mask);
                capturedShortcut = accelerator;
                
                // Check for conflicts
                const conflict = this._checkShortcutConflict(accelerator);
                if (conflict) {
                    shortcutDisplay.set_label(_(`${Gtk.accelerator_get_label(keyval, mask)}\n⚠️ Conflicts with: ${conflict}`));
                    shortcutDisplay.add_css_class('warning');
                } else {
                    shortcutDisplay.set_label(_(`${Gtk.accelerator_get_label(keyval, mask)}\n✓ Available`));
                    shortcutDisplay.remove_css_class('warning');
                }
                isCapturing = false;
                return true;
            }

            // Show message for keys without modifiers
            if (mask === 0) {
                shortcutDisplay.set_label(_('Please use a modifier key (Ctrl, Alt, Super)'));
                return true;
            }

            return false;
        });

        // Add dialog buttons
        dialog.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
        const setButton = dialog.add_button(_('Set'), Gtk.ResponseType.ACCEPT);
        setButton.add_css_class('suggested-action');

        dialog.connect('response', (dialog, response) => {
            if (response === Gtk.ResponseType.ACCEPT) {
                if (capturedShortcut === null) {
                    // Clear shortcut
                    settings.set_strv(key, []);
                    callback();
                } else {
                    // Check for conflicts and handle them
                    const conflict = this._checkShortcutConflict(capturedShortcut);
                    if (conflict) {
                        this._showConflictDialog(capturedShortcut, conflict, () => {
                            this._clearConflictingShortcut(capturedShortcut);
                            settings.set_strv(key, [capturedShortcut]);
                            callback();
                        }, () => {
                            // User cancelled, don't close dialog
                        });
                        return; // Don't close the dialog yet
                    } else {
                        settings.set_strv(key, [capturedShortcut]);
                        callback();
                    }
                }
            }
            dialog.close();
        });

        // Add CSS for warning style
        const cssProvider = new Gtk.CssProvider();
        const cssData = `
            .warning {
                color: #f57c00;
            }
        `;
        cssProvider.load_from_data(cssData, cssData.length);
        shortcutDisplay.get_style_context().add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        dialog.present();
    }

    _showConflictDialog(shortcut, conflict, onConfirm, onCancel) {
        const dialog = new Gtk.MessageDialog({
            modal: true,
            message_type: Gtk.MessageType.QUESTION,
            buttons: Gtk.ButtonsType.NONE,
            text: _('Replace Existing Shortcut?'),
            secondary_text: _(`${shortcut} is currently used by:\n${conflict}\n\nReplacing it will disable that function and assign the shortcut to Resizerable instead.`),
        });

        dialog.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
        const replaceButton = dialog.add_button(_('Replace & Use'), Gtk.ResponseType.YES);
        replaceButton.add_css_class('destructive-action');

        dialog.connect('response', (dialog, response) => {
            if (response === Gtk.ResponseType.YES) {
                onConfirm();
            } else {
                onCancel();
            }
            dialog.close();
        });

        dialog.present();
    }

    _checkShortcutConflict(accelerator) {
        try {
            // Check GNOME Shell built-in shortcuts
            const shellSettings = new Gio.Settings({schema: 'org.gnome.shell.keybindings'});
            const shellKeys = shellSettings.list_keys();
            
            for (const shellKey of shellKeys) {
                const shortcuts = shellSettings.get_strv(shellKey);
                if (shortcuts.includes(accelerator)) {
                    return `GNOME Shell: ${shellKey.replace(/-/g, ' ')}`;
                }
            }

            // Check desktop/WM shortcuts
            const wmSettings = new Gio.Settings({schema: 'org.gnome.desktop.wm.keybindings'});
            const wmKeys = wmSettings.list_keys();
            
            for (const wmKey of wmKeys) {
                const shortcuts = wmSettings.get_strv(wmKey);
                if (shortcuts.includes(accelerator)) {
                    return `Window Manager: ${wmKey.replace(/-/g, ' ')}`;
                }
            }

            // Check media keys
            try {
                const mediaSettings = new Gio.Settings({schema: 'org.gnome.settings-daemon.plugins.media-keys'});
                const mediaKeys = mediaSettings.list_keys();
                
                for (const mediaKey of mediaKeys) {
                    if (mediaKey.endsWith('-static')) continue;
                    try {
                        const shortcuts = mediaSettings.get_strv(mediaKey);
                        if (shortcuts.includes(accelerator)) {
                            return `Media Keys: ${mediaKey.replace(/-/g, ' ')}`;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            } catch (e) {
                // Media keys schema might not be available
            }

            return null; // No conflict found
        } catch (error) {
            console.warn('Error checking shortcut conflicts:', error);
            return null;
        }
    }

    _clearConflictingShortcut(accelerator) {
        try {
            // Clear from GNOME Shell shortcuts
            const shellSettings = new Gio.Settings({schema: 'org.gnome.shell.keybindings'});
            const shellKeys = shellSettings.list_keys();
            
            for (const shellKey of shellKeys) {
                const shortcuts = shellSettings.get_strv(shellKey);
                if (shortcuts.includes(accelerator)) {
                    const newShortcuts = shortcuts.filter(s => s !== accelerator);
                    shellSettings.set_strv(shellKey, newShortcuts);
                    console.log(`Cleared shortcut from GNOME Shell: ${shellKey}`);
                }
            }

            // Clear from WM shortcuts
            const wmSettings = new Gio.Settings({schema: 'org.gnome.desktop.wm.keybindings'});
            const wmKeys = wmSettings.list_keys();
            
            for (const wmKey of wmKeys) {
                const shortcuts = wmSettings.get_strv(wmKey);
                if (shortcuts.includes(accelerator)) {
                    const newShortcuts = shortcuts.filter(s => s !== accelerator);
                    wmSettings.set_strv(wmKey, newShortcuts);
                    console.log(`Cleared shortcut from Window Manager: ${wmKey}`);
                }
            }

            // Clear from media keys
            try {
                const mediaSettings = new Gio.Settings({schema: 'org.gnome.settings-daemon.plugins.media-keys'});
                const mediaKeys = mediaSettings.list_keys();
                
                for (const mediaKey of mediaKeys) {
                    if (mediaKey.endsWith('-static')) continue;
                    try {
                        const shortcuts = mediaSettings.get_strv(mediaKey);
                        if (shortcuts.includes(accelerator)) {
                            const newShortcuts = shortcuts.filter(s => s !== accelerator);
                            mediaSettings.set_strv(mediaKey, newShortcuts);
                            console.log(`Cleared shortcut from Media Keys: ${mediaKey}`);
                        }
                    } catch (e) {
                        continue;
                    }
                }
            } catch (e) {
                // Media keys schema might not be available
            }

        } catch (error) {
            console.error('Error clearing conflicting shortcuts:', error);
        }
    }

    _resetToDefaults(settings) {
        // Reset margins to 20% (0.2)
        settings.set_double('margin-left', 0.2);
        settings.set_double('margin-right', 0.2);
        settings.set_double('margin-top', 0.2);
        settings.set_double('margin-bottom', 0.2);

        // Clear keyboard shortcuts
        settings.set_strv('key-maximize', []);
        settings.set_strv('key-resize', []);
    }
} 