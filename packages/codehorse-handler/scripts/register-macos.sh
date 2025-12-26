#!/bin/bash

# CodeHorse URL Scheme Registration for macOS
# This script creates an AppleScript application for the codehorse:// URL scheme

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

# Remove old app if exists
rm -rf "$APP_PATH"

# Create the AppleScript source
SCRIPT_SOURCE="/tmp/codehorse-handler-source.applescript"

# Create a .command file (macOS double-click executable)
RUNNER_SCRIPT="$HOME/.codehorse/run-handler.command"
mkdir -p "$HOME/.codehorse"

cat > "$RUNNER_SCRIPT" << RUNNER_EOF
#!/bin/bash
# CodeHorse Handler Runner Script

# Change to home directory
cd ~

# Read URL from temp file
URL=\$(cat /tmp/codehorse-url.txt 2>/dev/null)

if [ -z "\$URL" ]; then
    echo "=========================================="
    echo "Error: No URL found"
    echo "=========================================="
    echo ""
    exec bash
fi

echo "=========================================="
echo "CodeHorse Handler"
echo "=========================================="
echo ""
echo "URL: \$URL"
echo ""

# Run the handler
$HANDLER_PATH "\$URL"

echo ""
echo "=========================================="
echo "Handler completed. Terminal will stay open."
echo "=========================================="
exec bash
RUNNER_EOF

chmod +x "$RUNNER_SCRIPT"

# Create AppleScript that writes URL to file and opens the .command file
cat > "$SCRIPT_SOURCE" << APPLESCRIPT_EOF
on open location theURL
    -- Log the received URL
    do shell script "echo \$(date): URL=" & quoted form of theURL & " >> /tmp/codehorse-handler.log"

    -- Write URL to temp file
    do shell script "echo " & quoted form of theURL & " > /tmp/codehorse-url.txt"

    -- Open the .command file (this opens in Terminal automatically)
    do shell script "open $RUNNER_SCRIPT"
end open location

on run
    display dialog "CodeHorse Handler is installed and ready to handle codehorse:// URLs." buttons {"OK"} default button "OK"
end run
APPLESCRIPT_EOF

# Compile to app
osacompile -o "$APP_PATH" "$SCRIPT_SOURCE"

# Now update the Info.plist to add URL scheme handling
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string 'CodeHorse URL'" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string 'codehorse'" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.codehorse.handler" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true

# Clean up
rm -f "$SCRIPT_SOURCE"

# Kill any running instance
pkill -f "CodeHorse Handler" 2>/dev/null || true

# Register the URL scheme
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_PATH"

# Also register with Launch Services database reset
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user 2>/dev/null || true
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_PATH"

echo "✅ URL scheme registered successfully!"
echo ""
echo "The codehorse:// URL scheme is now registered."
echo "App location: $APP_PATH"
echo ""
echo "Testing URL scheme..."
echo "  open 'codehorse://test'"
echo ""
echo "If the Terminal opens with the test URL, it's working!"
