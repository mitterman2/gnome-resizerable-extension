# Resizerable - GNOME Shell Extension

A GNOME Shell extension that provides keyboard shortcuts to maximize windows or resize them with configurable margins.

## Features

- **Maximize Window**: Quickly maximize the active window
- **Resize with Margins**: Resize the active window to fit in the center of the screen with configurable margins
- **Configurable Margins**: Set individual margins for left, right, top, and bottom (0-100%)
- **Custom Keyboard Shortcuts**: Assign your own keyboard shortcuts for both actions
- **Reset to Defaults**: Easily reset all settings to default values
- **Multi-monitor Support**: Works correctly across multiple monitors

## Default Settings

- **Margins**: 20% on all sides (window occupies center 60% of screen)
- **Keyboard Shortcuts**: None assigned by default

## Installation

### Local Development/Testing

1. Copy the extension to your local extensions directory:
   ```bash
   cp -r resizerable@home.lan ~/.local/share/gnome-shell/extensions/
   ```

2. Restart GNOME Shell:
   - On X11: Press `Alt+F2`, type `r`, and press Enter
   - On Wayland: Log out and log back in

3. Enable the extension:
   ```bash
   gnome-extensions enable resizerable@home.lan
   ```

### Using GNOME Extensions App

1. Install the GNOME Extensions app if not already installed:
   ```bash
   sudo pacman -S gnome-shell-extensions  # Arch Linux
   # or
   sudo apt install gnome-shell-extensions  # Ubuntu/Debian
   ```

2. Open the Extensions app and enable "Resizerable"

## Configuration

### Using GNOME Extensions App

1. Open the Extensions app
2. Find "Resizerable" in the list
3. Click the settings/gear icon

### Using Command Line

```bash
gnome-extensions prefs resizerable@home.lan
```

### Settings Options

- **Window Margins**: Configure margins as percentages (0-100%) for left, right, top, and bottom
- **Keyboard Shortcuts**: 
  - Click on a shortcut button to assign a new key combination
  - Press Backspace or Delete to clear a shortcut
  - Press Escape to cancel shortcut assignment
- **Reset to Defaults**: Restore all settings to their default values

## Usage

1. **Set Keyboard Shortcuts**: Open the extension preferences and assign keyboard shortcuts for "Maximize Window" and "Resize Window"

2. **Maximize Window**: Press your assigned maximize shortcut to maximize the currently active window

3. **Resize Window**: Press your assigned resize shortcut to resize the currently active window to the center of the screen with your configured margins

## Examples

### Common Margin Configurations

- **Default (20% all sides)**: Window occupies center 60% of screen
- **Minimal margins (5% all sides)**: Window occupies center 90% of screen  
- **Asymmetric**: Different margins for each side (e.g., 10% left/right, 15% top/bottom)

### Suggested Keyboard Shortcuts

- **Maximize**: `Super+Up` or `Ctrl+Alt+M`
- **Resize**: `Super+Down` or `Ctrl+Alt+R`

## Compatibility

- **GNOME Shell**: 44, 45, 46, 47, 48+
- **Linux Distributions**: Arch Linux, Ubuntu, Fedora, openSUSE, and other distributions with GNOME
- **Display Servers**: Both X11 and Wayland

## Troubleshooting

### Extension Not Loading

1. Check if the extension is enabled:
   ```bash
   gnome-extensions list --enabled | grep resizerable
   ```

2. Check for errors in the logs:
   ```bash
   journalctl -f -o cat /usr/bin/gnome-shell
   ```

3. Restart GNOME Shell and try again

### Keyboard Shortcuts Not Working

1. Check if shortcuts are properly assigned in the extension preferences
2. Verify that the shortcuts don't conflict with system shortcuts
3. Try different key combinations

### Window Not Resizing Correctly

1. Verify margin settings are within valid range (0-100%)
2. Check if the window supports resizing (some dialogs may not)
3. Try with different applications

## Development

### File Structure

```
resizerable@home.lan/
├── extension.js          # Main extension logic
├── prefs.js             # Preferences UI
├── metadata.json        # Extension metadata
├── README.md           # This file
└── schemas/
    ├── gschemas.compiled                                    # Compiled schema
    └── org.gnome.shell.extensions.resizerable.gschema.xml  # Settings schema
```

### Building

The extension is ready to use as-is. If you modify the schema file, recompile it:

```bash
cd resizerable@home.lan/schemas
glib-compile-schemas .
```

## License

This extension is provided as-is for personal use and development. 