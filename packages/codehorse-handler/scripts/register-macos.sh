#!/bin/bash

# CodeHorse URL Scheme Registration for macOS
# This script creates an AppleScript-based handler for the codehorse:// URL scheme

set -e

APP_NAME="CodeHorse Handler"
APP_PATH="$HOME/Applications/$APP_NAME.app"
HANDLER_PATH=$(which codehorse-handler 2>/dev/null || echo "")

if [ -z "$HANDLER_PATH" ]; then
    echo "Error: codehorse-handler not found in PATH"
    echo "Please install it first: npm install -g @codehorse/handler"
    exit 1
fi

echo "Creating $APP_NAME.app..."

# Create app bundle structure
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# Create Info.plist with URL scheme handler
cat > "$APP_PATH/Contents/Info.plist" << 'PLIST_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>handler</string>
    <key>CFBundleIdentifier</key>
    <string>com.codehorse.handler</string>
    <key>CFBundleName</key>
    <string>CodeHorse Handler</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>CodeHorse URL</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>codehorse</string>
            </array>
        </dict>
    </array>
    <key>LSBackgroundOnly</key>
    <false/>
</dict>
</plist>
PLIST_EOF

# Create the handler script that properly passes the URL
cat > "$APP_PATH/Contents/MacOS/handler" << HANDLER_EOF
#!/bin/bash
# Log the received URL for debugging
echo "Received URL: \$1" >> /tmp/codehorse-handler.log

# Run the handler in a new Terminal window
osascript <<APPLESCRIPT
tell application "Terminal"
    activate
    do script "$HANDLER_PATH '\$1'"
end tell
APPLESCRIPT
HANDLER_EOF

chmod +x "$APP_PATH/Contents/MacOS/handler"

# Register the URL scheme
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_PATH"

echo "✅ URL scheme registered successfully!"
echo ""
echo "The codehorse:// URL scheme is now registered."
echo "App location: $APP_PATH"
echo ""
echo "To test, run:"
echo "  open 'codehorse://test'"
